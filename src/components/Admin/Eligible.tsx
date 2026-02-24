// © 2023 Amazon Web Services, Inc. or its affiliates. All Rights Reserved.
// This AWS Content is provided subject to the terms of the AWS Customer Agreement available at
// http://aws.amazon.com/agreement or other written agreement between Customer and either
// Amazon Web Services, Inc. or Amazon Web Services EMEA SARL or both.
import React, { useState, useMemo } from "react";
import {
  Box,
  Button,
  Header,
  Pagination,
  Table,
  TextFilter,
  SpaceBetween,
  CollectionPreferences,
  Multiselect,
  TextContent,
  Modal,
  FormField,
  ButtonDropdown,
  Form,
  Select,
  ColumnLayout,
  Toggle,
  Input,
  Spinner,
  Link
} from "@cloudscape-design/components";
import { useCollection } from "@cloudscape-design/collection-hooks";
import type { SelectProps, MultiselectProps } from "@cloudscape-design/components";

interface Preferences {
  pageSize?: number;
  visibleContent?: readonly string[];
}
import { $api } from "../../api/client";
import type { components } from "../../api/schema.d";
import Ous from "../Shared/Ous";

// Types from OpenAPI schema
type AccountInfo = components["schemas"]["AccountInfo"];
type GroupInfo = components["schemas"]["GroupInfo"];
type UserInfo = components["schemas"]["UserInfo"];
type PermissionSetInfo = components["schemas"]["PermissionSetInfo"];
type EligibilityResponse = components["schemas"]["EligibilityResponse"];
type CreateEligibilityInput = components["schemas"]["CreateEligibilityInput"];
type SettingsItem = components["schemas"]["SettingsItem"];

const createColumnDefinitions = (onNameClick: (item: EligibilityResponse) => void) => [
  {
    id: "id",
    sortingField: "id",
    header: "Id",
    cell: (item: EligibilityResponse) => item.id,
    width: 140,
  },
  {
    id: "name",
    sortingField: "name",
    header: "Name",
    cell: (item: EligibilityResponse) => (
      <Link onFollow={(e) => { e.preventDefault(); onNameClick(item); }}>{item.name ?? "-"}</Link>
    ),
    width: 220,
  },
  {
    id: "type",
    sortingField: "type",
    header: "Type",
    cell: (item: EligibilityResponse) => item.type ?? "-",
    width: 130,
  },
  {
    id: "accounts",
    sortingField: "accounts",
    header: "Accounts",
    cell: (item: EligibilityResponse) => (
      <>{item.accounts.length > 0 ? <TextContent>
        <ul>
          {item.accounts.map((acc) => (
            <li key={acc.id || acc.name}>{acc.name}</li>
          ))}
        </ul>
      </TextContent> : <TextContent><ul>-</ul></TextContent>}</>
    ),
    width: 200,
  },
  {
    id: "ous",
    sortingField: "ous",
    header: "OUs",
    cell: (item: EligibilityResponse) => (
      <>{item.ous.length > 0 ? <TextContent>
        <ul>
          {item.ous.map((ou) => (
            <li key={ou.id || ou.name}>{ou.name}</li>
          ))}
        </ul>
      </TextContent> : <TextContent><ul>-</ul></TextContent>}</>
    ),
    width: 200,
  },
  {
    id: "permissions",
    sortingField: "permissions",
    header: "Permissions",
    cell: (item: EligibilityResponse) => (
      <TextContent>
        <ul>
          {item.permissions.map((perm) => (
            <li key={perm.id || perm.name}>{perm.name}</li>
          ))}
        </ul>
      </TextContent>
    ),
    width: 200,
  },
  {
    id: "duration",
    sortingField: "duration",
    header: "Max duration",
    cell: (item: EligibilityResponse) => `${item.duration} hours`,
    width: 120,
  },
  {
    id: "approvalRequired",
    sortingField: "approvalRequired",
    header: "Approval required",
    cell: (item: EligibilityResponse) => item.approvalRequired ? "Yes" : "No",
    width: 130,
  },
  {
    id: "autoApprovalOnCall",
    sortingField: "autoApprovalOnCall",
    header: "Auto-approve on-call",
    cell: (item: EligibilityResponse) => item.autoApprovalOnCall ? "Yes" : "No",
    width: 150,
  },
  {
    id: "allowSelfApproval",
    sortingField: "allowSelfApproval",
    header: "Allow self-approval",
    cell: (item: EligibilityResponse) => item.allowSelfApproval === true ? "Yes" : "No",
    width: 150,
  },
];

