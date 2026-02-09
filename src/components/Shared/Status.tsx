// © 2023 Amazon Web Services, Inc. or its affiliates. All Rights Reserved.
// This AWS Content is provided subject to the terms of the AWS Customer Agreement available at
// http://aws.amazon.com/agreement or other written agreement between Customer and either
// Amazon Web Services, Inc. or Amazon Web Services EMEA SARL or both.
import React from "react";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import type { StatusIndicatorProps } from "@cloudscape-design/components";

function Status(props: { status: string }) {
  let status_type: StatusIndicatorProps.Type = "info";

  if (props.status === "approved") {
    status_type = "success";
  } else if (
    props.status === "rejected" ||
    props.status === "revoked" 
  ) {
    status_type = "error";
  } else if (props.status === "pending" || props.status === "scheduled") {
    status_type = "pending";
  } else if (props.status === "error") {
    status_type = "warning";
  } else if (props.status === "in progress") {
    status_type = "in-progress";
  } else if (props.status === "expired") {
    status_type = "stopped";
  } else if (props.status === "cancelled" || props.status === "ended") { 
    status_type = "info";
  } else {
    status_type = "info";
  }

  return <StatusIndicator type={status_type}>{props.status}</StatusIndicator>;
}

export default Status;
