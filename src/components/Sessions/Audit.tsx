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
  ColumnLayout,
  ExpandableSection,
  Select,
} from "@cloudscape-design/components";
import { useCollection } from "@cloudscape-design/collection-hooks";
import { Divider } from "antd";
import { $api } from "../../api/client";
import Status from "../Shared/Status";
import "../../index.css";
import Logs from "../Sessions/Logs";

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
  revoker?: string;
  revokeComment?: string;
  updatedAt?: string;
}

interface AuditProps {
  addNotification: (notifications: unknown[]) => void;
  setActiveHref: (href: string) => void;
  user: string;
  group?: string[];
}

interface Preferences {
  pageSize?: number;
  visibleContent?: readonly string[];
}

function convertAwsDateTime(awsDateTime: string): string {
  // Parse AWS datetime string into a Date object
  const date = new Date(awsDateTime);
  // Format date in user-friendly format
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  };
  const userFriendlyFormat = date.toLocaleString('en-US', options);
  return userFriendlyFormat
}

const COLUMN_DEFINITIONS = [
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
    cell: (item: SessionItem) => item.email,
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
    id: "endTime",
    sortingField: "endTime",
    header: "EndTime",
    cell: (item: SessionItem) => item.endTime ? convertAwsDateTime(item.endTime) : "-",
    minWidth: 10,
  },
  {
    id: "justification",
    sortingField: "justification",
    header: "Justification",
    cell: (item: SessionItem) => item.justification,
    maxWidth: 200,
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
        title: "Page size",
        options: [
          { value: 10, label: "10 Sessions" },
          { value: 30, label: "30 Sessions" },
          { value: 50, label: "50 Sessions" },
        ],
      }}
      wrapLinesPreference={{
        label: "Wrap lines",
        description: "Check to see all the text and wrap the lines",
      }}
      visibleContentPreference={{
        title: "Select visible columns",
        options: [
          {
            label: "Sessions properties",
            options: [
              // { id: "id", label: "Id", editable: false },
              { id: "email", label: "Requester" },
              { id: "account", label: "Account" },
              { id: "role", label: "Role" },
              // { id: "duration", label: "Duration" },
              { id: "startTime", label: "StartTime" },
              { id: "justification", label: "Justification" },
              { id: "endTime", label: "EndTime" },
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

function Audit(props: AuditProps) {
  const [preferences, setPreferences] = useState<Preferences>({
    pageSize: 10,
    visibleContent: [
      "email",
      "account",
      "role",
      "startTime",
      "justification",
      "endTime",
      "status",
    ],
  });

  const [selectedOption, setSelectedOption] = useState<{ label: string; value: string }>(defaultStatus);
  const [visible, setVisible] = useState(false);
  const [viewLogs, setViewLogs] = useState(false);

  // Fetch all requests
  const requestsQuery = $api.useQuery('get', '/requests', {}, {
    refetchInterval: 30000, // Poll every 30 seconds
  });

  // Filter for status "ended" or "revoked" and current user, then sort
  const allItems = useMemo((): SessionItem[] => {
    const data = requestsQuery.data as { items?: SessionItem[] } | undefined;
    const items = data?.items;
    if (!items) return [];
    return items
      .filter((item) =>
        // Filter by status
        (item.status === 'ended' || item.status === 'revoked') &&
        // Filter by user
        (item.email === props.user || item.approvers?.includes(props.user))
      )
      .sort((a, b) => ((a.updatedAt ?? "") < (b.updatedAt ?? "") ? 1 : -1));
  }, [requestsQuery.data, props.user]);

  const selectStatusOptions = useMemo(() => {
    const optionSet: string[] = [];
    allItems.forEach((item) => {
      if (optionSet.indexOf(item.status) === -1) {
        optionSet.push(item.status);
      }
    });
    optionSet.sort();
    const options: Array<{ label: string; value: string }> = [defaultStatus];
    optionSet.forEach((item, index) =>
      options.push({ label: item, value: (index + 1).toString() })
    );
    return options;
  }, [allItems]);

  function matchesStatus(item: SessionItem, selectedStatus: { label: string; value: string }) {
    return (
      selectedStatus === defaultStatus || item.status === selectedStatus.label
    );
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
      filteringFunction: (item: SessionItem, filteringText: string) => {
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
        <EmptyState title="No elevated access" subtitle="No elevated access to display." />
      ),
      noMatch: (
        <EmptyState
          title="No matches"
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

  function handleSelect() {
    setVisible(true);
    setViewLogs(true);
  }

  const ValueWithLabel = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div>
      <div className="headings">
        <Box color="inherit" fontSize="body-m">
          {label}
        </Box>
      </div>
      <div>{children}</div>
    </div>
  );

  return (
    <div className="container">
      <Table
        {...collectionProps}
        resizableColumns={true}
        loading={requestsQuery.isLoading}
        loadingText="Fetching elevated access"
        header={
          <Header
            counter={
              selectedItems.length
                ? `(${selectedItems.length}/${allItems.length})`
                : `(${allItems.length})`
            }
            actions={
              <SpaceBetween size="s" direction="horizontal">
                <Button
                  iconName="refresh"
                  onClick={() => requestsQuery.refetch()}
                  loading={requestsQuery.isFetching}
                />
                <Button
                  disabled={selectedItems.length === 0}
                  onClick={handleSelect}
                >
                  View details
                </Button>
              </SpaceBetween>
            }
            description="Ended or revoked elevated access"
          >
            Elevated access
          </Header>
        }
        filter={
          <div className="input-container">
            <TextFilter
              {...filterProps}
              filteringPlaceholder="Find elevated access"
              countText={String(filteredItemsCount)}
              className="input-filter"
            />
            <Select
              {...filterProps}
              className="select-filter engine-filter"
              selectedAriaLabel="Selected"
              options={selectStatusOptions}
              selectedOption={selectedOption}
              onChange={({ detail }) =>
                setSelectedOption(detail.selectedOption as { label: string; value: string })
              }
              ariaDescribedby={null}
            />
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
        {selectedItems.length ? (
          <Modal
            onDismiss={() => {
              setVisible(false);
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
                </SpaceBetween>
              </Box>
            }
            header="Elevated access details"
          >
            <SpaceBetween size="s">
              <ColumnLayout columns={3} variant="text-grid">
                <SpaceBetween size="l">
                  <ValueWithLabel
                    label="Requester"
                    children={`${selectedItems[0].email}`}
                  />
                  <ValueWithLabel label="Status">
                    <Status status={selectedItems[0].status} />
                  </ValueWithLabel>
                  <ValueWithLabel
                    label="Justification"
                    children={`${selectedItems[0].justification}`}
                  />
                </SpaceBetween>
                <SpaceBetween size="l">
                  <ValueWithLabel
                    label="Account"
                    children={`${selectedItems[0].accountName} (${selectedItems[0].accountId})`}
                  />
                  <ValueWithLabel
                    label="Role"
                    children={`${selectedItems[0].role}`}
                  />
                  <ValueWithLabel
                    label="TicketNo"
                    children={`${selectedItems[0].ticketNo}`}
                  />
                </SpaceBetween>
                <SpaceBetween size="l">
                  <ValueWithLabel
                    label="Start Time"
                    children={convertAwsDateTime(selectedItems[0].startTime)}
                  />
                  <ValueWithLabel
                    label="End Time"
                    children={convertAwsDateTime(selectedItems[0].endTime)}
                  />
                </SpaceBetween>
              </ColumnLayout>
              <Divider style={{ marginBottom: "7px", marginTop: "7px" }} />
              <ColumnLayout columns={3}>
                <SpaceBetween size="m">
                  <ValueWithLabel
                    label="Approved by"
                    children={`${selectedItems[0].approver}`}
                  />
                  <ValueWithLabel
                    label="Comments"
                    children={`${selectedItems[0].comment}`}
                  />
                </SpaceBetween>
                <div>
                  {selectedItems[0].status === "revoked" && (
                    <SpaceBetween size="m">
                      <ValueWithLabel
                        label={
                          selectedItems[0].revoker === props.user
                            ? "Revoked by (requester)"
                            : "Revoked by (approver)"
                        }
                        children={`${selectedItems[0].revoker}`}
                      />
                      <ValueWithLabel
                        label="Comments"
                        children={`${selectedItems[0].revokeComment}`}
                      />
                    </SpaceBetween>
                  )}
                </div>
              </ColumnLayout>
              <ExpandableSection
                variant="footer"
                header="Session activity logs"
                className="expanded"
              >
                <div>{viewLogs && <Logs item={selectedItems[0]} />}</div>
              </ExpandableSection>
            </SpaceBetween>
          </Modal>
        ) : null}
      </div>
    </div>
  );
}

export default Audit;
