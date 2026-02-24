// © 2023 Amazon Web Services, Inc. or its affiliates. All Rights Reserved.
// This AWS Content is provided subject to the terms of the AWS Customer Agreement available at
// http://aws.amazon.com/agreement or other written agreement between Customer and either
// Amazon Web Services, Inc. or Amazon Web Services EMEA SARL or both.
import React, { useState, useEffect } from "react";
import Box from "@cloudscape-design/components/box";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import Button from "@cloudscape-design/components/button";
import Select from "@cloudscape-design/components/select";
import {
  ContentLayout,
  Modal,
  Toggle,
  Form,
  FormField,
  Input,
  Spinner,
} from "@cloudscape-design/components";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import { $api } from "../../api/client";
import type { components } from "../../api/schema.d";

// Types from OpenAPI schema
type GroupInfo = components["schemas"]["GroupInfo"];
type SettingsItem = components["schemas"]["SettingsItem"];
type UpdateSettingsInput = components["schemas"]["UpdateSettingsInput"];

interface SettingsProps {
  addNotification: (notifications: any[]) => void;
  setActiveHref?: (href: string) => void;
  user?: string;
  group?: string[];
}

function Settings(props: SettingsProps) {
  // React Query hooks using $api.useQuery style with typed endpoints
  const groupsQuery = $api.useQuery("get", "/idc-groups");

  const settingsQuery = $api.useQuery("get", "/settings");

  // Mutation for updating settings using typed endpoint
  const updateMutation = $api.useMutation("put", "/settings", {
    onSuccess: () => {
      settingsQuery.refetch();
      setVisible(false);
      props.addNotification([
        {
          type: "success",
          content: "Elevator configuration saved successfully",
          dismissible: true,
          onDismiss: () => props.addNotification([]),
        },
      ]);
    },
  });

  // Derived data from queries - now properly typed
  const groups: GroupInfo[] = Array.isArray(groupsQuery.data) ? groupsQuery.data : [];
  const settingsData: SettingsItem | undefined = settingsQuery.data;

  // UI state for form fields
  const [duration, setDuration] = useState<string | null>(null);
  const [durationError, setDurationError] = useState("");
  const [expiry, setExpiry] = useState<string | null>(null);
  const [expiryError, setExpiryError] = useState("");
  const [comments, setComments] = useState<boolean | null>(null);
  const [ticketNo, setTicketNo] = useState<boolean | null>(null);
  const [approval, setApproval] = useState<boolean | null>(null);
  const [sesNotificationsEnabled, setSesNotificationsEnabled] = useState<boolean | null>(null);
  const [snsNotificationsEnabled, setSnsNotificationsEnabled] = useState<boolean | null>(null);
  const [slackNotificationsEnabled, setSlackNotificationsEnabled] = useState<boolean | null>(null);
  const [slackToken, setSlackToken] = useState("");
  const [slackTokenError, setSlackTokenError] = useState("");
  const [slackAuditNotificationsChannel, setSlackAuditNotificationsChannel] = useState<string | null>(null);
  const [sesSourceEmail, setSesSourceEmail] = useState<string | null>(null);
  const [sesSourceEmailError, setSesSourceEmailError] = useState("");
  const [sesSourceArn, setSesSourceArn] = useState<string | null>(null);
  const [sesSourceArnError, setSesSourceArnError] = useState("");
  const [visible, setVisible] = useState(false);
  const [teamAdminGroup, setTeamAdminGroup] = useState("");
  const [teamAuditorGroup, setTeamAuditorGroup] = useState("");

  // Initialize form state from settings data
  useEffect(() => {
    if (settingsData) {
      setDuration(settingsData.duration ?? "9");
      setExpiry(String(settingsData.expiry ?? 3));
      setComments(settingsData.comments ?? true);
      setTicketNo(settingsData.ticketNo ?? true);
      setApproval(settingsData.approval ?? true);
      setSesNotificationsEnabled(settingsData.sesNotificationsEnabled ?? false);
      setSnsNotificationsEnabled(settingsData.snsNotificationsEnabled ?? false);
      setSlackNotificationsEnabled(settingsData.slackNotificationsEnabled ?? false);
      setSlackAuditNotificationsChannel(settingsData.slackAuditNotificationsChannel ?? "");
      setSesSourceEmail(settingsData.sesSourceEmail ?? "");
      setSesSourceArn(settingsData.sesSourceArn ?? "");
      setSlackToken(settingsData.slackToken ?? "");
      setTeamAdminGroup(settingsData.teamAdminGroup ?? "");
      setTeamAuditorGroup(settingsData.teamAuditorGroup ?? "");
    } else if (!settingsQuery.isLoading) {
      // No settings yet, set defaults
      setDuration("9");
      setExpiry("3");
      setComments(true);
      setTicketNo(true);
      setApproval(true);
      setSesNotificationsEnabled(false);
      setSnsNotificationsEnabled(false);
      setSlackNotificationsEnabled(false);
      setSlackAuditNotificationsChannel("");
      setSesSourceEmail("");
      setSesSourceArn("");
      setSlackToken("");
      setTeamAdminGroup("");
      setTeamAuditorGroup("");
    }
  }, [settingsData, settingsQuery.isLoading]);

  const slackAppManifest = {
    display_information: {
      name: "Elevator",
      description: "Temporary Elevated Access Management for AWS IAM Identity Center",
      background_color: "#252F3E",
    },
    features: {
      bot_user: {
        display_name: "Elevator",
        always_online: false,
      },
    },
    oauth_config: {
      scopes: {
        bot: [
          "channels:read",
          "chat:write",
          "groups:read",
          "im:write",
          "usergroups:read",
          "users:read",
          "users.profile:read",
          "users:read.email",
        ],
      },
    },
    settings: {
      org_deploy_enabled: false,
      socket_mode_enabled: false,
      token_rotation_enabled: false,
    },
  };
  const encodedSlackAppManifest = encodeURIComponent(
    JSON.stringify(slackAppManifest)
  );
  const baseSlackAppUrl = "https://api.slack.com/apps?new_app=1&manifest_json=";
  const slackAppInstallUrl = baseSlackAppUrl + encodedSlackAppManifest;

  function validate(): boolean {
    let error = false;
    const emailRegex = /\S+@\S+\.\S+/;

    if (
      !duration ||
      Number.isNaN(Number(duration)) ||
      Number(duration) > 8000 ||
      Number(duration) < 1
    ) {
      setDurationError("Enter valid duration as a number between 1 - 8000");
      error = true;
    }
    if (
      !expiry ||
      Number.isNaN(Number(expiry)) ||
      Number(expiry) > 8000 ||
      Number(expiry) < 1
    ) {
      setExpiryError("Enter valid expiry timeout as a number between 1 - 8000");
      error = true;
    }
    if (sesNotificationsEnabled && sesSourceEmail && !emailRegex.test(sesSourceEmail)) {
      setSesSourceEmailError("Enter a valid email address");
      error = true;
    }
    if (
      sesNotificationsEnabled &&
      sesSourceArn &&
      !(sesSourceArn === "" || sesSourceArn.startsWith("arn:"))
    ) {
      setSesSourceArnError(
        "Enter a valid ARN for an SES identity, or leave blank if using an identity in the Elevator account"
      );
      error = true;
    }
    if (slackNotificationsEnabled) {
      if (!slackToken.startsWith("xoxb")) {
        setSlackTokenError("Enter a valid Slack bot token");
        error = true;
      } else if (slackToken.length < 10) {
        setSlackTokenError("Enter a complete OAuth token");
        error = true;
      }
    }
    return error;
  }

  function handleEdit() {
    setVisible(true);
  }

  function handleDismiss() {
    // Reset to current settings
    if (settingsData) {
      setDuration(settingsData.duration ?? "9");
      setExpiry(String(settingsData.expiry ?? 3));
      setComments(settingsData.comments ?? true);
      setTicketNo(settingsData.ticketNo ?? true);
      setApproval(settingsData.approval ?? true);
      setSesNotificationsEnabled(settingsData.sesNotificationsEnabled ?? false);
      setSnsNotificationsEnabled(settingsData.snsNotificationsEnabled ?? false);
      setSlackNotificationsEnabled(settingsData.slackNotificationsEnabled ?? false);
      setSesSourceEmail(settingsData.sesSourceEmail ?? "");
      setSesSourceArn(settingsData.sesSourceArn ?? "");
      setSlackToken(settingsData.slackToken ?? "");
      setTeamAdminGroup(settingsData.teamAdminGroup ?? "");
      setTeamAuditorGroup(settingsData.teamAuditorGroup ?? "");
    }
    setVisible(false);
  }

  function handleSubmit() {
    if (!validate()) {
      const data: UpdateSettingsInput = {
        duration: duration ?? undefined,
        expiry: expiry ? parseInt(expiry) : undefined,
        comments: comments ?? undefined,
        approval: approval ?? undefined,
        sesNotificationsEnabled: sesNotificationsEnabled ?? undefined,
        snsNotificationsEnabled: snsNotificationsEnabled ?? undefined,
        slackNotificationsEnabled: slackNotificationsEnabled ?? undefined,
        slackAuditNotificationsChannel: slackAuditNotificationsChannel ?? undefined,
        sesSourceEmail: sesSourceEmail ?? undefined,
        sesSourceArn: sesSourceArn ?? undefined,
        slackToken: slackToken || undefined,
        teamAdminGroup: teamAdminGroup || undefined,
        teamAuditorGroup: teamAuditorGroup || undefined,
        ticketNo: ticketNo ?? undefined,
      };

      updateMutation.mutate({
        body: data
      });
    }
  }

  // Convert query status to Cloudscape status type
  const getStatusType = (query: { isLoading: boolean; isError: boolean }) => {
    if (query.isLoading) return "loading";
    if (query.isError) return "error";
    return "finished";
  };

  return (
    <div>
      <ContentLayout>
        <Container
          header={
            <Header
              variant="h2"
              description="Custom configuration settings for Elevator application"
              actions={
                <Button variant="primary" onClick={handleEdit}>
                  Edit
                </Button>
              }
            >
              Configuration settings
            </Header>
          }
        >
          <ColumnLayout columns={3} variant="text-grid">
            <SpaceBetween size="l">
              <div>
                <Box variant="h3">Request settings</Box>
                <Box variant="small">
                  Elevated access request settings
                </Box>
                <hr style={{ marginBottom: "7px", marginTop: "7px", border: "none", borderTop: "1px solid #e9ebed" }} />
              </div>
              <div>
                <Box variant="awsui-key-label">Approval workflow</Box>
                <>
                  {" "}
                  {approval !== null ? (
                    <div>
                      <StatusIndicator
                        type={approval === true ? "success" : "stopped"}
                      >
                        {approval === true ? "Enabled (Managed in eligibility policy)" : "Disabled"}
                      </StatusIndicator>
                    </div>
                  ) : (
                    <Spinner />
                  )}
                </>
              </div>
              <div>
                <Box variant="awsui-key-label">Comments</Box>
                <>
                  {" "}
                  {comments !== null ? (
                    <div>
                      <StatusIndicator
                        type={comments === true ? "success" : "stopped"}
                      >
                        {comments === true ? "Required" : "Not required"}
                      </StatusIndicator>
                    </div>
                  ) : (
                    <Spinner />
                  )}
                </>
              </div>
              <div>
                <Box variant="awsui-key-label">Ticket number</Box>
                <>
                  {" "}
                  {ticketNo !== null ? (
                    <div>
                      <StatusIndicator
                        type={ticketNo === true ? "success" : "stopped"}
                      >
                        {ticketNo === true ? "Required" : "Not required"}
                      </StatusIndicator>
                    </div>
                  ) : (
                    <Spinner />
                  )}
                </>
              </div>
              <div>
                <Box variant="awsui-key-label">Maximum request duration</Box>
                <>
                  {" "}
                  {duration !== null ? (
                    <div>{duration} hours</div>
                  ) : (
                    <Spinner />
                  )}
                </>
              </div>
              <div>
                <Box variant="awsui-key-label">Request expiry timeout</Box>
                <>
                  {" "}
                  {expiry !== null ? <div>{expiry} hours</div> : <Spinner />}
                </>
              </div>
            </SpaceBetween>
            <SpaceBetween size="l">
              <div>
                <Box variant="h3">Group settings</Box>
                <Box variant="small">Elevator admin and auditor group settings</Box>
                <hr style={{ marginBottom: "7px", marginTop: "7px", border: "none", borderTop: "1px solid #e9ebed" }} />
              </div>
              <div>
                <Box variant="awsui-key-label">Elevator admin group</Box>
                <>
                  {" "}
                  {teamAdminGroup !== null ? (
                    <div>{teamAdminGroup}</div>
                  ) : (
                    <Spinner />
                  )}
                </>
              </div>
              <div>
                <Box variant="awsui-key-label">Elevator auditor group</Box>
                <>
                  {" "}
                  {teamAuditorGroup !== null ? (
                    <div>{teamAuditorGroup}</div>
                  ) : (
                    <Spinner />
                  )}
                </>
              </div>
            </SpaceBetween>
            <SpaceBetween size="l">
              <div>
                <Box variant="h3">Notification settings</Box>
                <Box variant="small">
                  Notification settings for request and approval events
                </Box>
                <hr style={{ marginBottom: "7px", marginTop: "7px", border: "none", borderTop: "1px solid #e9ebed" }} />
              </div>
              <div>
                <Box variant="awsui-key-label">Email notifications</Box>
                <>
                  {" "}
                  {sesNotificationsEnabled !== null ? (
                    <div>
                      <StatusIndicator
                        type={
                          sesNotificationsEnabled === true
                            ? "success"
                            : "stopped"
                        }
                      >
                        {sesNotificationsEnabled === true
                          ? sesSourceEmail
                          : "Disabled"}
                      </StatusIndicator>
                    </div>
                  ) : (
                    <Spinner />
                  )}
                </>
              </div>
              {sesNotificationsEnabled === true && (
                <div>
                  <Box variant="awsui-key-label">SES source email</Box>
                  <>
                    {" "}
                    {sesSourceEmail !== null ? (
                      <div>{sesSourceEmail}</div>
                    ) : (
                      <Spinner />
                    )}
                  </>
                  <br />
                  <Box variant="awsui-key-label">SES source ARN</Box>
                  <>
                    {" "}
                    {sesSourceArn !== null ? (
                      <div>{sesSourceArn}</div>
                    ) : (
                      <Spinner />
                    )}
                  </>
                </div>
              )}
              <div>
                <Box variant="awsui-key-label">SNS notifications</Box>
                <>
                  {" "}
                  {snsNotificationsEnabled !== null ? (
                    <div>
                      <StatusIndicator
                        type={
                          snsNotificationsEnabled === true
                            ? "success"
                            : "stopped"
                        }
                      >
                        {snsNotificationsEnabled === true
                          ? "Enabled"
                          : "Disabled"}
                      </StatusIndicator>
                    </div>
                  ) : (
                    <Spinner />
                  )}
                </>
              </div>
              <div>
                <Box variant="awsui-key-label">Slack notifications</Box>
                <>
                  {" "}
                  {slackNotificationsEnabled !== null ? (
                    <div>
                      <StatusIndicator
                        type={
                          slackNotificationsEnabled === true
                            ? "success"
                            : "stopped"
                        }
                      >
                        {slackNotificationsEnabled === true
                          ? "Enabled"
                          : "Disabled"}
                      </StatusIndicator>
                    </div>
                  ) : (
                    <Spinner />
                  )}
                </>
              </div>
              {slackNotificationsEnabled === true && <div>
                <Box variant="awsui-key-label">Slack Audit Channel</Box>
                <>
                  {" "}
                  {slackAuditNotificationsChannel !== null ? (
                    <div>{slackAuditNotificationsChannel || "<not set>"}</div>
                  ) : (
                    <Spinner />
                  )}
                </>
              </div>}
            </SpaceBetween>
          </ColumnLayout>
        </Container>
        <Modal
          onDismiss={() => handleDismiss()}
          visible={visible}
          closeAriaLabel="Close modal"
          size="large"
          header="Edit configuration settings"
        >
          <Form
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <Button variant="link" onClick={handleDismiss}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={handleSubmit}
                  loading={updateMutation.isPending}
                >
                  Submit
                </Button>
              </SpaceBetween>
            }
          >
            <SpaceBetween direction="vertical" size="l">
              <div>
                <Box variant="h3">Group settings</Box>
                <Box variant="small">Elevator admin and auditor group settings</Box>
                <hr style={{ marginBottom: "1px", marginTop: "7px", border: "none", borderTop: "1px solid #e9ebed" }} />
              </div>
              <FormField
                label="Elevator admin Group"
                stretch
                description="Group of users responsible for managing Elevator administrative configurations"
              >
                <Select
                  statusType={getStatusType(groupsQuery)}
                  placeholder="Select Group"
                  loadingText="Loading Groups"
                  filteringType="auto"
                  empty="No groups found"
                  options={groups.map((group) => ({
                    label: group.DisplayName,
                    value: group.GroupId,
                    description: group.GroupId,
                  }))}
                  selectedOption={{ label: teamAdminGroup }}
                  onChange={({ detail }) => {
                    setTeamAdminGroup(detail.selectedOption.label ?? "");
                  }}
                  selectedAriaLabel="selected"
                />
              </FormField>
              <FormField
                label="Elevator auditor Group"
                stretch
                description="Group of users allowed to audit Elevator elevated access requests"
              >
                <Select
                  statusType={getStatusType(groupsQuery)}
                  placeholder="Select Group"
                  loadingText="Loading Groups"
                  filteringType="auto"
                  empty="No groups found"
                  options={groups.map((group) => ({
                    label: group.DisplayName,
                    value: group.GroupId,
                    description: group.GroupId,
                  }))}
                  selectedOption={{ label: teamAuditorGroup }}
                  onChange={({ detail }) => {
                    setTeamAuditorGroup(detail.selectedOption.label ?? "");
                  }}
                  selectedAriaLabel="selected"
                />
              </FormField>
              <div>
                <Box variant="h3">Request settings</Box>
                <Box variant="small">Controls access request requirements</Box>
                <hr style={{ marginBottom: "1px", marginTop: "7px", border: "none", borderTop: "1px solid #e9ebed" }} />
              </div>
              <div>
                <FormField
                  label="Approval workflow"
                  stretch
                  description="If disabled, approval will not be required for all elevated access requests. If enabled, approval requirement is managed in eligibility policy configuration"
                >
                  <Toggle
                    onChange={({ detail }) => setApproval(detail.checked)}
                    checked={approval ?? false}
                  >
                    {approval ? "Enabled" : "Disabled"}
                  </Toggle>
                </FormField>
                <br />
                <FormField
                  label="Comments"
                  stretch
                  description="Determines if comment field is mandatory for all elevated access requests"
                >
                  <Toggle
                    onChange={({ detail }) => setComments(detail.checked)}
                    checked={comments ?? false}
                  >
                    {comments ? "Required" : "Not required"}
                  </Toggle>
                </FormField>
                <br />
                <FormField
                  label="Ticket number"
                  stretch
                  description="Determines if ticket number field is mandatory for elevated access requests"
                >
                  <Toggle
                    onChange={({ detail }) => setTicketNo(detail.checked)}
                    checked={ticketNo ?? false}
                  >
                    {ticketNo ? "Required" : "Not required"}
                  </Toggle>
                </FormField>
                <br />
                <FormField
                  label="Maximum request duration"
                  stretch
                  description="Default maximum request duration in hours"
                  errorText={durationError}
                >
                  <Input
                    value={duration ?? ""}
                    onChange={(event) => {
                      setDurationError("");
                      setDuration(event.detail.value);
                    }}
                    type="number"
                  />
                </FormField>
                <br />
                <FormField
                  label="Request expiry timeout"
                  stretch
                  description="Number of time in hours before an unapproved Elevator request expires"
                  errorText={expiryError}
                >
                  <Input
                    value={expiry ?? ""}
                    onChange={(event) => {
                      setExpiryError("");
                      setExpiry(event.detail.value);
                    }}
                    type="number"
                  />
                </FormField>
              </div>
              <div>
                <Box variant="h3">Notification settings</Box>
                <Box variant="small">
                  Notification settings for request and approval events
                </Box>
                <hr style={{ marginBottom: "1px", marginTop: "7px", border: "none", borderTop: "1px solid #e9ebed" }} />
              </div>
              <FormField
                label="Email notifications"
                stretch
                description="Send notifications via Amazon SES"
              >
                <Toggle
                  onChange={({ detail }) => {
                    setSesNotificationsEnabled(detail.checked);
                  }}
                  checked={sesNotificationsEnabled ?? false}
                >
                  Send email notifications
                </Toggle>
              </FormField>
              {sesNotificationsEnabled && (
                <div>
                  <FormField
                    label="Source email"
                    stretch
                    description="Email address to send notifications from. Must be verified in SES."
                    errorText={sesSourceEmailError}
                  >
                    <Input
                      value={sesSourceEmail ?? ""}
                      onChange={(event) => {
                        setSesSourceEmailError("");
                        setSesSourceEmail(event.detail.value);
                      }}
                      placeholder="Source email"
                    />
                  </FormField>
                  <br />
                  <FormField
                    label="Source ARN (Optional, for cross-account SES identities)"
                    stretch
                    description="ARN of a verified SES identity in another AWS account. Must be configured to authorize sending mail from the Elevator account."
                    errorText={sesSourceArnError}
                  >
                    <Input
                      value={sesSourceArn ?? ""}
                      onChange={(event) => {
                        setSesSourceArnError("");
                        setSesSourceArn(event.detail.value);
                      }}
                      placeholder="arn:aws:ses:..."
                    />
                  </FormField>
                </div>
              )}
              <FormField
                label="SNS notifications"
                stretch
                description="Send notifications via Amazon SNS. Once enabled, create a subscription to the SNS topic in the Elevator account."
              >
                <Toggle
                  onChange={({ detail }) => {
                    setSnsNotificationsEnabled(detail.checked);
                  }}
                  checked={snsNotificationsEnabled ?? false}
                >
                  Send SNS notifications
                </Toggle>
              </FormField>
              <FormField
                label="Slack notifications"
                stretch
                description="Send notifications directly to users in Slack via a Slack bot app."
              >
                <Toggle
                  onChange={({ detail }) => {
                    setSlackNotificationsEnabled(detail.checked);
                  }}
                  checked={slackNotificationsEnabled ?? false}
                >
                  Send Slack notifications
                </Toggle>
              </FormField>
              {slackNotificationsEnabled && (
                <div>
                  <Button
                    ariaLabel="Install Slack App (opens new tab)"
                    href={slackAppInstallUrl}
                    iconAlign="right"
                    iconName="external"
                    target="_blank"
                  >
                    Install Slack App
                  </Button>
                  <br />
                  <br />
                  <FormField
                    label="Slack OAuth token"
                    stretch
                    description="Slack OAuth token associated with the installed app."
                    errorText={slackTokenError}
                  >
                    <Input
                      value={slackToken}
                      onChange={(event) => {
                        setSlackTokenError("");
                        setSlackToken(event.detail.value);
                      }}
                      type="password"
                      placeholder="xoxb-..."
                    />
                  </FormField>
                  <FormField
                    label="Slack Audit Channel"
                    stretch
                    description="(Optional) Channel to post notifications about all requests and approvals"
                  >
                    <Input value={slackAuditNotificationsChannel ?? ""}
                      onChange={(event) => {
                        setSlackAuditNotificationsChannel(event.detail.value);
                      }}
                      type="text"
                      placeholder="#channel-name"
                    />
                  </FormField>
                </div>
              )}
            </SpaceBetween>
          </Form>
        </Modal>
      </ContentLayout>
    </div>
  );
}

export default Settings;
