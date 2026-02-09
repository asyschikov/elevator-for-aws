import React, { useState } from "react";
import {
  Box,
  Button,
  Header,
  SpaceBetween,
  Container,
  ColumnLayout,
  Textarea,
  FormField,
} from "@cloudscape-design/components";
import { useParams, useHistory } from "react-router-dom";
import { $api } from "../../api/client";
import Status from "../Shared/Status";
import "../../index.css";

const ValueWithLabel = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => (
  <div>
    <div className="headings">
      <Box color="inherit" fontSize="body-m">
        {label}
      </Box>
    </div>
    <div>{children}</div>
  </div>
);

interface ApprovalDetailProps {
  addNotification: (notifications: any[]) => void;
  setActiveHref: (href: string) => void;
  user: string;
}

function ApprovalDetail(props: ApprovalDetailProps) {
  const { id } = useParams<{ id: string }>();
  const history = useHistory();

  const requestQuery = $api.useQuery("get", "/requests/{request_id}", {
    params: { path: { request_id: id } },
  });

  const settingsQuery = $api.useQuery("get", "/settings");
  const commentRequired =
    (settingsQuery.data as { comments?: boolean } | undefined)?.comments ??
    true;

  const [action, setAction] = useState<string>("");
  const [comment, setComment] = useState("");
  const [commentError, setCommentError] = useState("");

  const actionMutation = $api.useMutation("put", "/requests/{request_id}", {
    onSuccess: (_, variables) => {
      requestQuery.refetch();
      setAction("");
      setComment("");
      props.addNotification([
        {
          type: "success",
          content: `Elevator request ${(variables.body as { status?: string })?.status}`,
          dismissible: true,
          onDismiss: () => props.addNotification([]),
        },
      ]);
    },
  });

  function handleAction() {
    if (
      (!comment && commentRequired) ||
      (comment && !/[\p{L}\p{N}]/u.test(comment[0]))
    ) {
      setCommentError(
        "Enter valid reason for approving or rejecting request"
      );
    } else {
      actionMutation.mutate({
        params: { path: { request_id: id } },
        body: { id, status: action, comment },
      });
    }
  }

  const item = requestQuery.data as Record<string, any> | undefined;

  if (requestQuery.isLoading) {
    return (
      <Container>
        <Box textAlign="center" padding="l">
          Loading request...
        </Box>
      </Container>
    );
  }

  if (!item) {
    return (
      <Container>
        <Box textAlign="center" padding="l">
          Request not found.
        </Box>
      </Container>
    );
  }

  const isPending = item.status === "pending";

  return (
    <div className="container">
      <Container
        header={
          <Header
            actions={
              <SpaceBetween size="s" direction="horizontal">
                <Button onClick={() => history.push("/approvals/approve")}>
                  Back to approvals
                </Button>
                {isPending && !action && (
                  <>
                    <Button onClick={() => setAction("approved")}>
                      Approve
                    </Button>
                    <Button onClick={() => setAction("rejected")}>
                      Reject
                    </Button>
                  </>
                )}
              </SpaceBetween>
            }
          >
            {action
              ? `${action === "approved" ? "Approve" : "Reject"} Request`
              : "Request Details"}
          </Header>
        }
      >
        <SpaceBetween size="l">
          <ColumnLayout columns={3} variant="text-grid">
            <SpaceBetween size="l">
              <ValueWithLabel label="Requester">
                {item.email}
              </ValueWithLabel>
              <ValueWithLabel label="Status">
                <Status status={item.status} />
              </ValueWithLabel>
            </SpaceBetween>
            <SpaceBetween size="l">
              <ValueWithLabel label="Account">
                {`${item.accountName} (${item.accountId})`}
              </ValueWithLabel>
              <ValueWithLabel label="Role">{item.role}</ValueWithLabel>
              <ValueWithLabel label="Ticket no">
                {item.ticketNo || "-"}
              </ValueWithLabel>
            </SpaceBetween>
            <SpaceBetween size="l">
              <ValueWithLabel label="Start time">
                {item.startTime}
              </ValueWithLabel>
              <ValueWithLabel label="Duration">
                {item.duration || item.time} hours
              </ValueWithLabel>
              <ValueWithLabel label="Justification">
                {item.justification}
              </ValueWithLabel>
            </SpaceBetween>
          </ColumnLayout>

          {action && (
            <>
              <FormField
                label="Comment"
                stretch
                description="Reason for approving or rejecting elevated access request"
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
              <SpaceBetween size="s" direction="horizontal">
                <Button
                  variant="link"
                  onClick={() => {
                    setAction("");
                    setComment("");
                    setCommentError("");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  loading={actionMutation.isPending}
                  onClick={handleAction}
                >
                  Confirm
                </Button>
              </SpaceBetween>
            </>
          )}
        </SpaceBetween>
      </Container>
    </div>
  );
}

export default ApprovalDetail;
