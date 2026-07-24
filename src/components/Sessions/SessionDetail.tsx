// Copyright (c) 2026 Andrey Syschikov
// SPDX-License-Identifier: MIT
// Portions derived from the AWS TEAM sample (MIT-0):
// https://github.com/aws-samples/iam-identity-center-team
import React, { useState } from "react";
import {
  Box,
  Button,
  Header,
  SpaceBetween,
  Container,
  Modal,
  ColumnLayout,
  ExpandableSection,
  FormField,
  Textarea,
} from "@cloudscape-design/components";
import { useParams, useLocation } from "wouter";
import { $api } from "../../api/client";
import Status from "../Shared/Status";
import Logs from "./Logs";
import Timer from "./Timer";

interface SessionDetailProps {
  addNotification: (notifications: any[]) => void;
  setActiveHref: (href: string) => void;
  user: string;
}

interface SessionItem {
  id: string;
  email: string;
  username?: string;
  accountName: string;
  accountId: string;
  role: string;
  roleId?: string;
  startTime: string;
  endTime?: string;
  duration: string | number;
  justification: string;
  ticketNo?: string;
  status: string;
  approvers?: string[];
  approver?: string;
  approver_ids?: string[];
  comment?: string;
  queryId?: string;
}

function convertAwsDateTime(awsDateTime: string) {
  const date = new Date(awsDateTime);
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  };
  return date.toLocaleString('en-US', options);
}

function SessionDetail(props: SessionDetailProps) {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();

  const requestQuery = $api.useQuery("get", "/requests/{request_id}", {
    params: { path: { request_id: id } },
  });

  const settingsQuery = $api.useQuery("get", "/settings");
  const commentRequired = (settingsQuery.data as { comments?: boolean } | undefined)?.comments ?? true;

  const [revokeVisible, setRevokeVisible] = useState(false);
  const [comment, setComment] = useState("");
  const [commentError, setCommentError] = useState("");

  const revokeMutation = $api.useMutation("put", "/requests/{request_id}", {
    onSuccess: () => {
      requestQuery.refetch();
      setRevokeVisible(false);
      setComment("");
      props.addNotification([
        {
          type: "success",
          content: "Elevated access revoked",
          dismissible: true,
          onDismiss: () => props.addNotification([]),
        },
      ]);
    },
  });

  const item = requestQuery.data as unknown as SessionItem | undefined;

  function handleRevoke() {
    if ((!comment && commentRequired) || (comment && !(/[\p{L}\p{N}]/u.test(comment[0])))) {
      setCommentError("Enter valid reason for revoking elevated access");
    } else if (item) {
      revokeMutation.mutate({
        params: { path: { request_id: id } },
        body: {
          id: item.id,
          status: "revoked",
          revokeComment: comment,
        }
      });
    }
  }

  const canRevoke = item && (
    item.status === "scheduled" || item.status === "granted" || (item as any).sessionStatus === "in-progress"
  ) && (
    item.email === props.user || item.approvers?.includes(props.user)
  );

  const ValueWithLabel = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div>
      <div>
        <Box color="inherit" fontSize="body-m">
          {label}
        </Box>
      </div>
      <div>{children}</div>
    </div>
  );

  if (requestQuery.isLoading) {
    return (
      <Container>
        <Box textAlign="center" padding="l">
          Loading session...
        </Box>
      </Container>
    );
  }

  if (!item) {
    return (
      <Container>
        <Box textAlign="center" padding="l">
          Session not found.
        </Box>
      </Container>
    );
  }

  return (
    <div>
      <Container
        header={
          <Header
            actions={
              <SpaceBetween size="s" direction="horizontal">
                <Button onClick={() => navigate("/sessions/active")}>
                  Back to sessions
                </Button>
                {canRevoke && (
                  <Button
                    variant="primary"
                    onClick={() => setRevokeVisible(true)}
                  >
                    Revoke
                  </Button>
                )}
              </SpaceBetween>
            }
          >
            Session details
          </Header>
        }
      >
        <SpaceBetween size="s">
          <ColumnLayout columns={3} variant="text-grid">
            <SpaceBetween size="l">
              <ValueWithLabel label="Requester">
                {item.email}
              </ValueWithLabel>
              <ValueWithLabel label="Status">
                <Status status={item.status} />
              </ValueWithLabel>
              <ValueWithLabel label="Justification">
                {item.justification}
              </ValueWithLabel>
            </SpaceBetween>
            <SpaceBetween size="l">
              <ValueWithLabel label="Account">
                {`${item.accountName} (${item.accountId})`}
              </ValueWithLabel>
              <ValueWithLabel label="Role">
                {item.role}
              </ValueWithLabel>
              <ValueWithLabel label="TicketNo">
                {item.ticketNo || "-"}
              </ValueWithLabel>
            </SpaceBetween>
            <SpaceBetween size="l">
              <ValueWithLabel label="Start time">
                {convertAwsDateTime(item.startTime)}
              </ValueWithLabel>
              <ValueWithLabel label="Duration">
                {`${item.duration} Hours`}
              </ValueWithLabel>
              <Timer item={item} />
            </SpaceBetween>
          </ColumnLayout>

          {item.approver && (
            <>
              <hr style={{ marginBottom: "10px", marginTop: "10px", border: "none", borderTop: "1px solid #e9ebed" }} />
              <ColumnLayout columns={3}>
                <SpaceBetween size="m">
                  <ValueWithLabel label="Approved by">
                    {item.approver}
                  </ValueWithLabel>
                  <ValueWithLabel label="Comments">
                    {item.comment || "-"}
                  </ValueWithLabel>
                </SpaceBetween>
              </ColumnLayout>
            </>
          )}

          {(item.status === "ended" || item.status === "revoked" || item.status === "granted") && (
            <ExpandableSection
              variant="footer"
              header="Session activity logs"
              defaultExpanded={(item as any).sessionStatus === "finished"}
            >
              <Logs item={item} />
            </ExpandableSection>
          )}
        </SpaceBetween>
      </Container>

      <Modal
        onDismiss={() => {
          setRevokeVisible(false);
          setComment("");
          setCommentError("");
        }}
        visible={revokeVisible}
        closeAriaLabel="Close modal"
        size="medium"
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button
                variant="link"
                onClick={() => {
                  setRevokeVisible(false);
                  setComment("");
                  setCommentError("");
                }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleRevoke}
                loading={revokeMutation.isPending}
              >
                Confirm
              </Button>
            </SpaceBetween>
          </Box>
        }
        header="Revoke elevated access"
      >
        <FormField
          label="Revoke Comments"
          stretch
          description="Revoked elevated access prevents users from invoking new session. Active sessions might remain valid until session duration expires"
          errorText={commentError}
        >
          <Textarea
            onChange={({ detail }) => {
              setCommentError("");
              setComment(detail.value);
            }}
            value={comment}
          />
        </FormField>
      </Modal>
    </div>
  );
}

export default SessionDetail;
