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
  Spinner,
  Link,
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
type ApproverResponse = components["schemas"]["ApproverResponse"];
type CreateApproverInput = components["schemas"]["CreateApproverInput"];
type UpdateApproverInput = components["schemas"]["UpdateApproverInput"];

// Column definitions factory - takes groups map for name lookup and edit handler
const createColumnDefinitions = (
  groupsMap: Map<string, string>,
  onNameClick: (item: ApproverResponse) => void
) => [
  {
    id: "id",
    sortingField: "id",
    header: "Account/OU",
    cell: (item: ApproverResponse) => (
      <Link onFollow={(e) => { e.preventDefault(); onNameClick(item); }}>
        {`${item.id} (${item.name})`}
      </Link>
    ),
    width: 320,
  },
  {
    id: "type",
    sortingField: "type",
    header: "Type",
    cell: (item: ApproverResponse) => item.type,
    width: 120,
  },
  {
    id: "approvers",
    sortingField: "approvers",
    header: "Approver groups",
    cell: (item: ApproverResponse) => (
      <TextContent>
        <ul>
          {item.groupIds.map((groupId) => (
            <li key={groupId}>{groupsMap.get(groupId) || groupId}</li>
          ))}
        </ul>
      </TextContent>
    ),
    width: 300,
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
          { value: 10, label: "10 Approvers" },
          { value: 30, label: "30 Approvers" },
          { value: 50, label: "50 Approvers" },
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
            label: "Approver properties",
            options: [
              { id: "id", label: "Account/OU", editable: false },
              { id: "type", label: "Type" },
              { id: "approvers", label: "Approver groups" },
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

interface ApproversProps {
  addNotification: (notifications: Notification[]) => void;
  setActiveHref?: (href: string) => void;
  user?: string;
  group?: string[];
}

function Approvers(props: ApproversProps) {

  // UI state - Type needs to be declared first since queries depend on it
  const [Type, setType] = useState<SelectProps.Option | null>(null);

  // React Query hooks using $api.useQuery style with typed endpoints
  const approversQuery = $api.useQuery("get", "/approvers");

  const accountsQuery = $api.useQuery("get", "/accounts", undefined, {
    enabled: Type?.value === "Account",
  });

  const ousQuery = $api.useQuery("get", "/ous", undefined, {
    enabled: Type?.value === "OU",
  });

  const groupsQuery = $api.useQuery("get", "/idc-groups");

  // Mutations using $api.useMutation style with typed endpoints
  const addMutation = $api.useMutation("post", "/approvers", {
    onSuccess: () => {
      approversQuery.refetch();
      handleDismiss();
      props.addNotification([
        {
          type: "success",
          content: "Approvers added successfully",
          dismissible: true,
          onDismiss: () => props.addNotification([]),
        },
      ]);
    },
  });

  const deleteMutation = $api.useMutation("delete", "/approvers/{approver_id}", {
    onSuccess: () => {
      approversQuery.refetch();
      setDeleteVisible(false);
      props.addNotification([
        {
          type: "success",
          content: "Approvers deleted successfully",
          dismissible: true,
          onDismiss: () => props.addNotification([]),
        },
      ]);
    },
  });

  const editMutation = $api.useMutation("put", "/approvers/{approver_id}", {
    onSuccess: () => {
      approversQuery.refetch();
      handleDismiss();
      props.addNotification([
        {
          type: "success",
          content: "Approvers edited successfully",
          dismissible: true,
          onDismiss: () => props.addNotification([]),
        },
      ]);
    },
  });

  // Derived data from queries - properly typed
  const approversData = approversQuery.data;
  const allItems: ApproverResponse[] = approversData?.items ?? [];
  const accounts: AccountInfo[] = Array.isArray(accountsQuery.data) ? accountsQuery.data : [];
  const ousData = ousQuery.data;
  const ous = Array.isArray(ousData) ? ousData : [];
  const groups: GroupInfo[] = Array.isArray(groupsQuery.data) ? groupsQuery.data : [];

  // Build a map of groupId -> groupName for efficient lookup
  const groupsMap = useMemo(() => {
    const map = new Map<string, string>();
    groups.forEach((group) => {
      map.set(group.GroupId, group.DisplayName);
    });
    return map;
  }, [groups]);

  // State for item being edited via name click
  const [editItem, setEditItem] = useState<ApproverResponse | null>(null);

  // Handler for name column click - opens edit modal for the clicked item
  const handleNameClick = (item: ApproverResponse) => {
    setEditItem(item);
    setApprover(
      item.groupIds.map((groupId: string) => {
        // Use groupsMap to resolve name, fallback to groupNames array, then groupId
        const groupName = groupsMap.get(groupId) ?? groupId;
        return {
          label: groupName,
          value: groupId,
          description: groupId,
        };
      })
    );
    setEditVisible(true);
  };

  // Create column definitions with the groups map and name click handler
  const columnDefinitions = useMemo(
    () => createColumnDefinitions(groupsMap, handleNameClick),
    [groupsMap]
  );

  // UI state (only what's truly needed for UI interactions)
  const [preferences, setPreferences] = useState<Preferences>({
    pageSize: 10,
    visibleContent: [
      "id",
      "type",
      "approvers",
    ],
  });

  const [selectedOption, setSelectedOption] = useState<{ label: string; value: string }>(defaultType);
  const [visible, setVisible] = useState(false);
  const [deleteVisible, setDeleteVisible] = useState(false);
  const [editVisible, setEditVisible] = useState(false);
  // Type state is declared above with the queries since they depend on it
  const [typeError, setTypeError] = useState("");
  const [approverError, setApproverError] = useState("");
  const [resource, setResource] = useState<MultiselectProps.Option[]>([]);
  const [resourceError, setResourceError] = useState("");
  const [approver, setApprover] = useState<readonly MultiselectProps.Option[]>([]);

  // Helper functions
  function prepareSelectOptions(field: string, defaultOption: { label: string; value: string }) {
    const optionSet: string[] = [];
    allItems.forEach((item) => {
      if (optionSet.indexOf(item[field as keyof ApproverResponse] as string) === -1) {
        optionSet.push(item[field as keyof ApproverResponse] as string);
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

  function matchesType(item: ApproverResponse, selectedType: { label: string; value: string }) {
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

        return SEARCHABLE_COLUMNS.map((key) => item[key as keyof ApproverResponse]).some(
          (value) =>
            typeof value === "string" &&
            value.toLowerCase().indexOf(filteringTextLowerCase) > -1
        );
      },
      empty: (
        <EmptyState
          title="No approver"
          subtitle="No approvers to display."
          action={<Button onClick={handleAdd}>Create approver</Button>}
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
        params: { path: { approver_id: (item as ApproverResponse).id } }
      });
    });
  }

  function handleConfirmEdit() {
    const valid = validate("edit");
    // Use editItem (from name click) or selectedItems[0] (from dropdown)
    const item = editItem || (selectedItems && selectedItems.length > 0 ? selectedItems[0] as ApproverResponse : null);
    if (valid && item) {
      const body: UpdateApproverInput = {
        groupIds: approver.map(({ value }) => value ?? ""),
        groupNames: approver.map(({ label }) => label ?? ""),
      };
      editMutation.mutate({
        params: { path: { approver_id: item.id } },
        body
      });
    }
  }

  function handleEdit() {
    if (selectedItems && selectedItems.length > 0) {
      const item = selectedItems[0] as ApproverResponse;
      setApprover(
        item.groupIds.map((groupId: string) => {
          // Use groupsMap to resolve name, fallback to groupId
          const groupName = groupsMap.get(groupId) ?? groupId;
          return {
            label: groupName,
            value: groupId,
            description: groupId,
          };
        })
      );
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
    if (approver.length < 1) {
      valid = false;
      setApproverError("Select valid approver groups");
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
        const body: CreateApproverInput = {
          type: Type.value as "Account" | "OU",
          name: item.label ?? "",
          groupIds: approver.map(({ value }) => value ?? ""),
          groupNames: approver.map(({ label }) => label ?? ""),
          id: item.value ?? "",
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
    setApprover([]);
    setApproverError("");
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
        loading={approversQuery.isLoading}
        loadingText="Fetching approvers"
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
                  onClick={() => approversQuery.refetch()}
                  loading={approversQuery.isFetching}
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
                  Add approvers
                </Button>
              </SpaceBetween>
            }
          >
            Approval policy
          </Header>
        }
        filter={
          <div style={{ display: 'flex', flexWrap: 'wrap', flexGrow: 10, marginRight: '2rem' }}>
            <div style={{ flexGrow: 6, maxWidth: 728, marginRight: '1rem' }}>
              <TextFilter
                {...filterProps}
                filteringPlaceholder="Find approvers"
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
        header="Approvers"
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
                Add approvers
              </Button>
            </SpaceBetween>
          }
        >
          <SpaceBetween direction="vertical" size="l">
            <FormField
              label="Entity type"
              stretch
              description="Account or organisation unit"
              errorText={typeError}
            >
              <Select
                selectedAriaLabel="Selected"
                options={[
                  {
                    label: "Organizational Unit",
                    value: "OU",
                  },
                  {
                    label: "Account",
                    value: "Account",
                  },
                ]}
                selectedOption={Type}
                onChange={(event) => {
                  setTypeError("");
                  onTypeChange(event.detail.selectedOption);
                }}
              />
            </FormField>
            {Type?.value === "Account" && (
              <FormField
                label="Accounts"
                stretch
                description="Target accounts for approver group management"
                errorText={resourceError}
              >
                <Multiselect
                  statusType={getStatusType(accountsQuery)}
                  placeholder="Select Accounts"
                  loadingText="Loading accounts"
                  filteringType="auto"
                  empty="No options"
                  options={accounts.map((account) => ({
                    label: account.name,
                    value: account.id,
                    description: account.id,
                    disabled: allItems.map(({ id }) => id).includes(account.id),
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
            {Type?.value === "OU" && (
              <FormField
                label="OUs"
                stretch
                description="Organizational Unit"
                errorText={resourceError}
              >
                {ous.length === 1 ? (<Ous
                  options={ous}
                  setResource={setResource}
                  resource={resource}
                  action="create"
                  allItems={allItems}
                  />) : <Spinner size="large"/>}
              </FormField>
            )}
            <FormField
              label="Approver Groups"
              stretch
              description="list of approver groups from IAM IdC"
              errorText={approverError}
            >
              <Multiselect
                statusType={getStatusType(groupsQuery)}
                placeholder="Select groups"
                loadingText="Loading groups"
                filteringType="auto"
                empty="No options"
                options={groups.map((group) => ({
                  label: group.DisplayName,
                  value: group.GroupId,
                  description: group.GroupId,
                }))}
                selectedOptions={approver}
                onChange={({ detail }) => {
                  setApproverError("");
                  setApprover(detail.selectedOptions);
                }}
                selectedAriaLabel="selected"
                deselectAriaLabel={(e) => `Remove ${e.label}`}
              />
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
        header="Delete approvers"
      >
        Are you sure you want to delete approvers ?
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
          header="Edit approvers"
        >
          <SpaceBetween size="l">
            <ColumnLayout columns={3} variant="text-grid">
              <ValueWithLabel label="Entity type">
                {(editItem || selectedItems?.[0] as ApproverResponse)?.type}
              </ValueWithLabel>
              <ValueWithLabel label="Name">
                {(editItem || selectedItems?.[0] as ApproverResponse)?.name}
              </ValueWithLabel>
              <ValueWithLabel label="Id">{(editItem || selectedItems?.[0] as ApproverResponse)?.id}</ValueWithLabel>
            </ColumnLayout>
            <FormField
              label="Approver Groups"
              stretch
              description="list of approver groups from IAM IdC"
              errorText={approverError}
            >
              <Multiselect
                statusType={getStatusType(groupsQuery)}
                placeholder="Select groups"
                loadingText="Loading groups"
                filteringType="auto"
                empty="No options"
                options={groups.map((group) => ({
                  label: group.DisplayName,
                  value: group.GroupId,
                  description: group.GroupId,
                }))}
                selectedOptions={approver}
                onChange={({ detail }) => {
                  setApproverError("");
                  setApprover(detail.selectedOptions);
                }}
                selectedAriaLabel="selected"
                deselectAriaLabel={(e) => `Remove ${e.label}`}
              />
            </FormField>
          </SpaceBetween>
        </Modal>
      )}
    </div>
  );
}

export default Approvers;
