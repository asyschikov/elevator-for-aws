// Copyright (c) 2026 Andrey Syschikov
// SPDX-License-Identifier: MIT
// Portions derived from the AWS TEAM sample (MIT-0):
// https://github.com/aws-samples/iam-identity-center-team
import React from "react";
import { Box, SpaceBetween, ColumnLayout } from "@cloudscape-design/components";
import Status from "./Status";
import Timer from "../Sessions/Timer";

function convertAwsDateTime(awsDateTime) {
  // Parse AWS datetime string into a Date object
  const date = new Date(awsDateTime);
  // Format date in user-friendly format
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  };
  const userFriendlyFormat = date.toLocaleString('en-US', options);
  return userFriendlyFormat
}

function Details(props) {
  const ValueWithLabel = ({ label, children }) => (
    <div>
      <div>
        <Box color="inherit" fontSize="body-m">
          {label}
        </Box>
      </div>
      <div>{children}</div>
    </div>
  );

  const startTime = convertAwsDateTime(props.item.startTime)

  return (
    <SpaceBetween size="s">
      <ColumnLayout columns={3} variant="text-grid">
        <SpaceBetween size="l">
          <ValueWithLabel label="Requester" children={`${props.item.email}`} />
          <ValueWithLabel label="Status">
            <Status status={props.item.status} />
          </ValueWithLabel>
          <ValueWithLabel
            label="Justification"
            children={`${props.item.justification}`}
          />
        </SpaceBetween>
        <SpaceBetween size="l">
          <ValueWithLabel
            label="Account"
            children={`${props.item.accountName} (${props.item.accountId})`}
          />
          <ValueWithLabel label="Role" children={`${props.item.role}`} />
          <ValueWithLabel
            label="Ticket no"
            children={`${props.item.ticketNo}`}
          />
        </SpaceBetween>
        <SpaceBetween size="l">
          <ValueWithLabel
            label="Start time"
            children={`${startTime}`}
          />
          <ValueWithLabel
            label="Duration"
            children={`${props.item.duration} Hours`}
          />
          <Timer item={props.item} expiry={props.expiry}/>
        </SpaceBetween>
      </ColumnLayout>

      <div>
        {props.item.approver && (
          <div>
            <hr style={{ marginBottom: "10px", marginTop: "10px", border: "none", borderTop: "1px solid #e9ebed" }} />
            <ColumnLayout columns={3}>
              <SpaceBetween size="m">
                <ValueWithLabel
                  label="Approved by"
                  children={`${props.item.approver}`}
                />
                <ValueWithLabel
                  label="Comments"
                  children={`${props.item.comment}`}
                />
              </SpaceBetween>
            </ColumnLayout>
          </div>
        )}
      </div>
    </SpaceBetween>
  );
}

export default Details;
