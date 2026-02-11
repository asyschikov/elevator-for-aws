// © 2023 Amazon Web Services, Inc. or its affiliates. All Rights Reserved.
// This AWS Content is provided subject to the terms of the AWS Customer Agreement available at
// http://aws.amazon.com/agreement or other written agreement between Customer and either
// Amazon Web Services, Inc. or Amazon Web Services EMEA SARL or both.
import React, { useEffect, useState } from "react";
import { signInWithRedirect, getCurrentUser, fetchAuthSession } from "aws-amplify/auth";
import { Hub } from "aws-amplify/utils";
import { Spin } from "antd";
import Nav from "./components/Navigation/Nav";
import "./index.css";
import { Button, SpaceBetween, Box, Icon, Grid, Container } from "@cloudscape-design/components";

// Amplify is configured in index.tsx

function Home({ loading }: { loading: boolean }) {
  const handleSignIn = () => {
    signInWithRedirect({ provider: { custom: "IDC" } });
  };

  return (
    <div className="signin-page">
      <Spin spinning={loading} size="large">
        <div className="signin-content">
          <SpaceBetween size="xxl" alignItems="center">
            {/* Hero */}
            <SpaceBetween size="m" alignItems="center">
              <Box variant="h1" fontSize="display-l" fontWeight="bold">
                Elevator
              </Box>
              <Box variant="p" fontSize="heading-m" color="text-body-secondary" textAlign="center">
                Temporary Elevated Access Management
              </Box>
            </SpaceBetween>

            {/* Sign In Card */}
            <Container>
              <SpaceBetween size="l" alignItems="center">
                <Box variant="p" textAlign="center">
                  Request and approve time-bound privileged access to your AWS accounts
                </Box>
                <Button variant="primary" onClick={handleSignIn}>
                  Sign in with SSO
                </Button>
              </SpaceBetween>
            </Container>

            {/* Features */}
            <Grid
              gridDefinition={[
                { colspan: { default: 12, s: 4 } },
                { colspan: { default: 12, s: 4 } },
                { colspan: { default: 12, s: 4 } },
              ]}
            >
              <SpaceBetween size="xs" alignItems="center">
                <Icon name="lock-private" size="large" />
                <Box fontWeight="bold">Just-in-Time</Box>
                <Box variant="small" color="text-body-secondary" textAlign="center">
                  Access expires automatically
                </Box>
              </SpaceBetween>
              <SpaceBetween size="xs" alignItems="center">
                <Icon name="check" size="large" />
                <Box fontWeight="bold">Approval Workflow</Box>
                <Box variant="small" color="text-body-secondary" textAlign="center">
                  Configurable policies
                </Box>
              </SpaceBetween>
              <SpaceBetween size="xs" alignItems="center">
                <Icon name="search" size="large" />
                <Box fontWeight="bold">Full Audit Trail</Box>
                <Box variant="small" color="text-body-secondary" textAlign="center">
                  CloudTrail integration
                </Box>
              </SpaceBetween>
            </Grid>
          </SpaceBetween>
        </div>
      </Spin>
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
