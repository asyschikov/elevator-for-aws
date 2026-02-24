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
import { $api } from "../../api/client";
import Status from "../Shared/Status";
import { useLocation } from "wouter";

interface Preferences {
  pageSize?: number;
  visibleContent?: readonly string[];
}

interface RequestItem {
  id: string;
  email: string;
  accountName: string;
  accountId: string;
  role: string;
  startTime: string;
  duration: number;
  justification: string;
  ticketNo?: string;
  status: string;
  createdAt?: string;
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
    cell: (item: RequestItem) => item.id,
    width: 50,
  },
  {
    id: "email",
    sortingField: "email",
    header: "Requester",
    cell: (item: RequestItem) => (
      <Link onFollow={(e) => { e.preventDefault(); navigate(`/requests/view/${item.id}`); }}>
        {item.email}
      </Link>
    ),
    minWidth: 160,
  },
  {
    id: "account",
    sortingField: "account",
    header: "Account",
    cell: (item: RequestItem) => item.accountName,
    minWidth: 10,
  },
  {
    id: "role",
    sortingField: "role",
    header: "Role",
    cell: (item: RequestItem) => item.role,
    minWidth: 10,
  },
  {
    id: "startTime",
    sortingField: "startTime",
    header: "StartTime",
    cell: (item: RequestItem) => convertAwsDateTime(item.startTime),
    minWidth: 160,
  },
  {
    id: "duration",
    sortingField: "duration",
    header: "Duration",
    cell: (item: RequestItem) => `${item.duration} hours`,
    maxWidth: 120,
  },
  {
    id: "justification",
    sortingField: "justification",
    header: "Justification",
    cell: (item: RequestItem) => item.justification,
    maxWidth: 200,
  },
  {
    id: "status",
    sortingField: "status",
    header: "Status",
    cell: (item: RequestItem) => <Status status={item.status} />,
    minWidth: 120,
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
          { value: 10, label: "10 Requests" },
          { value: 30, label: "30 Requests" },
          { value: 50, label: "50 Requests" },
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
            label: "Request properties",
            options: [
              { id: "email", label: "Requester" },
              { id: "account", label: "Account" },
              { id: "role", label: "Role" },
              { id: "duration", label: "Duration" },
              { id: "startTime", label: "StartTime" },
              { id: "justification", label: "Justification" },
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

interface ViewProps {
  addNotification: (notifications: any[]) => void;
  setActiveHref: (href: string) => void;
  user: string;
  group?: string[];
}

function View(props: ViewProps) {
  const [, navigate] = useLocation();
  const COLUMN_DEFINITIONS = useMemo(() => getColumnDefinitions(navigate), [navigate]);

  // React Query hooks
  const requestsQuery = $api.useQuery("get", "/requests", undefined, {
    refetchInterval: 30000, // Poll every 30 seconds
  });

  // Derive filtered data from query - filter by user and normalize status
  const allItems = useMemo(() => {
    const data = requestsQuery.data as { items?: Record<string, unknown>[] } | undefined;
    const items = data?.items as unknown as RequestItem[] | undefined;
    if (!items) return [];

    return items
      .filter((item) => item.email === props.user)
      .map((item) => {
        // Normalize status for display
        if (
          item.status === "ended" ||
          item.status === "revoked" ||
          item.status === "in progress" ||
          item.status === "scheduled"
        ) {
          return { ...item, status: "approved" };
        }
        return item;
      })
      .sort((a, b) => ((a.createdAt ?? "") < (b.createdAt ?? "") ? 1 : -1));
  }, [requestsQuery.data, props.user]);

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
      "status",
    ],
  });

  const [selectedOption, setSelectedOption] = useState<{ label: string; value: string }>(defaultStatus);

  // Helper functions
  function prepareSelectOptions(field: string, defaultOption: { label: string; value: string }) {
    const optionSet: string[] = [];
    allItems.forEach((item) => {
      const value = item[field as keyof RequestItem] as string;
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

  function matchesStatus(item: RequestItem, selectedStatus: { label: string; value: string }) {
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

        return SEARCHABLE_COLUMNS.map((key) => item[key as keyof RequestItem]).some(
          (value) =>
            typeof value === "string" &&
            value.toLowerCase().indexOf(filteringTextLowerCase) > -1
        );
      },
      empty: (
        <EmptyState
          title="No requests"
          subtitle="No requests to display."
          action={<Button onClick={handleCreate}>Create Request</Button>}
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


  function handleRefresh() {
    requestsQuery.refetch();
  }

  function handleCreate() {
    navigate("/requests/request");
    props.setActiveHref("/requests/request");
  }

  return (
    <div>
      <Table
        {...collectionProps}
        resizableColumns={true}
        loading={requestsQuery.isLoading}
        loadingText="Fetching requests"
        header={
          <Header
            counter={`(${allItems.length})`}
            actions={
              <SpaceBetween size="s" direction="horizontal">
                <Button
                  iconName="refresh"
                  onClick={handleRefresh}
                  loading={requestsQuery.isFetching}
                />
                <Button onClick={handleCreate} variant="primary">
                  Create request
                </Button>
              </SpaceBetween>
            }
            description="Elevated access requested by you"
          >
            Requests
          </Header>
        }
        filter={
          <div style={{ display: 'flex', flexWrap: 'wrap', flexGrow: 10, marginRight: '2rem' }}>
            <TextFilter
              {...filterProps}
              filteringPlaceholder="Find request"
              countText={String(filteredItemsCount)}
              style={{ flexGrow: 6, width: 'auto', maxWidth: 728, marginRight: '1rem' }}
            />
            <Select
              {...filterProps}
              style={{ maxWidth: 130, flexGrow: 2, width: 'auto', marginRight: '1rem' }}
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
    </div>
  );
}

export default View;
