// Copyright (c) 2026 Andrey Syschikov
// SPDX-License-Identifier: MIT
// Portions derived from the AWS TEAM sample (MIT-0):
// https://github.com/aws-samples/iam-identity-center-team
/* eslint-disable jsx-a11y/anchor-is-valid */
import { signOut } from "aws-amplify/auth";
import TopNavigation from "@cloudscape-design/components/top-navigation";
import { useLocation } from "wouter";

function Header(props: { user: string }) {
  const [, navigate] = useLocation();

  async function handleSignOut() {
    try {
      await signOut();
    } catch (error) {
      console.log("error signing out");
    }
  }

  return (
    <TopNavigation
      identity={{
        href: "/",
        title: "Elevator",
        logo: {
          src: "/logo.svg",
          alt: "Elevator",
        },
      }}
      utilities={[
        {
          type: "button",
          text: "GitHub",
          href: "https://github.com/asyschikov/elevator-for-aws",
          external: true,
          externalIconAriaLabel: " (opens in a new tab)",
        },
        {
          type: "menu-dropdown",
          text: `${props.user}`,
          description: `${props.user}`,
          iconName: "user-profile",
          onItemClick: ({ detail }) => {
            if (detail.id === "signout") {
              handleSignOut().then(() => navigate("/"));
            }
          },
          items: [{ id: "signout", text: "Sign out" }],
        },
      ]}
      i18nStrings={{
        overflowMenuTriggerText: "More",
        overflowMenuTitleText: "All"
      }}
    />
  );
}

export default Header;
