// © 2023 Amazon Web Services, Inc. or its affiliates. All Rights Reserved.
// This AWS Content is provided subject to the terms of the AWS Customer Agreement available at
// http://aws.amazon.com/agreement or other written agreement between Customer and either
// Amazon Web Services, Inc. or Amazon Web Services EMEA SARL or both.
import Form from "@cloudscape-design/components/form";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import Select, { SelectProps } from "@cloudscape-design/components/select";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Button from "@cloudscape-design/components/button";
import Textarea from "@cloudscape-design/components/textarea";
import DatePicker from "@cloudscape-design/components/date-picker";
import TimeInput from "@cloudscape-design/components/time-input";
import React, { useState, useMemo } from "react";
import { useLocation } from "wouter";
import {
  useSettings,
  usePublishPolicy,
  useCreateRequest,
} from "../../api";

interface RequestProps {
  user: string;
  userId: string;
  groupIds: string[];
  addNotification: (notifications: any[]) => void;
  setActiveHref: (href: string) => void;
}

interface PolicyItem {
  accounts: { id: string; name: string }[];
  permissions: { id: string; name: string }[];
  duration: number;
  approvalRequired: boolean;
}

function Request(props: RequestProps) {
  const [, navigate] = useLocation();

  // Form state
  const [duration, setDuration] = useState("");
  const [durationError, setDurationError] = useState("");
  const [justification, setJustification] = useState("");
  const [justificationError, setJustificationError] = useState("");
  const [role, setRole] = useState<SelectProps.Option | null>(null);
  const [roleError, setRoleError] = useState("");
  const [account, setAccount] = useState<SelectProps.Option | null>(null);
  const [accountError, setAccountError] = useState("");
  const now = new Date();
  const [date, setDate] = useState(now.toISOString().split("T")[0]);
  const [time, setTime] = useState(now.toTimeString().slice(0, 5));
  const [timeError, setTimeError] = useState("");
  const [ticketNo, setTicketNo] = useState("");
  const [ticketError, setTicketError] = useState("");
  const [maxDuration, setMaxDuration] = useState(9);
  const [permissions, setPermissions] = useState<{ id: string; name: string }[]>([]);

  // React Query hooks
  const { data: settingsData } = useSettings();

  const publishPolicyMutation = usePublishPolicy();
  const createRequestMutation = useCreateRequest();

  // Fetch policy on mount
  const { data: policyData, isLoading: policyLoading } = (() => {
    const mutation = publishPolicyMutation;
    React.useEffect(() => {
      mutation.mutate({
        body: {
          userId: props.userId,
          groupIds: props.groupIds,
          username: props.user,
        },
      });
    }, []);
    return { data: mutation.data, isLoading: mutation.isPending };
  })();

  // Extract settings
  const ticketRequired = settingsData?.ticketNo ?? true;
  const approvalRequired = settingsData?.approval ?? true;
  const settingsMaxDuration = settingsData?.duration ? parseInt(String(settingsData.duration)) : 9;

  // Extract policy items
  const policyItems: PolicyItem[] = (policyData as any)?.policy ?? [];

  // Compute accounts from policy
  const accounts = useMemo(() => {
    const allAccounts = policyItems.flatMap((item) => item.accounts);
    const uniqueAccounts = new Map<string, { id: string; name: string }>();
    allAccounts.forEach((account) => {
      uniqueAccounts.set(account.id, account);
    });
    return Array.from(uniqueAccounts.values());
  }, [policyItems]);

  // Get permissions for selected account
  function getPermissionsForAccount(accountId: string) {
    const permissionData: { id: string; name: string }[] = [];
    policyItems.forEach((item) => {
      item.accounts.forEach((acct) => {
        if (acct.id === accountId) {
          permissionData.push(...item.permissions);
        }
      });
    });
    // Deduplicate
    const unique = new Map<string, { id: string; name: string }>();
    permissionData.forEach((p) => unique.set(p.id, p));
    return Array.from(unique.values());
  }

  // Get duration for selected account
  function getDurationForAccount(accountId: string): number {
    for (const item of policyItems) {
      for (const acct of item.accounts) {
        if (acct.id === accountId) {
          return item.duration;
        }
      }
    }
    return settingsMaxDuration;
  }

  // Check if approval is not required for this account/role combination
  function checkApprovalNotRequired(accountId: string, roleId: string): boolean {
    for (const item of policyItems) {
      for (const acct of item.accounts) {
        if (acct.id === accountId) {
          for (const perm of item.permissions) {
            if (perm.id === roleId && !item.approvalRequired) {
              return true;
            }
          }
        }
      }
    }
    return false;
  }

  async function validate(): Promise<boolean> {
    let hasError = false;

    if (!duration || isNaN(Number(duration)) || Number(duration) > maxDuration || Number(duration) < 1) {
      setDurationError(`Enter number between 1-${maxDuration}`);
      hasError = true;
    }

    if (!role) {
      setRoleError("Select a role");
      hasError = true;
    }

    if (!account?.label) {
      setAccountError("Select an account");
      hasError = true;
    }

    if (!date) {
      setTimeError("Select start date");
      hasError = true;
    }

    if (!justification || !/[\p{L}\p{N}]/u.test(justification[0])) {
      setJustificationError("Enter valid business justification");
      hasError = true;
    }

    if (ticketRequired && (!ticketNo || !/^[a-zA-Z0-9]+$/.test(ticketNo[0]))) {
      setTicketError("Enter valid change management ticket number");
      hasError = true;
    }

    return hasError;
  }

  async function handleSubmit() {

    const hasError = await validate();
    if (hasError) return;

    // Check if approval is required
    if (!approvalRequired || checkApprovalNotRequired(account!.value!, role!.value!)) {
      submitRequest();
      return;
    }

    // TODO: Check approvers - this requires more complex logic with multiple queries
    // For now, just submit the request
    submitRequest();
  }

  function submitRequest() {
    createRequestMutation.mutate(
      {
        body: {
          accountId: account!.value,
          accountName: account!.label,
          role: role!.label,
          roleId: role!.value,
          duration: duration,
          startTime: new Date(`${date}T${time || "00:00"}`).toISOString(),
          justification: justification,
          ticketNo: ticketNo,
        },
      },
      {
        onSuccess: () => {
          props.addNotification([
            {
              type: "success",
              content: "Request created successfully",
              dismissible: true,
              onDismiss: () => props.addNotification([]),
            },
          ]);
          navigate("/requests/view");
          props.setActiveHref("/requests/view");
        },
        onError: () => {
          props.addNotification([
            {
              type: "error",
              content: "Failed to create request",
              dismissible: true,
              onDismiss: () => props.addNotification([]),
            },
          ]);
        },
      }
    );
  }

  function handleCancel() {
    navigate("/");
    props.setActiveHref("/");
    props.addNotification([]);
  }

  const accountStatus = policyLoading ? "loading" : "finished";
  const permissionStatus = policyLoading ? "loading" : "finished";

  return (
    <div>
      <Form
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" onClick={handleCancel}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleSubmit}
              className="buttons"
              loading={createRequestMutation.isPending}
            >
              Submit
            </Button>
          </SpaceBetween>
        }
      >
        <Container
          header={
            <Header variant="h2" description="Request temporary elevated access">
              Elevated access request
            </Header>
          }
        >
          <SpaceBetween direction="vertical" size="l">
            <FormField label="Email" stretch description="Elevated access requester username">
              <Input value={props.user} type="email" readOnly />
            </FormField>

            <FormField
              label="Account"
              stretch
              description="Target account for elevated access"
              errorText={accountError}
            >
              <Select
                statusType={accountStatus}
                placeholder="Select an account"
                loadingText="Loading accounts"
                filteringType="auto"
                empty="No eligible accounts found"
                options={accounts.map((acct) => ({
                  label: acct.name,
                  value: acct.id,
                  description: acct.id,
                }))}
                selectedOption={account}
                onChange={(event) => {
                  setAccountError("");
                  const selected = event.detail.selectedOption;
                  setAccount(selected);
                  setRole(null);
                  if (selected.value) {
                    setPermissions(getPermissionsForAccount(selected.value));
                    setMaxDuration(getDurationForAccount(selected.value));
                    setDuration("");
                  }
                }}
                selectedAriaLabel="selected"
              />
            </FormField>

            <FormField
              label="Role"
              stretch
              description="Requested permission set and associated role"
              errorText={roleError}
            >
              <Select
                statusType={permissionStatus}
                placeholder="Select a role"
                loadingText="Loading permissions"
                filteringType="auto"
                empty="No eligible permissions found"
                options={permissions.map((permission) => ({
                  label: permission.name,
                  value: permission.id,
                }))}
                selectedOption={role}
                onChange={(event) => {
                  setRoleError("");
                  setRole(event.detail.selectedOption);
                }}
                selectedAriaLabel="selected"
              />
            </FormField>

            <FormField
              label="Start date"
              stretch
              description="Start date for elevated access"
              errorText={timeError}
            >
              <SpaceBetween direction="horizontal" size="xs">
                <DatePicker
                  value={date}
                  onChange={({ detail }) => {
                    setTimeError("");
                    setDate(detail.value);
                  }}
                  placeholder="YYYY/MM/DD"
                />
                <TimeInput
                  value={time}
                  format="hh:mm"
                  onChange={({ detail }) => {
                    setTimeError("");
                    setTime(detail.value);
                  }}
                  placeholder="HH:mm"
                />
              </SpaceBetween>
            </FormField>

            <FormField
              label="Duration"
              stretch
              description="Number of hours for which elevated access is required"
              errorText={durationError}
            >
              <Input
                value={duration}
                onChange={(event) => {
                  setDurationError("");
                  const val = event.detail.value;
                  if (Number(val) > maxDuration) {
                    setDurationError(`Enter a number between 1 and ${maxDuration}`);
                  } else {
                    setDuration(val);
                  }
                }}
                type="number"
                placeholder={`Enter number between 1-${maxDuration}`}
              />
            </FormField>

            <FormField
              label="Ticket no"
              stretch
              description="Elevated request ticket system number"
              errorText={ticketError}
            >
              <Input
                value={ticketNo}
                onChange={(event) => {
                  setTicketError("");
                  setTicketNo(event.detail.value);
                }}
              />
            </FormField>

            <FormField
              label="Justification"
              stretch
              description="Business justification for requesting elevated access"
              errorText={justificationError}
            >
              <Textarea
                onChange={({ detail }) => {
                  setJustificationError("");
                  setJustification(detail.value);
                }}
                value={justification}
                placeholder="Business Justification for requesting elevated access"
              />
            </FormField>
          </SpaceBetween>
        </Container>
      </Form>
    </div>
  );
}

export default Request;
