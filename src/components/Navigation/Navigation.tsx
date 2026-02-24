// © 2023 Amazon Web Services, Inc. or its affiliates. All Rights Reserved.
// This AWS Content is provided subject to the terms of the AWS Customer Agreement available at
// http://aws.amazon.com/agreement or other written agreement between Customer and either
// Amazon Web Services, Inc. or Amazon Web Services EMEA SARL or both.
import * as React from "react";
import SideNavigation, { SideNavigationProps } from "@cloudscape-design/components/side-navigation";
import Icon from "@cloudscape-design/components/icon";
import { useLocation } from "wouter";

function Navigation(props) {
  const [, navigate] = useLocation();

  const navItems: SideNavigationProps.Item[] = [
    {
      type: "section",
      text: "Requests",
      items: [
        { type: "link", text: "Create request", href: "/requests/request" },
        { type: "link", text: "My requests", href: "/requests/view" },
      ],
    },
    {
      type: "section",
      text: "Approvals",
      items: [
        {
          type: "link",
          text: "Approve requests",
          href: "/approvals/approve",
        },
        { type: "link", text: "My approvals", href: "/approvals/view" },
      ],
    },
    {
      type: "section",
      text: "Elevated access",
      items: [
        { type: "link", text: "Active access", href: "/sessions/active" },
        { type: "link", text: "Ended access", href: "/sessions/audit" },
      ],
    },
  ];

  if (props.group && props.group.includes("Auditors") && props.cognitoGroups?.includes("Auditors")) {
    navItems.push({
      type: "section",
      text: "Audit",
      items: [
        {
          type: "link",
          text: "Approvals",
          href: "/audit/approvals",
        },
        {
          type: "link",
          text: "Elevated access",
          href: "/audit/sessions",
        },
      ],
    });
  }

  if (props.group && props.group.includes("Admin") && props.cognitoGroups?.includes("Admin")) {
    navItems.push({
      type: "section",
      text: "Administration",
      items: [
        { type: "link", text: "Approver policy", href: "/admin/approvers" },
        { type: "link", text: "Eligibility policy", href: "/admin/policy" },
        { type: "link", text: "Integrations", href: "/admin/integrations" },
        { type: "link", text: "Settings", href: "/admin/settings", info: <Icon name="settings" />},
      ],
    });
  }

  return (
    <SideNavigation
      activeHref={props.active}
      items={navItems}
      onFollow={(event) => {
        if (!event.detail.external) {
          event.preventDefault();
          props.setActiveHref(event.detail.href);
          navigate(event.detail.href);
        }
      }}
    />
  );
}

export default Navigation;
