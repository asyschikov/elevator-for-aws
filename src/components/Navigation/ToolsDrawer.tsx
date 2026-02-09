// © 2023 Amazon Web Services, Inc. or its affiliates. All Rights Reserved.
// This AWS Content is provided subject to the terms of the AWS Customer Agreement available at
// http://aws.amazon.com/agreement or other written agreement between Customer and either
// Amazon Web Services, Inc. or Amazon Web Services EMEA SARL or both.
import * as React from "react";
import HelpPanel from "@cloudscape-design/components/help-panel";

function ToolsDrawer() {
  return (
    <HelpPanel header={<h2>About Elevator</h2>}>
      <div>
        <p>
          Elevator is an open source solution that integrates with AWS IAM Identity Center and allows you to manage and monitor time-bound elevated access to your multi-account AWS environment at scale.
        </p>
        <h4>Services used</h4>
        <ul>
          <li>AWS IAM Identity Center</li>
          <li>Amazon DynamoDB</li>
          <li>AWS Lambda</li>
          <li>Amazon Cognito</li>
          <li>AWS CloudTrail Lake</li>
        </ul>
        <h4>Benefits</h4>
        Elevator helps to:
        <ul>
          <li>
            Simplify cloud access management
          </li>
          <li>Reduce risk of breach or exposure</li>
          <li>Achieve regulatory and compliance requirements</li>
          <li>Improve the security of your AWS environment</li>
        </ul>
      </div>
    </HelpPanel>
  );
}

export default ToolsDrawer;