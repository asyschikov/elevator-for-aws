// Copyright (c) 2026 Andrey Syschikov
// SPDX-License-Identifier: MIT
// Portions derived from the AWS TEAM sample (MIT-0):
// https://github.com/aws-samples/iam-identity-center-team
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
