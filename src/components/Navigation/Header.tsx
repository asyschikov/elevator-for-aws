// © 2021 Amazon Web Services, Inc. or its affiliates. All Rights Reserved.
// This AWS Content is provided subject to the terms of the AWS Customer Agreement available at
// http://aws.amazon.com/agreement or other written agreement between Customer and either
// Amazon Web Services, Inc. or Amazon Web Services EMEA SARL or both.
/* eslint-disable jsx-a11y/anchor-is-valid */
import React from "react";
import { signOut } from "aws-amplify/auth";
import TopNavigation from "@cloudscape-design/components/top-navigation";
import { useLocation } from "wouter";

function Header(props) {
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
