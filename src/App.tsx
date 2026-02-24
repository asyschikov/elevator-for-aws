// © 2023 Amazon Web Services, Inc. or its affiliates. All Rights Reserved.
// This AWS Content is provided subject to the terms of the AWS Customer Agreement available at
// http://aws.amazon.com/agreement or other written agreement between Customer and either
// Amazon Web Services, Inc. or Amazon Web Services EMEA SARL or both.
import React, { useEffect, useState } from "react";
import { signInWithRedirect, getCurrentUser, fetchAuthSession } from "aws-amplify/auth";
import { Hub } from "aws-amplify/utils";
import Spinner from "@cloudscape-design/components/spinner";
import Nav from "./components/Navigation/Nav";
import { Button, SpaceBetween, Box, Icon, Container } from "@cloudscape-design/components";

// Amplify is configured in index.tsx

function Home({ loading }: { loading: boolean }) {
  const handleSignIn = () => {
    signInWithRedirect({ provider: { custom: "IDC" } });
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%)' }}>
      {loading ? <Spinner size="large" /> : (
        <div style={{ maxWidth: 600, padding: '3rem 2rem', textAlign: 'center' }}>
          <SpaceBetween size="xxl" alignItems="center">
            {/* Hero */}
            <SpaceBetween size="l" alignItems="center">
              <Box variant="h1" fontSize="display-l" fontWeight="bold">
                AWS Elevator
              </Box>
              <Box variant="p" fontSize="heading-m" color="text-body-secondary" textAlign="center">
                Temporary Elevated Access Management
              </Box>
              {/* Features - columnar under subtitle */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.5rem', marginTop: '1rem', width: '100%' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', color: '#5f6b7a', fontSize: 13, textAlign: 'center' }}>
                  <Icon name="lock-private" size="medium" />
                  <span>Just-in-Time Access</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', color: '#5f6b7a', fontSize: 13, textAlign: 'center' }}>
                  <Icon name="check" size="medium" />
                  <span>Approval Workflow</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', color: '#5f6b7a', fontSize: 13, textAlign: 'center' }}>
                  <Icon name="contact" size="medium" />
                  <span>On-Call Support</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', color: '#5f6b7a', fontSize: 13, textAlign: 'center' }}>
                  <Icon name="search" size="medium" />
                  <span>Full Audit Trail</span>
                </div>
              </div>
            </SpaceBetween>

            {/* Sign In Card */}
            <Container>
              <SpaceBetween size="l" alignItems="center">
                <Box variant="p" textAlign="center">
                  Request and approve time-bound privileged access to your AWS accounts
                </Box>
                <Button variant="primary" onClick={handleSignIn}>
                  Sign in with AWS IdC
                </Button>
              </SpaceBetween>
            </Container>
          </SpaceBetween>
        </div>
      )}
    </div>
  );
}

interface AuthData {
  user: unknown;
  email: string | null;
  groups: string[] | null;
  cognitoGroups: string[];
  userId: string | null;
  groupIds: string[] | null;
}

const initialAuthData: AuthData = {
  user: null,
  email: null,
  groups: null,
  cognitoGroups: [],
  userId: null,
  groupIds: null,
};

function App() {
  const [authData, setAuthData] = useState<AuthData>(initialAuthData);
  const [loading, setLoading] = useState(true);

  const checkUser = async () => {
    try {
      const user = await getCurrentUser();
      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken;

      if (idToken) {
        const payload = idToken.payload;
        setAuthData({
          user,
          email: (payload.email as string) || null,
          cognitoGroups: (payload["cognito:groups"] as string[]) || [],
          userId: (payload.userId as string) || null,
          groupIds: ((payload.groupIds as string) || "").split(','),
          groups: ((payload.groups as string) || "").split(','),
        });
      }
      setLoading(false);
    } catch {
      console.log("Not signed in");
      setLoading(false);
    }
  };

  useEffect(() => {
    const hubListener = Hub.listen("auth", ({ payload }) => {
      console.log("Auth Hub event:", payload.event, payload);
      switch (payload.event) {
        case "signedIn":
          console.log("User signed in");
          checkUser();
          break;
        case "signedOut":
          console.log("User signed out");
          setAuthData(initialAuthData);
          setLoading(false);
          break;
        case "signInWithRedirect":
          console.log("OAuth redirect completed");
          checkUser();
          break;
        case "signInWithRedirect_failure":
          console.log("OAuth redirect failed:", payload);
          setLoading(false);
          break;
        case "tokenRefresh":
          console.log("Token refresh");
          checkUser();
          break;
        case "tokenRefresh_failure":
          console.log("Token refresh failed");
          break;
      }
    });

    checkUser();

    return () => hubListener();
  }, []);

  return (
    <div>
      {authData.groups ? (
        <Nav
          user={authData.user}
          email={authData.email}
          groupIds={authData.groupIds}
          userId={authData.userId}
          groups={authData.groups}
          cognitoGroups={authData.cognitoGroups}
        />
      ) : (
        <Home loading={loading} />
      )}
    </div>
  );
}

export default App;
