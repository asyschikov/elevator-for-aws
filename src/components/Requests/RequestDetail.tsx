import React from "react";
import {
  Box,
  Button,
  Header,
  SpaceBetween,
  Container,
  Modal,
} from "@cloudscape-design/components";
import { useParams, useLocation } from "wouter";
import { $api } from "../../api/client";
import Details from "../Shared/Details";

interface RequestDetailProps {
  addNotification: (notifications: any[]) => void;
  setActiveHref: (href: string) => void;
  user: string;
}

function RequestDetail(props: RequestDetailProps) {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();

  const requestQuery = $api.useQuery("get", "/requests/{request_id}", {
    params: { path: { request_id: id } },
  });

  const settingsQuery = $api.useQuery("get", "/settings");
  const expiry = parseInt(
    String(
      (settingsQuery.data as { expiry?: string | number } | undefined)
        ?.expiry ?? "3"
    )
  );

  const [cancelVisible, setCancelVisible] = React.useState(false);

  const cancelMutation = $api.useMutation("put", "/requests/{request_id}", {
    onSuccess: () => {
      requestQuery.refetch();
      setCancelVisible(false);
      props.addNotification([
        {
          type: "success",
          content: "Elevator request cancelled",
          dismissible: true,
          onDismiss: () => props.addNotification([]),
        },
      ]);
    },
  });

  function cancelRequest() {
    cancelMutation.mutate({
      params: { path: { request_id: id } },
      body: { id, status: "cancelled" },
    });
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

  return (
    <div>
      <Container
        header={
          <Header
            actions={
              <SpaceBetween size="s" direction="horizontal">
                <Button onClick={() => navigate("/requests/view")}>
                  Back to requests
                </Button>
                {item.status === "pending" && (
                  <Button
                    variant="primary"
                    onClick={() => setCancelVisible(true)}
                  >
                    Cancel request
                  </Button>
                )}
              </SpaceBetween>
            }
          >
            Request details
          </Header>
        }
      >
        <Details item={item} status={true} expiry={expiry} />
      </Container>

      <Modal
        onDismiss={() => setCancelVisible(false)}
        visible={cancelVisible}
        closeAriaLabel="Close modal"
        size="medium"
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setCancelVisible(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={cancelRequest}
                loading={cancelMutation.isPending}
              >
                Confirm
              </Button>
            </SpaceBetween>
          </Box>
        }
        header="Cancel Request"
      >
        Are you sure you want to cancel request?
      </Modal>
    </div>
  );
}

export default RequestDetail;
