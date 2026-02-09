// © 2023 Amazon Web Services, Inc. or its affiliates. All Rights Reserved.
// This AWS Content is provided subject to the terms of the AWS Customer Agreement available at
// http://aws.amazon.com/agreement or other written agreement between Customer and either
// Amazon Web Services, Inc. or Amazon Web Services EMEA SARL or both.
import React, { useState } from "react";
import Box from "@cloudscape-design/components/box";
import { useHistory } from "react-router-dom";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import FormField from "@cloudscape-design/components/form-field";
import Grid from "@cloudscape-design/components/grid";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Select from "@cloudscape-design/components/select";
import Spinner from "@cloudscape-design/components/spinner";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import { useQuery } from "../../api/client";
import "../../media/landing-page.css";

const selections: Array<{ id: string; label: string }> = [
  { id: "1", label: "Create Elevator request" },
  { id: "2", label: "Approve Elevator request" },
];

function Landing(props) {
  const history = useHistory();
  const [selectedOption, setSelectedOption] = useState<{ id: string; label: string }>(selections[0]);

  const { data: onCallData, isLoading: onCallLoading, isError: onCallError } = useQuery(
    "get",
    "/on-call",
    {}
  );

  return (
    <Box margin={{ bottom: "l" }}>
      <div className="custom-home__header">
        <Box>
          <Grid
            gridDefinition={[
              { offset: { l: 2, xxs: 1 }, colspan: { l: 8, xxs: 10 } },
              {
                colspan: { xl: 6, l: 5, s: 6, xxs: 10 },
                offset: { l: 2, xxs: 1 },
              },
              {
                colspan: { xl: 2, l: 3, s: 4, xxs: 10 },
                offset: { s: 0, xxs: 1 },
              },
            ]}
          >
            <Box fontWeight="light" padding={{ top: "xs" }}>
              <span className="custom-home__category">
                Identity &amp; Access Management
              </span>
            </Box>
            <div className="custom-home__header-title">
              <Box
                variant="h1"
                fontWeight="light"
                padding="n"
                fontSize="heading-xl"
                color="inherit"
              >
                IAM Identity Center
              </Box>
              <Box
                fontWeight="normal"
                padding={{ bottom: "s" }}
                fontSize="display-l"
                color="inherit"
              >
                Temporary Elevated Access Management
              </Box>
              <Box variant="p" fontWeight="light">
                <span className="custom-home__header-sub-title">
                  Elevator is an automated,
                  approval-based workflow for managing time-bound elevated
                  access to your AWS environment
                </span>
              </Box>
            </div>
            <div className="custom-home__header-cta">
              <Container>
                <SpaceBetween size="xl">
                  <Box variant="h2" padding="n">
                    Elevator Requests
                  </Box>
                  {!onCallError && (
                    <Box>
                      <Box variant="h3" padding={{ bottom: "xs" }}>
                        Currently On-Call
                      </Box>
                      {onCallLoading ? (
                        <Spinner size="normal" />
                      ) : onCallData?.users && onCallData.users.length > 0 ? (
                        <SpaceBetween size="xs">
                          {onCallData.users.map((user, index) => (
                            <StatusIndicator key={index} type="success">
                              {user.name || user.email}
                            </StatusIndicator>
                          ))}
                        </SpaceBetween>
                      ) : (
                        <Box color="text-body-secondary">
                          No users currently on-call
                        </Box>
                      )}
                    </Box>
                  )}
                  <FormField stretch={true} label="Actions">
                    <Select
                      selectedAriaLabel="Selected"
                      options={selections}
                      selectedOption={selectedOption}
                      ariaRequired={true}
                      onChange={(e) =>
                        setSelectedOption(e.detail.selectedOption as { id: string; label: string })
                      }
                    />
                  </FormField>
                  <Button
                    href="#"
                    variant="primary"
                    onClick={() => {
                      if (selectedOption.id === "1") {
                        history.push("/requests/request");
                      } else if (selectedOption.id === "2") {
                        history.push("/approvals/approve");
                      }
                      props.setActiveHref("/sessions/active")
                    }}
                  >
                    Next steps
                  </Button>
                </SpaceBetween>
              </Container>
            </div>
          </Grid>
        </Box>
      </div>
    </Box>
  );
}
export default Landing;