const MyCollectionPreferences = ({ preferences, setPreferences }: { preferences: Preferences; setPreferences: (prefs: Preferences) => void }) => {
  return (
    <CollectionPreferences
      title="Preferences"
      confirmLabel="Confirm"
      cancelLabel="Cancel"
      preferences={preferences}
      onConfirm={({ detail }) => setPreferences(detail)}
      pageSizePreference={{
        title: "Page size",
        options: [
          { value: 10, label: "10 Policies" },
          { value: 30, label: "30 Policies" },
          { value: 50, label: "50 Policies" },
        ],
      }}
      wrapLinesPreference={{
        label: "Wrap lines",
        description: "Check to see all the text and wrap the lines",
      }}
      visibleContentPreference={{
        title: "Select visible columns",
        options: [
          {
            label: "Policy properties",
            options: [
              { id: "id", label: "Id" },
              { id: "name", label: "Name" },
              { id: "type", label: "Type" },
              { id: "accounts", label: "Accounts" },
              { id: "ous", label: "OUs" },
              { id: "permissions", label: "Permissions" },
              { id: "duration", label: "Duration" },
              { id: "approvalRequired", label: "Approval Required" },
              { id: "autoApprovalOnCall", label: "Auto-approve On-call" },
              { id: "allowSelfApproval", label: "Allow Self-approval" },
            ],
          },
        ],
      }}
    />
  );
};

function EmptyState({ title, subtitle, action }: { title: string; subtitle: string; action?: React.ReactNode }) {
  return (
    <Box textAlign="center">
      <Box variant="strong">{title}</Box>
      <Box variant="p" padding={{ bottom: "s" }}>
        {subtitle}
      </Box>
      {action}
    </Box>
  );
}

const defaultType: { label: string; value: string } = {
  label: "All entities",
  value: "0",
};

interface Notification {
  type: "success" | "error" | "warning" | "info";
  content: string;
  dismissible: boolean;
  onDismiss: () => void;
}

interface EligibleProps {
  addNotification: (notifications: Notification[]) => void;
  setActiveHref?: (href: string) => void;
  user?: string;
  group?: string[];
}

