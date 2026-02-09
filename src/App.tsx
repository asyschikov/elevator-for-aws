// © 2023 Amazon Web Services, Inc. or its affiliates. All Rights Reserved.
// This AWS Content is provided subject to the terms of the AWS Customer Agreement available at
// http://aws.amazon.com/agreement or other written agreement between Customer and either
// Amazon Web Services, Inc. or Amazon Web Services EMEA SARL or both.
import React, { useEffect, useState } from "react";
import { signInWithRedirect, getCurrentUser, fetchAuthSession } from "aws-amplify/auth";
import { Hub } from "aws-amplify/utils";
import { Spin, Layout } from "antd";
import Nav from "./components/Navigation/Nav";
import home from "./media/Home.svg";
import "./index.css";
import { Button, SpaceBetween, Container, Box } from "@cloudscape-design/components";

const { Header, Content } = Layout;

// Amplify is configured in index.tsx

function Home({ loading }: { loading: boolean }) {
  const handleSignIn = () => {
    signInWithRedirect({ provider: { custom: "IDC" } });
  };

  return (
    <Layout className="site-layout">
      <Header className="site-layout-background" style={{ padding: 0 }} />
      <Content className="layout">
        <Spin spinning={loading} size="large">
          <div style={{ display: "flex", justifyContent: "center", padding: "40px" }}>
            <Container>
              <SpaceBetween size="l">
                <Box variant="h2">Elevator - Temporary Elevated Access Management</Box>
                <Box>Sign in to request or approve temporary elevated access.</Box>
                <Button variant="primary" onClick={handleSignIn}>
                  Sign In
                </Button>
              </SpaceBetween>
            </Container>
          </div>
          <img src={home} alt="Homepage" className="home" />
        </Spin>
      </Content>
    </Layout>
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
