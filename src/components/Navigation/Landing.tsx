import React from "react";
import Box from "@cloudscape-design/components/box";
import { useLocation } from "wouter";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import Grid from "@cloudscape-design/components/grid";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Spinner from "@cloudscape-design/components/spinner";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import Icon from "@cloudscape-design/components/icon";
import { useQuery } from "../../api/client";
import "../../media/landing-page.css";

function Landing(props) {
  const [, navigate] = useLocation();

  const { data: onCallData, isLoading: onCallLoading, isError: onCallError } = useQuery(
    "get",
    "/on-call",
    {}
  );

  return (
    <Box padding={{ top: "xl", horizontal: "l" }}>
      <SpaceBetween size="xxl">
        {/* Hero Section */}
        <div className="landing-hero">
          <SpaceBetween size="l" alignItems="center">
            <Box variant="h1" fontSize="display-l" fontWeight="bold" textAlign="center">
              Elevator
            </Box>
            <Box variant="p" fontSize="heading-m" color="text-body-secondary" textAlign="center">
              Temporary Elevated Access Management for AWS
            </Box>
            <Box variant="p" textAlign="center" color="text-body-secondary">
              Request, approve, and audit time-bound privileged access to your AWS accounts
            </Box>
            <SpaceBetween size="s" direction="horizontal">
              <Button
                variant="primary"
                onClick={() => {
                  navigate("/requests/request");
                  props.setActiveHref("/requests/request");
                }}
              >
                Request Access
              </Button>
              <Button
                onClick={() => {
                  navigate("/approvals/approve");
                  props.setActiveHref("/approvals/approve");
                }}
              >
                Review Approvals
              </Button>
            </SpaceBetween>
          </SpaceBetween>
        </div>

        {/* On-Call Status */}
        {!onCallError && (
          <Box textAlign="center">
            <Container>
              <SpaceBetween size="s">
                <Box variant="h3">Currently On-Call</Box>
                {onCallLoading ? (
                  <Spinner size="normal" />
                ) : onCallData?.users && onCallData.users.length > 0 ? (
                  <SpaceBetween size="xs" direction="horizontal" alignItems="center">
                    <Box margin={{ left: "l", right: "l" }}>
                      {onCallData.users.map((user, index) => (
                        <StatusIndicator key={index} type="success">
                          {user.name || user.email}
                        </StatusIndicator>
                      ))}
                    </Box>
                  </SpaceBetween>
                ) : (
                  <Box color="text-body-secondary">No users currently on-call</Box>
                )}
              </SpaceBetween>
            </Container>
          </Box>
        )}

        {/* Features Grid */}
        <Grid
          gridDefinition={[
            { colspan: { default: 12, s: 6, m: 3 } },
            { colspan: { default: 12, s: 6, m: 3 } },
            { colspan: { default: 12, s: 6, m: 3 } },
            { colspan: { default: 12, s: 6, m: 3 } },
          ]}
        >
          <div style={{ height: '100%' }}>
            <Container fitHeight>
              <SpaceBetween size="s">
                <Box variant="h3">
                  <SpaceBetween size="xs" direction="horizontal" alignItems="center">
                    <Icon name="lock-private" />
                    <span>Just-in-Time Access</span>
                  </SpaceBetween>
                </Box>
                <Box variant="p" color="text-body-secondary">
                  Request temporary permissions only when needed. Access expires automatically.
                </Box>
              </SpaceBetween>
            </Container>
          </div>

          <div style={{ height: '100%' }}>
            <Container fitHeight>
              <SpaceBetween size="s">
                <Box variant="h3">
                  <SpaceBetween size="xs" direction="horizontal" alignItems="center">
                    <Icon name="check" />
                    <span>Approval Workflow</span>
                  </SpaceBetween>
                </Box>
                <Box variant="p" color="text-body-secondary">
                  Configurable approval policies per account or OU with auto-approve options.
                </Box>
              </SpaceBetween>
            </Container>
          </div>

          <div style={{ height: '100%' }}>
            <Container fitHeight>
              <SpaceBetween size="s">
                <Box variant="h3">
                  <SpaceBetween size="xs" direction="horizontal" alignItems="center">
                    <Icon name="contact" />
                    <span>On-Call Support</span>
                  </SpaceBetween>
                </Box>
                <Box variant="p" color="text-body-secondary">
                  Auto-approve requests for on-call engineers with integration support.
                </Box>
              </SpaceBetween>
            </Container>
          </div>

          <div style={{ height: '100%' }}>
            <Container fitHeight>
              <SpaceBetween size="s">
                <Box variant="h3">
                  <SpaceBetween size="xs" direction="horizontal" alignItems="center">
                    <Icon name="search" />
                    <span>Full Audit Trail</span>
                  </SpaceBetween>
                </Box>
                <Box variant="p" color="text-body-secondary">
                  Track all requests, approvals, and session activity with CloudTrail Lake.
                </Box>
              </SpaceBetween>
            </Container>
          </div>
        </Grid>
      </SpaceBetween>
    </Box>
  );
}

export default Landing;