function Eligible(props: EligibleProps) {
  // UI state - Type needs to be declared first since queries depend on it
  const [Type, setType] = useState<SelectProps.Option | null>(null);

  // React Query hooks using $api.useQuery style with typed endpoints
  const eligibilityQuery = $api.useQuery("get", "/eligibility");

  const accountsQuery = $api.useQuery("get", "/accounts");

  const ousQuery = $api.useQuery("get", "/ous");

  const permissionsQuery = $api.useQuery("get", "/permissions");

  const usersQuery = $api.useQuery("get", "/users", undefined, {
    enabled: Type?.value === "User",
  });

  const groupsQuery = $api.useQuery("get", "/idc-groups", undefined, {
    enabled: Type?.value === "Group",
  });

  const settingsQuery = $api.useQuery("get", "/settings");

  // Mutations using $api.useMutation style with typed endpoints
  const addMutation = $api.useMutation("post", "/eligibility", {
    onSuccess: () => {
      eligibilityQuery.refetch();
      handleDismiss();
      props.addNotification([
        {
          type: "success",
          content: "Eligibility policy added successfully",
          dismissible: true,
          onDismiss: () => props.addNotification([]),
        },
      ]);
    },
  });

  const deleteMutation = $api.useMutation("delete", "/eligibility/{policy_id}", {
    onSuccess: () => {
      eligibilityQuery.refetch();
      setDeleteVisible(false);
      props.addNotification([
        {
          type: "success",
          content: "Eligibility policy deleted successfully",
          dismissible: true,
          onDismiss: () => props.addNotification([]),
        },
      ]);
    },
  });

  const editMutation = $api.useMutation("put", "/eligibility/{policy_id}", {
    onSuccess: () => {
      eligibilityQuery.refetch();
      handleDismiss();
      props.addNotification([
        {
          type: "success",
          content: "Eligibility policy updated successfully",
          dismissible: true,
          onDismiss: () => props.addNotification([]),
        },
      ]);
    },
  });

  // Derived data from queries - properly typed
  const eligibilityData = eligibilityQuery.data;
  const allItems: EligibilityResponse[] = eligibilityData?.items ?? [];
  const accounts: AccountInfo[] = Array.isArray(accountsQuery.data) ? accountsQuery.data : [];
  const ous = Array.isArray(ousQuery.data) ? ousQuery.data : [];
  const permissions: PermissionSetInfo[] = Array.isArray(permissionsQuery.data) ? permissionsQuery.data : [];
  const users: UserInfo[] = Array.isArray(usersQuery.data) ? usersQuery.data : [];
  const groups: GroupInfo[] = Array.isArray(groupsQuery.data) ? groupsQuery.data : [];
  const settings: SettingsItem | undefined = settingsQuery.data;
  const defaultDuration = settings?.duration ?? "9";

  // UI state
  const [preferences, setPreferences] = useState<Preferences>({
    pageSize: 10,
    visibleContent: [
      "name",
      "type",
      "accounts",
      "ous",
      "permissions",
      "duration",
      "approvalRequired",
      "autoApprovalOnCall",
      "allowSelfApproval",
    ],
  });

  const [selectedOption, setSelectedOption] = useState<{ label: string; value: string }>(defaultType);
  const [visible, setVisible] = useState(false);
  const [deleteVisible, setDeleteVisible] = useState(false);
  const [editVisible, setEditVisible] = useState(false);
  const [typeError, setTypeError] = useState("");
  const [duration, setDuration] = useState(defaultDuration);
  const [durationError, setDurationError] = useState("");
  const [approvalRequired, setApprovalRequired] = useState(true);
  const [autoApprovalOnCall, setAutoApprovalOnCall] = useState(false);
  const [allowSelfApproval, setAllowSelfApproval] = useState(false);
  const [resource, setResource] = useState<MultiselectProps.Option[]>([]);
  const [resourceError, setResourceError] = useState("");
  const [account, setAccount] = useState<MultiselectProps.Option[]>([]);
  const [accountError, setAccountError] = useState("");
  const [ou, setOU] = useState<MultiselectProps.Option[]>([]);
  const [ouError, setOuError] = useState("");
  const [permission, setPermission] = useState<readonly MultiselectProps.Option[]>([]);
  const [permissionError, setPermissionError] = useState("");
  const [editItem, setEditItem] = useState<EligibilityResponse | null>(null);

  // Handler for name column click - opens edit modal for the clicked item
  const handleNameClick = (item: EligibilityResponse) => {
    setEditItem(item);
    // Set up the edit form with the item's values
    setDuration(String(item.duration));
    setApprovalRequired(item.approvalRequired);
    setAutoApprovalOnCall(item.autoApprovalOnCall ?? false);
    setAllowSelfApproval(item.allowSelfApproval === true);
    setAccount(item.accounts.map((acc) => ({
      label: acc.name,
      value: acc.id,
      description: acc.id,
    })));
    setOU(item.ous.map((o) => ({
      label: o.name,
      value: o.id,
      description: o.id,
    })));
    setPermission(item.permissions.map((perm) => ({
      label: perm.name,
      value: perm.id,
      description: perm.id,
    })));
    setEditVisible(true);
  };

  // Create column definitions with the name click handler
  const columnDefinitions = useMemo(
    () => createColumnDefinitions(handleNameClick),
    []
  );

  // Helper functions
  function prepareSelectOptions(field: string, defaultOption: { label: string; value: string }) {
    const optionSet: string[] = [];
    allItems.forEach((item) => {
      const value = item[field as keyof EligibilityResponse] as string | undefined;
      if (value && optionSet.indexOf(value) === -1) {
        optionSet.push(value);
      }
    });
    optionSet.sort();

    const options = [defaultOption];
    optionSet.forEach((item, index) =>
      options.push({ label: item, value: (index + 1).toString() })
    );
    return options;
  }

  const selectTypeOptions = prepareSelectOptions("type", defaultType);

  function matchesType(item: EligibilityResponse, selectedType: { label: string; value: string }) {
    return selectedType === defaultType || item.type === selectedType.label;
  }

  const SEARCHABLE_COLUMNS = columnDefinitions.map((item) => item.id);

  const {
    items,
    actions,
    filteredItemsCount,
    collectionProps,
    filterProps,
    paginationProps,
  } = useCollection(allItems, {
    filtering: {
      filteringFunction: (item, filteringText) => {
        if (!matchesType(item, selectedOption)) {
          return false;
        }
        const filteringTextLowerCase = filteringText.toLowerCase();

        return SEARCHABLE_COLUMNS.map((key) => item[key as keyof EligibilityResponse]).some(
          (value) =>
            typeof value === "string" &&
            value.toLowerCase().indexOf(filteringTextLowerCase) > -1
        );
      },
      empty: (
        <EmptyState
          title="No Policy"
          subtitle="No eligibility policy to display."
          action={<Button onClick={handleAdd}>Create eligibility policy</Button>}
        />
      ),
      noMatch: (
        <EmptyState
          title="No matches"
          subtitle="Your search didn't return any records."
          action={
            <Button onClick={() => actions.setFiltering("")}>
              Clear filter
            </Button>
          }
        />
      ),
    },
    pagination: { pageSize: preferences.pageSize },
    sorting: {},
    selection: {},
  });

  const { selectedItems } = collectionProps;

  function handleAdd() {
    setDuration(defaultDuration);
    setVisible(true);
  }

  function handleSelect(data: { detail: { id: string } }) {
    if (data.detail.id === "delete") {
      setDeleteVisible(true);
    } else handleEdit();
  }

  function handleDelete() {
    selectedItems?.forEach((item) => {
      deleteMutation.mutate({
        params: { path: { policy_id: (item as EligibilityResponse).id } }
      });
    });
  }

  function handleConfirmEdit() {
    const valid = validate("edit");
    // Use editItem (from name click) or selectedItems[0] (from dropdown)
    const item = editItem || (selectedItems && selectedItems.length > 0 ? selectedItems[0] as EligibilityResponse : null);
    if (valid && item) {
      const body: CreateEligibilityInput = {
        id: item.id,
        accounts: account.map(({ value, label }) => ({ name: label ?? "", id: value ?? "" })),
        permissions: permission.map(({ value, label }) => ({ name: label ?? "", id: value ?? "" })),
        ous: ou.map(({ value, label }) => ({ name: label ?? "", id: value ?? "" })),
        approvalRequired: approvalRequired,
        duration: duration,
        autoApprovalOnCall: autoApprovalOnCall,
        allowSelfApproval: allowSelfApproval
      };
      editMutation.mutate({
        params: { path: { policy_id: item.id } },
        body
      });
    }
  }

  function handleEdit() {
    if (selectedItems && selectedItems.length > 0) {
      const item = selectedItems[0] as EligibilityResponse;
      setAccount(
        item.accounts.map((data: { id?: string; name?: string }) => ({
          label: data.name ?? "",
          value: data.id ?? "",
          description: data.id ?? "",
        }))
      );
      setOU(
        item.ous.map((data: { id?: string; name?: string }) => ({
          label: data.name ?? "",
          value: data.id ?? "",
          description: data.id ?? "",
        }))
      );
      setPermission(
        item.permissions.map((data: { id?: string; name?: string }) => ({
          label: data.name ?? "",
          value: data.id ?? "",
          description: data.id ?? "",
        }))
      );
      setApprovalRequired(item.approvalRequired);
      setAutoApprovalOnCall(item.autoApprovalOnCall ?? false);
      setAllowSelfApproval(item.allowSelfApproval === true);
      setDuration(item.duration);
      setEditVisible(true);
    }
  }

  const onTypeChange = (value: SelectProps.Option) => {
    setResource([]);
    setType(value);
    // Queries will automatically fetch when Type changes due to enabled condition
  };

  const onResourceChange = (value: readonly MultiselectProps.Option[]) => {
    setResource([...value]);
  };

  function validate(action: string): boolean {
    let valid = true;
    if (permission.length < 1) {
      valid = false;
      setPermissionError("Select permission set");
    }
    if (ou.length < 1 && account.length < 1) {
      valid = false;
      setOuError("Select OUs and/or Accounts");
      setAccountError("Select OUs and/or Accounts");
    }
    if (!duration || Number.isNaN(Number(duration)) || Number(duration) > 8000 || Number(duration) < 1) {
      setDurationError("Enter number between 1-8000");
      valid = false;
    }
    if (resource.length === 0 && action === "submit") {
      setResourceError("Select a valid entity");
      valid = false;
    }
    if (!Type && action === "submit") {
      setTypeError("Select a valid entity type");
      valid = false;
    }
    return valid;
  }

  function handleSubmit() {
    const valid = validate("submit");
    if (valid && Type) {
      resource.forEach((item) => {
        const body: CreateEligibilityInput = {
          id: item.value ?? "",
          accounts: account.map(({ value, label }) => ({ name: label ?? "", id: value ?? "" })),
          permissions: permission.map(({ value, label }) => ({ name: label ?? "", id: value ?? "" })),
          ous: ou.map(({ value, label }) => ({ name: label ?? "", id: value ?? "" })),
          approvalRequired: approvalRequired,
          duration: duration,
          autoApprovalOnCall: autoApprovalOnCall,
          allowSelfApproval: allowSelfApproval
        };
        addMutation.mutate({ body });
      });
    }
  }

  function handleDismiss() {
    setVisible(false);
    setDeleteVisible(false);
    setEditVisible(false);
    setEditItem(null);
    setType(null);
    setTypeError("");
    setResource([]);
    setResourceError("");
    setAccount([]);
    setAccountError("");
    setOU([]);
    setOuError("");
    setPermission([]);
    setPermissionError("");
    setDurationError("");
    setApprovalRequired(true);
    setAutoApprovalOnCall(false);
    setAllowSelfApproval(false);
  }

  const ValueWithLabel = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div>
      <Box variant="awsui-key-label">{label}</Box>
      <div>{children}</div>
    </div>
  );

  // Convert query status to Cloudscape status type
  const getStatusType = (query: { isLoading: boolean; isError: boolean }) => {
    if (query.isLoading) return "loading";
    if (query.isError) return "error";
    return "finished";
  };

  return (
    <div>
      <Table
        {...collectionProps}
        resizableColumns={true}
        loading={eligibilityQuery.isLoading}
        loadingText="Fetching eligibility policy"
        wrapLines
        header={
          <Header
            counter={
              selectedItems?.length
                ? `(${selectedItems.length}/${allItems.length})`
                : `(${allItems.length})`
            }
            actions={
              <SpaceBetween size="s" direction="horizontal">
                <Button
                  iconName="refresh"
                  onClick={() => eligibilityQuery.refetch()}
                  loading={eligibilityQuery.isFetching}
                />
                <ButtonDropdown
                  items={[
                    {
                      text: "Edit",
                      id: "edit",
                      disabled:
                        !selectedItems?.length || selectedItems.length > 1,
                    },
                    {
                      text: "Delete",
                      id: "delete",
                      disabled: !selectedItems?.length,
                    },
                  ]}
                  onItemClick={(props) => handleSelect(props)}
                >
                  Actions
                </ButtonDropdown>
                <Button variant="primary" onClick={handleAdd}>
                  Add policy
                </Button>
              </SpaceBetween>
            }
          >
            Eligibility policy
          </Header>
        }
        filter={
          <div style={{ display: 'flex', flexWrap: 'wrap', flexGrow: 10, marginRight: '2rem' }}>
            <div style={{ flexGrow: 6, maxWidth: 728, marginRight: '1rem' }}>
              <TextFilter
                {...filterProps}
                filteringPlaceholder="Find policy"
                countText={String(filteredItemsCount)}
              />
            </div>
            <div style={{ maxWidth: 130, flexGrow: 2, marginRight: '1rem' }}>
              <Select
                selectedAriaLabel="Selected"
                options={selectTypeOptions}
                selectedOption={selectedOption}
                onChange={({ detail }) =>
                  setSelectedOption(detail.selectedOption as { label: string; value: string })
                }
              />
            </div>
          </div>
        }
        columnDefinitions={columnDefinitions}
        visibleColumns={preferences.visibleContent}
        pagination={<Pagination {...paginationProps} />}
        preferences={
          <MyCollectionPreferences
            preferences={preferences}
            setPreferences={setPreferences}
          />
        }
        items={items}
        selectionType="multi"
      />
      <Modal
        onDismiss={() => handleDismiss()}
        visible={visible}
        closeAriaLabel="Close modal"
        size="large"
        header="Policy"
      >
        <Form
          actions={
            <SpaceBetween direction="horizontal" size="xs">
              <Button
                variant="primary"
                onClick={handleSubmit}
                className="buttons"
                loading={addMutation.isPending}
              >
                Add eligibility policy
              </Button>
            </SpaceBetween>
          }
        >
          <SpaceBetween direction="vertical" size="l">
            <FormField
              label="Entity type"
              stretch
              description="User or Group"
              errorText={typeError}
            >
              <Select
                selectedAriaLabel="Selected"
                options={[
                  {
                    label: "User",
                    value: "User",
                  },
                  {
                    label: "Group",
                    value: "Group",
                  },
                ]}
                selectedOption={Type}
                onChange={(event) => {
                  setTypeError("");
                  onTypeChange(event.detail.selectedOption);
                }}
              />
            </FormField>
            {Type?.value === "User" && (
              <FormField
                label="User"
                stretch
                description="User eligibility policy"
                errorText={resourceError}
              >
                <Multiselect
                  statusType={getStatusType(usersQuery)}
                  placeholder="Select Users"
                  loadingText="Loading users"
                  filteringType="auto"
                  empty="No options"
                  options={users.map((user) => ({
                    label: user.UserName,
                    value: user.UserId,
                    description: user.UserId,
                    disabled: allItems.map(({ id }) => id).includes(user.UserId),
                  }))}
                  selectedOptions={resource}
                  onChange={(event) => {
                    setResourceError("");
                    onResourceChange(event.detail.selectedOptions);
                  }}
                  selectedAriaLabel="selected"
                  deselectAriaLabel={(e) => `Remove ${e.label}`}
                />
              </FormField>
            )}
            {Type?.value === "Group" && (
              <FormField
                label="Group"
                stretch
                description="Group eligibility policy"
                errorText={resourceError}
              >
                <Multiselect
                  statusType={getStatusType(groupsQuery)}
                  placeholder="Select Groups"
                  loadingText="Loading Groups"
                  filteringType="auto"
                  empty="No options"
                  options={groups.map((group) => ({
                    label: group.DisplayName,
                    value: group.GroupId,
                    description: group.GroupId,
                    disabled: allItems.map(({ id }) => id).includes(group.GroupId),
                  }))}
                  selectedOptions={resource}
                  onChange={(event) => {
                    setResourceError("");
                    onResourceChange(event.detail.selectedOptions);
                  }}
                  selectedAriaLabel="selected"
                  deselectAriaLabel={(e) => `Remove ${e.label}`}
                />
              </FormField>
            )}
            <FormField
              label="Accounts"
              stretch
              description="List of Eligible Accounts"
              errorText={accountError}
            >
              <Multiselect
                statusType={getStatusType(accountsQuery)}
                placeholder="Select accounts"
                loadingText="Loading accounts"
                filteringType="auto"
                empty="No options"
                options={accounts.map((acc) => ({
                  label: acc.name,
                  value: acc.id,
                  description: acc.id,
                }))}
                selectedOptions={account}
                onChange={({ detail }) => {
                  setAccountError("");
                  setAccount([...detail.selectedOptions]);
                }}
                selectedAriaLabel="selected"
                deselectAriaLabel={(e) => `Remove ${e.label}`}
              />
            </FormField>
            <FormField
              label="OUs"
              stretch
              description="List of Eligible OUs"
              errorText={ouError}
            >
              {ous.length === 1 ? (
                <Ous
                  options={ous}
                  setResource={setOU}
                  resource={ou}
                />
              ) : <Spinner size="large" />}
            </FormField>
            <FormField
              label="Permission"
              stretch
              description="List of Eligible Permissions"
              errorText={permissionError}
            >
              <Multiselect
                statusType={getStatusType(permissionsQuery)}
                placeholder="Select Permissions"
                loadingText="Loading Permissions"
                filteringType="auto"
                empty="No options"
                options={permissions.map((perm) => ({
                  label: perm.name,
                  value: perm.id,
                  description: perm.id,
                }))}
                selectedOptions={permission}
                onChange={({ detail }) => {
                  setPermissionError("");
                  setPermission(detail.selectedOptions);
                }}
                selectedAriaLabel="selected"
                deselectAriaLabel={(e) => `Remove ${e.label}`}
              />
            </FormField>
            <FormField
              label="Max duration"
              stretch
              description="Maximum elevated access request duration in hours"
              errorText={durationError}
            >
              <Input
                value={duration}
                onChange={(event) => {
                  setDurationError("");
                  Number(event.detail.value) > 8000
                    ? setDurationError("Enter a number between 1 and 8000")
                    : setDuration(event.detail.value);
                }}
                type="number"
                placeholder="Enter number between 1-8000"
              />
            </FormField>
            <FormField
              label="Approval required"
              stretch
              description="Determines if approval is required for elevated access"
            >
              <Toggle
                onChange={({ detail }) => setApprovalRequired(detail.checked)}
                checked={approvalRequired}
              >
                Approval required
              </Toggle>
            </FormField>
            <FormField
              label="Auto-approve on-call"
              stretch
              description="Automatically approve requests from users currently on-call (requires BetterStack integration)"
            >
              <Toggle
                onChange={({ detail }) => setAutoApprovalOnCall(detail.checked)}
                checked={autoApprovalOnCall}
              >
                Auto-approve on-call
              </Toggle>
            </FormField>
            <FormField
              label="Allow self-approval"
              stretch
              description="Allow users to approve their own requests (when they are also an approver)"
            >
              <Toggle
                onChange={({ detail }) => setAllowSelfApproval(detail.checked)}
                checked={allowSelfApproval}
              >
                Allow self-approval
              </Toggle>
            </FormField>
          </SpaceBetween>
        </Form>
      </Modal>
      <Modal
        onDismiss={() => setDeleteVisible(false)}
        visible={deleteVisible}
        closeAriaLabel="Close modal"
        size="medium"
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button
                variant="link"
                onClick={() => {
                  setDeleteVisible(false);
                }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleDelete}
                loading={deleteMutation.isPending}
              >
                Confirm
              </Button>
            </SpaceBetween>
          </Box>
        }
        header="Delete eligibility policy"
      >
        Are you sure you want to delete policy ?
      </Modal>
      {(editItem || (selectedItems && selectedItems.length > 0)) && (
        <Modal
          onDismiss={() => handleDismiss()}
          visible={editVisible}
          closeAriaLabel="Close modal"
          size="large"
          footer={
            <Box float="right">
              <SpaceBetween direction="horizontal" size="xs">
                <Button
                  variant="link"
                  onClick={() => {
                    handleDismiss();
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={handleConfirmEdit}
                  loading={editMutation.isPending}
                >
                  Confirm
                </Button>
              </SpaceBetween>
            </Box>
          }
          header="Edit policy"
        >
          <SpaceBetween size="l">
            <ColumnLayout columns={3} variant="text-grid">
              <ValueWithLabel label="Entity type">
                {(editItem || selectedItems?.[0] as EligibilityResponse)?.type}
              </ValueWithLabel>
              <ValueWithLabel label="Name">
                {(editItem || selectedItems?.[0] as EligibilityResponse)?.name}
              </ValueWithLabel>
              <ValueWithLabel label="Id">{(editItem || selectedItems?.[0] as EligibilityResponse)?.id}</ValueWithLabel>
            </ColumnLayout>
            <FormField
              label="Account"
              stretch
              description="List of Eligible Accounts"
              errorText={accountError}
            >
              <Multiselect
                statusType={getStatusType(accountsQuery)}
                placeholder="Select accounts"
                loadingText="Loading accounts"
                filteringType="auto"
                empty="No options"
                options={accounts.map((acc) => ({
                  label: acc.name,
                  value: acc.id,
                  description: acc.id,
                }))}
                selectedOptions={account}
                onChange={({ detail }) => {
                  setAccountError("");
                  setAccount([...detail.selectedOptions]);
                }}
                selectedAriaLabel="selected"
                deselectAriaLabel={(e) => `Remove ${e.label}`}
              />
            </FormField>
            <FormField
              label="OU"
              stretch
              description="List of Eligible OUs"
              errorText={ouError}
            >
              {ous.length === 1 ? (
                <Ous
                  options={ous}
                  setResource={setOU}
                  resource={ou}
                />
              ) : <Spinner size="large" />}
            </FormField>
            <FormField
              label="Permission"
              stretch
              description="List of Eligible Permissions"
              errorText={permissionError}
            >
              <Multiselect
                statusType={getStatusType(permissionsQuery)}
                placeholder="Select Permissions"
                loadingText="Loading Permissions"
                filteringType="auto"
                empty="No options"
                options={permissions.map((perm) => ({
                  label: perm.name,
                  value: perm.id,
                  description: perm.id,
                }))}
                selectedOptions={permission}
                onChange={({ detail }) => {
                  setPermissionError("");
                  setPermission(detail.selectedOptions);
                }}
                selectedAriaLabel="selected"
                deselectAriaLabel={(e) => `Remove ${e.label}`}
              />
            </FormField>
            <FormField
              label="Max duration"
              stretch
              description="Maximum elevated access request duration in hours"
              errorText={durationError}
            >
              <Input
                value={duration}
                onChange={(event) => {
                  setDurationError("");
                  Number(event.detail.value) > 8000
                    ? setDurationError("Enter a number between 1 and 8000")
                    : setDuration(event.detail.value);
                }}
                type="number"
                placeholder="Enter number between 1-8000"
              />
            </FormField>
            <FormField
              label="Approval required"
              stretch
              description="Determines if approval is required for elevated access"
            >
              <Toggle
                onChange={({ detail }) => setApprovalRequired(detail.checked)}
                checked={approvalRequired}
              >
                Approval required
              </Toggle>
            </FormField>
            <FormField
              label="Auto-approve on-call"
              stretch
              description="Automatically approve requests from users currently on-call (requires BetterStack integration)"
            >
              <Toggle
                onChange={({ detail }) => setAutoApprovalOnCall(detail.checked)}
                checked={autoApprovalOnCall}
              >
                Auto-approve on-call
              </Toggle>
            </FormField>
            <FormField
              label="Allow self-approval"
              stretch
              description="Allow users to approve their own requests (when they are also an approver)"
            >
              <Toggle
                onChange={({ detail }) => setAllowSelfApproval(detail.checked)}
                checked={allowSelfApproval}
              >
                Allow self-approval
              </Toggle>
            </FormField>
          </SpaceBetween>
        </Modal>
      )}
    </div>
  );
}

export default Eligible;
