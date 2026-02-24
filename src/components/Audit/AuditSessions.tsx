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
  Select,
  Link,
} from "@cloudscape-design/components";
import { useCollection } from "@cloudscape-design/collection-hooks";
import { useLocation } from "wouter";
import { $api } from "../../api/client";
import Status from "../Shared/Status";

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
  approver?: string;
  comment?: string;
  revoker?: string;
  revokeComment?: string;
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
  label: "All Status",
  value: "0",
};

interface AuditSessionsProps {
  addNotification: (notifications: any[]) => void;
  setActiveHref?: (href: string) => void;
  user: string;
  group?: string[];
}

function AuditSessions(props: AuditSessionsProps) {
  const [, navigate] = useLocation();
  const COLUMN_DEFINITIONS = useMemo(() => getColumnDefinitions(navigate), [navigate]);

  // React Query hooks
  const requestsQuery = $api.useQuery("get", "/requests", undefined, {
    refetchInterval: 30000, // Poll every 30 seconds
  });

  // Derive filtered data from query
  const allItems = useMemo(() => {
    const data = requestsQuery.data as { items?: unknown[] } | undefined;
    const items = data?.items as SessionItem[] | undefined;
    if (!items) return [];

    // Filter for ended, revoked, in progress, or scheduled sessions
    return items
      .filter((item) =>
        item.status === "ended" ||
        item.status === "revoked" ||
        item.status === "in progress" ||
        item.status === "scheduled"
      )
      .sort((a, b) => ((a.updatedAt ?? "") < (b.updatedAt ?? "") ? 1 : -1));
  }, [requestsQuery.data]);

  // UI state
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
        <EmptyState title="No sessions" subtitle="No session to display." />
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
    if (selectedItems && selectedItems.length > 0) {
      navigate(`/sessions/${(selectedItems[0] as SessionItem).id}`);
    }
  }

  return (
    <div>
      <Table
        {...collectionProps}
        resizableColumns={true}
        loading={requestsQuery.isLoading}
        loadingText="Fetching sessions"
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
                  disabled={!selectedItems?.length}
                  onClick={handleSelect}
                >
                  View Details
                </Button>
              </SpaceBetween>
            }
            description="Completed or revoked Elevator sessions"
          >
            Sessions
          </Header>
        }
        filter={
          <div style={{ display: 'flex', flexWrap: 'wrap', flexGrow: 10, marginRight: '2rem' }}>
            <div style={{ flexGrow: 6, maxWidth: 728, marginRight: '1rem' }}>
              <TextFilter
                {...filterProps}
                filteringPlaceholder="Find session"
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
    </div>
  );
}

export default AuditSessions;
