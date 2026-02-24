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
  Link,
} from "@cloudscape-design/components";
import { useCollection } from "@cloudscape-design/collection-hooks";
import { $api } from "../../api/client";
import { useLocation } from "wouter";
import Status from "../Shared/Status";

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
  approvers?: string[];
  createdAt?: string;
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
      <Link onFollow={(e) => { e.preventDefault(); navigate(`/approvals/approve/${item.id}`); }}>
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
    cell: (item: RequestItem) => item.startTime,
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
    id: "ticketNo",
    sortingField: "ticketNo",
    header: "TicketNo",
    cell: (item: RequestItem) => item.ticketNo || "-",
    minWidth: 10,
  },
  {
    id: "status",
    sortingField: "status",
    header: "Status",
    cell: (item: RequestItem) => <Status status={item.status} />,
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

interface ApprovalsProps {
  addNotification: (notifications: any[]) => void;
  setActiveHref: (href: string) => void;
  user: string;
  group?: string[];
}

function Approvals(props: ApprovalsProps) {
  const [, navigate] = useLocation();
  const COLUMN_DEFINITIONS = useMemo(() => getColumnDefinitions(navigate), [navigate]);

  // React Query hooks
  const requestsQuery = $api.useQuery("get", "/requests", undefined, {
    refetchInterval: 30000, // Poll every 30 seconds
  });

  // Derive filtered data from query
  const allItems = useMemo(() => {
    const data = requestsQuery.data as { items?: Record<string, unknown>[] } | undefined;
    const items = data?.items as unknown as RequestItem[] | undefined;
    if (!items) return [];

    // Filter for pending requests where user is an approver
    return items
      .filter((item) =>
        item.status === "pending" &&
        item.approvers?.includes(props.user)
      )
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
      "ticketNo",
      "status",
    ],
  });

  const {
    items,
    actions,
    filteredItemsCount,
    collectionProps,
    filterProps,
    paginationProps,
  } = useCollection(allItems, {
    filtering: {
      empty: (
        <EmptyState
          title="No approvals"
          subtitle="No approvals to display."
          action={<Button onClick={handleView}>View all sessions</Button>}
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

  function handleView() {
    navigate("/sessions/active");
    props.setActiveHref("/sessions/active");
  }

  function handleRefresh() {
    requestsQuery.refetch();
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
              <Button
                iconName="refresh"
                onClick={handleRefresh}
                loading={requestsQuery.isFetching}
              />
            }
            description="Approve or reject elevated access requests"
          >
            Approval Requests
          </Header>
        }
        filter={
          <TextFilter
            {...filterProps}
            filteringPlaceholder="Find request..."
            countText={String(filteredItemsCount)}
          />
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
      />
    </div>
  );
}

export default Approvals;
