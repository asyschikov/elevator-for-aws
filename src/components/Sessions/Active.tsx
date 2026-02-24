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
  Modal,
  Select,
  Textarea,
  FormField,
  ColumnLayout,
  ExpandableSection,
  Link,
} from "@cloudscape-design/components";
import { useCollection } from "@cloudscape-design/collection-hooks";
import { useLocation } from "wouter";
import { $api } from "../../api/client";
import Status from "../Shared/Status";
import Details from "../Shared/Details";
import Logs from "../Sessions/Logs";
import Timer from "../Sessions/Timer";

interface Preferences {
  pageSize?: number;
  visibleContent?: readonly string[];
}

interface SessionItem {
  id: string;
  email: string;
  accountName: string;
  accountId: string;
  role: string;
  startTime: string;
  endTime?: string;
  duration: number;
  justification: string;
  ticketNo?: string;
  status: string;
  approvers?: string[];
  approver?: string;
  comment?: string;
  updatedAt?: string;
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
  const userFriendlyFormat = date.toLocaleString('en-US', options);
  return userFriendlyFormat;
}

const getColumnDefinitions = (navigate: (to: string) => void) => [
  {
    id: "id",
    sortingField: "id",
    header: "Id",
    cell: (item: SessionItem) => item.id,
    width: 50,
  },
  {
    id: "email",
    sortingField: "email",
    header: "Requester",
    cell: (item: SessionItem) => (
      <Link onFollow={(e) => { e.preventDefault(); navigate(`/sessions/${item.id}`); }}>
        {item.email}
      </Link>
    ),
    minWidth: 160,
  },
  {
    id: "account",
    sortingField: "account",
    header: "Account",
    cell: (item: SessionItem) => item.accountName,
    minWidth: 10,
  },
  {
    id: "role",
    sortingField: "role",
    header: "Role",
    cell: (item: SessionItem) => item.role,
    minWidth: 10,
  },
  {
    id: "startTime",
    sortingField: "startTime",
    header: "StartTime",
    cell: (item: SessionItem) => convertAwsDateTime(item.startTime),
    minWidth: 160,
  },
  {
    id: "duration",
    sortingField: "duration",
    header: "Duration",
    cell: (item: SessionItem) => `${item.duration} hours`,
    maxWidth: 120,
  },
  {
    id: "justification",
    sortingField: "justification",
    header: "Justification",
    cell: (item: SessionItem) => item.justification,
    maxWidth: 200,
  },
  {
    id: "ticketNo",
    sortingField: "ticketNo",
    header: "Ticket no",
    cell: (item: SessionItem) => item.ticketNo || "-",
    minWidth: 10,
  },
  {
    id: "status",
    sortingField: "status",
    header: "Status",
    cell: (item: SessionItem) => <Status status={item.status} />,
    minWidth: 10,
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
          { value: 10, label: "10 Sessions" },
          { value: 30, label: "30 Sessions" },
          { value: 50, label: "50 Sessions" },
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
            label: "Sessions properties",
            options: [
              { id: "email", label: "Requester" },
              { id: "account", label: "Account" },
              { id: "role", label: "Role" },
              { id: "duration", label: "Duration" },
              { id: "startTime", label: "StartTime" },
              { id: "justification", label: "Justification" },
              { id: "ticketNo", label: "TicketNo" },
              { id: "status", label: "Status" },
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

const defaultStatus: { label: string; value: string } = {
  label: "All status",
  value: "0",
};

interface ActiveProps {
  addNotification: (notifications: any[]) => void;
  setActiveHref: (href: string) => void;
  user: string;
  group?: string[];
}

function Active(props: ActiveProps) {
  const [, navigate] = useLocation();
  const COLUMN_DEFINITIONS = useMemo(() => getColumnDefinitions(navigate), [navigate]);

  // React Query hooks
  const requestsQuery = $api.useQuery("get", "/requests", undefined, {
    refetchInterval: 30000, // Poll every 30 seconds
  });

  const settingsQuery = $api.useQuery("get", "/settings");

  // Revoke mutation
  const revokeMutation = $api.useMutation("put", "/requests/{request_id}", {
    onSuccess: () => {
      requestsQuery.refetch();
      setVisible(false);
      setrevokeVisible(false);
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

  // Derive filtered data from query
  const allItems = useMemo(() => {
    const data = requestsQuery.data as { items?: Record<string, unknown>[] } | undefined;
    const items = data?.items as unknown as SessionItem[] | undefined;
    if (!items) return [];

    // Filter for scheduled or in progress sessions where user is requester or approver
    return items
      .filter((item) =>
        (item.status === "scheduled" || item.status === "in progress" || item.status === "granted") &&
        (item.email === props.user || item.approvers?.includes(props.user))
      )
      .sort((a, b) => ((a.updatedAt ?? "") < (b.updatedAt ?? "") ? 1 : -1));
  }, [requestsQuery.data, props.user]);

  // Settings derived data
  const commentRequired = (settingsQuery.data as { comments?: boolean } | undefined)?.comments ?? true;

  // UI state
  const [preferences, setPreferences] = useState<Preferences>({
    pageSize: 10,
    visibleContent: [
      "email",
      "account",
      "role",
      "duration",
      "startTime",
      "justification",
      "ticketNo",
      "status",
    ],
  });

  const [selectedOption, setSelectedOption] = useState<{ label: string; value: string }>(defaultStatus);
  const [visible, setVisible] = useState(false);
  const [revokeVisible, setrevokeVisible] = useState(false);
  const [comment, setComment] = useState<string>("");
  const [commentError, setCommentError] = useState<string>("");
  const [expand, setExpand] = useState(false);
  const [viewLogs, setViewLogs] = useState(false);

  // Helper functions
  function prepareSelectOptions(field: string, defaultOption: { label: string; value: string }) {
    const optionSet: string[] = [];
    allItems.forEach((item) => {
      const value = item[field as keyof SessionItem] as string;
      if (optionSet.indexOf(value) === -1) {
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

  const selectStatusOptions = prepareSelectOptions("status", defaultStatus);

  function matchesStatus(item: SessionItem, selectedStatus: { label: string; value: string }) {
    return selectedStatus === defaultStatus || item.status === selectedStatus.label;
  }

  const SEARCHABLE_COLUMNS = COLUMN_DEFINITIONS.map((item) => item.id);

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
        if (!matchesStatus(item, selectedOption)) {
          return false;
        }
        const filteringTextLowerCase = filteringText.toLowerCase();

        return SEARCHABLE_COLUMNS.map((key) => item[key as keyof SessionItem]).some(
          (value) =>
            typeof value === "string" &&
            value.toLowerCase().indexOf(filteringTextLowerCase) > -1
        );
      },
      empty: (
        <EmptyState
          title="No elevated access"
          subtitle="No elevated access to display."
          action={<Button onClick={handleCreate}>Create request</Button>}
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
    sorting: {
      defaultState: {
        sortingColumn: { sortingField: "startTime" },
        isDescending: true,
      },
    },
    selection: {},
  });

  const { selectedItems } = collectionProps;

  function handleRefresh() {
    requestsQuery.refetch();
  }

  function handleSelect() {
    setVisible(true);
    setExpand(false);
    setViewLogs(true);
  }

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

  function handleCreate() {
    navigate("/requests/request");
    props.setActiveHref("/requests/request");
  }

  function revoke() {
    if (selectedItems && selectedItems.length > 0) {
      const item = selectedItems[0] as SessionItem;
      revokeMutation.mutate({
        params: { path: { request_id: item.id } },
        body: {
          id: item.id,
          status: "revoked",
          revokeComment: comment,
        }
      });
    }
  }

  function handleRevoke() {
    if ((!comment && commentRequired) || (comment && !(/[\p{L}\p{N}]/u.test(comment[0])))) {
      setCommentError("Enter valid reason for revoking elevated access");
    } else {
      revoke();
    }
  }

  return (
    <div>
      <Table
        {...collectionProps}
        resizableColumns={true}
        loading={requestsQuery.isLoading}
        loadingText="Fetching elevated access"
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
                  onClick={handleRefresh}
                  loading={requestsQuery.isFetching}
                />
                <Button
                  onClick={() => setrevokeVisible(true)}
                  disabled={!selectedItems?.length}
                >
                  Revoke
                </Button>
                <Button
                  disabled={!selectedItems?.length}
                  variant="primary"
                  onClick={handleSelect}
                >
                  View details
                </Button>
              </SpaceBetween>
            }
            description="Scheduled or in-progress elevated access requests"
          >
            Elevated access
          </Header>
        }
        filter={
          <div style={{ display: 'flex', flexWrap: 'wrap', flexGrow: 10, marginRight: '2rem' }}>
            <div style={{ flexGrow: 6, maxWidth: 728, marginRight: '1rem' }}>
              <TextFilter
                {...filterProps}
                filteringPlaceholder="Find elevated access"
                countText={String(filteredItemsCount)}
              />
            </div>
            <div style={{ maxWidth: 130, flexGrow: 2, marginRight: '1rem' }}>
              <Select
                selectedAriaLabel="Selected"
                options={selectStatusOptions}
                selectedOption={selectedOption}
                onChange={({ detail }) =>
                  setSelectedOption(detail.selectedOption as { label: string; value: string })
                }
              />
            </div>
          </div>
        }
        columnDefinitions={COLUMN_DEFINITIONS}
        visibleColumns={preferences.visibleContent}
        pagination={<Pagination {...paginationProps} />}
        preferences={
          <MyCollectionPreferences
            preferences={preferences}
            setPreferences={setPreferences}
          />
        }
        items={items}
        selectionType="single"
      />
      <div>
        {selectedItems && selectedItems.length > 0 && (
          <Modal
            onDismiss={() => {
              setVisible(false);
              setExpand(true);
              setViewLogs(false);
            }}
            visible={visible}
            closeAriaLabel="Close modal"
            size="large"
            footer={
              <Box float="right">
                <SpaceBetween direction="horizontal" size="s">
                  <Button
                    variant="link"
                    onClick={() => {
                      setViewLogs(false);
                      setVisible(false);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() => setrevokeVisible(true)}
                    disabled={!selectedItems?.length || !(props.user === (selectedItems[0] as SessionItem).email || (selectedItems[0] as SessionItem).approvers?.includes(props.user))}
                  >
                    Revoke
                  </Button>
                </SpaceBetween>
              </Box>
            }
            header="Elevated access details"
          >
            <SpaceBetween size="s">
              <ColumnLayout columns={3} variant="text-grid">
                <SpaceBetween size="l">
                  <ValueWithLabel label="Requester">
                    {(selectedItems[0] as SessionItem).email}
                  </ValueWithLabel>
                  <ValueWithLabel label="Status">
                    <Status status={(selectedItems[0] as SessionItem).status} />
                  </ValueWithLabel>
                  <ValueWithLabel label="Justification">
                    {(selectedItems[0] as SessionItem).justification}
                  </ValueWithLabel>
                </SpaceBetween>
                <SpaceBetween size="l">
                  <ValueWithLabel label="Account">
                    {`${(selectedItems[0] as SessionItem).accountName} (${(selectedItems[0] as SessionItem).accountId})`}
                  </ValueWithLabel>
                  <ValueWithLabel label="Role">
                    {(selectedItems[0] as SessionItem).role}
                  </ValueWithLabel>
                  <ValueWithLabel label="TicketNo">
                    {(selectedItems[0] as SessionItem).ticketNo}
                  </ValueWithLabel>
                </SpaceBetween>
                <SpaceBetween size="l">
                  <ValueWithLabel label="Start time">
                    {convertAwsDateTime((selectedItems[0] as SessionItem).startTime)}
                  </ValueWithLabel>
                  <ValueWithLabel label="Duration">
                    {`${(selectedItems[0] as SessionItem).duration} Hours`}
                  </ValueWithLabel>
                  <Timer item={selectedItems[0] as SessionItem} />
                </SpaceBetween>
              </ColumnLayout>

              <div>
                {(selectedItems[0] as SessionItem).approver && (
                  <div>
                    <hr style={{ marginBottom: "10px", marginTop: "10px", border: "none", borderTop: "1px solid #e9ebed" }} />
                    <ColumnLayout columns={3}>
                      <SpaceBetween size="m">
                        <ValueWithLabel label="Approved by">
                          {(selectedItems[0] as SessionItem).approver}
                        </ValueWithLabel>
                        <ValueWithLabel label="Comments">
                          {(selectedItems[0] as SessionItem).comment}
                        </ValueWithLabel>
                      </SpaceBetween>
                    </ColumnLayout>
                  </div>
                )}
              </div>
              {((selectedItems[0] as any).sessionStatus === "in-progress" || (selectedItems[0] as SessionItem).status === "granted") && (
                <div>
                  <ExpandableSection
                    variant="footer"
                    header="Session activity logs"
                  >
                    <div>{viewLogs && <Logs item={selectedItems[0] as SessionItem} />}</div>
                  </ExpandableSection>
                </div>
              )}
            </SpaceBetween>
          </Modal>
        )}
      </div>
      <div>
        {selectedItems && selectedItems.length > 0 && (
          <Modal
            onDismiss={() => {
              setrevokeVisible(false);
              setComment("");
            }}
            visible={revokeVisible}
            closeAriaLabel="Close modal"
            size="large"
            footer={
              <Box float="right">
                <SpaceBetween direction="horizontal" size="s">
                  <Button
                    variant="link"
                    onClick={() => {
                      setrevokeVisible(false);
                      setComment("");
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
            <SpaceBetween size="m">
              <Details item={selectedItems[0] as SessionItem} status={expand} />
              <hr style={{ marginBottom: "10px", marginTop: "10px", border: "none", borderTop: "1px solid #e9ebed" }} />
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
            </SpaceBetween>
          </Modal>
        )}
      </div>
    </div>
  );
}

export default Active;
