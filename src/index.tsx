// Copyright (c) 2026 Andrey Syschikov
// SPDX-License-Identifier: MIT
// Portions derived from the AWS TEAM sample (MIT-0):
// https://github.com/aws-samples/iam-identity-center-team
import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import "@cloudscape-design/global-styles/index.css";
import { Amplify } from "aws-amplify";
import config from "./config.json";

const redirectUrl = `${window.location.origin}/`;

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: config.userPoolId,
      userPoolClientId: config.userPoolClientId,
      loginWith: {
        email: true,
        oauth: {
          domain: config.oauthDomain,
          scopes: ["email", "openid", "profile"],
          redirectSignIn: [redirectUrl],
          redirectSignOut: [redirectUrl],
          responseType: "code",
        },
      },
    },
  },
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
});

const container = document.getElementById("root");
const root = createRoot(container!);
root.render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
);
