// Copyright (c) 2026 Andrey Syschikov
// SPDX-License-Identifier: MIT
// Portions derived from the AWS TEAM sample (MIT-0):
// https://github.com/aws-samples/iam-identity-center-team
import { useMemo, useRef, useState } from "react";
import {
  Box,
  Button,
  Header,
  Pagination,
  Table,
  TextFilter,
  CollectionPreferences,
  SpaceBetween
} from "@cloudscape-design/components";
import { useCollection } from "@cloudscape-design/collection-hooks";
import { $api } from "../../api/client";
import { CSVLink } from "react-csv";

const COLUMN_DEFINITIONS = [
  {
    id: "eventID",
    sortingField: "eventID",
    header: "eventID",
    cell: (item) => item.eventID,
    minWidth: 180,
  },
  {
    id: "eventName",
    sortingField: "eventName",
    header: "eventName",
    cell: (item) => item.eventName,
    minWidth: 200,
  },
  {
    id: "eventSource",
    sortingField: "eventSource",
    header: "eventSource",
    cell: (item) => item.eventSource,
    minWidth: 200,
  },
  {
    id: "eventTime",
    sortingField: "eventTime",
    header: "eventTime",
    cell: (item) => item.eventTime,
    minWidth: 180,
  },
];

const MyCollectionPreferences = ({ preferences, setPreferences }) => (
  <CollectionPreferences
    title="Preferences"
    confirmLabel="Confirm"
    cancelLabel="Cancel"
    preferences={preferences}
    onConfirm={({ detail }) => setPreferences(detail)}
    pageSizePreference={{
      title: "Page size",
      options: [
        { value: 10, label: "10 Logs" },
        { value: 30, label: "30 Logs" },
        { value: 50, label: "50 Logs" },
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
          label: "Log properties",
          options: [
            { id: "eventID", label: "eventID" },
            { id: "eventName", label: "eventName" },
            { id: "eventSource", label: "eventSource" },
            { id: "eventTime", label: "eventTime" },
          ],
        },
      ],
    }}
  />
);

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

function Logs(props) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const csvLink = useRef<any>(null);
  const [preferences, setPreferences] = useState({
    pageSize: 10,
    visibleContent: ["eventID", "eventName", "eventSource", "eventTime"],
  });

  // Mutation to start CloudTrail query for this request
  const startRequestLogs = $api.useMutation('post', '/requests/{request_id}/logs');

  // Get queryId from request item or from mutation result
  const queryId = props.item?.queryId || (startRequestLogs.data as { queryId?: string })?.queryId;

  // Query for logs (enabled when we have a queryId)
  const isSessionActive = props.item?.sessionStatus === "in-progress";
  const logsQuery = $api.useQuery('get', '/logs', {
    params: { query: { queryId: queryId || undefined } },
  }, {
    enabled: !!queryId,
    refetchInterval: isSessionActive ? 10000 : false
  });

  // Derive allItems from logsQuery data
  const allItems = useMemo(() => {
    if (!logsQuery.data || !Array.isArray(logsQuery.data)) return [];
    return logsQuery.data.map((item: Record<string, unknown>) => ({
      ...item,
      username: props.item.email,
      accountName: props.item.accountName,
      accountId: props.item.accountId,
    }));
  }, [logsQuery.data, props.item.email, props.item.accountName, props.item.accountId]);

  const {
    items,
    actions,
    filteredItemsCount,
    collectionProps,
    filterProps,
    paginationProps,
  } = useCollection(allItems, {
    filtering: {
      empty: <EmptyState title="No logs" subtitle="No logs to display" />,
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
        sortingColumn: { sortingField: "eventTime" },
        isDescending: true,
      },
    },
    selection: {},
  });

  const { selectedItems } = collectionProps;

  const isStartingQuery = startRequestLogs.isPending;
  const tableLoading = logsQuery.isLoading;

  async function handleStartQuery() {
    await startRequestLogs.mutateAsync({ params: { path: { request_id: props.item.id } } });
  }

  // Show "Start Query" button if no queryId exists yet
  if (!queryId) {
    return (
      <Box textAlign="center" padding="xl">
        <SpaceBetween size="m" direction="vertical">
          <Box variant="h3">Session Activity Logs</Box>
          <Box variant="p">Click below to query CloudTrail for session activity logs.</Box>
          <Button
            variant="primary"
            onClick={handleStartQuery}
            loading={isStartingQuery}
          >
            Start Query
          </Button>
          {startRequestLogs.isError && (
            <Box color="text-status-error">Error starting query. Please try again.</Box>
          )}
        </SpaceBetween>
      </Box>
    );
  }

  return (
    <div>
      <Table
        {...collectionProps}
        resizableColumns={true}
        loading={tableLoading || isStartingQuery}
        loadingText="Fetching session logs"
        header={
          <Header
            counter={
              selectedItems.length
                ? `(${selectedItems.length}/${allItems.length})`
                : `(${allItems.length})`
            }
            description="Session activity logs are delivered in near real time"
            actions={
              <SpaceBetween size="s" direction="horizontal">
                {isSessionActive && (
                  <Button
                    iconName="refresh"
                    onClick={() => logsQuery.refetch()}
                    loading={logsQuery.isFetching}
                  />
                )}
                <div>
                  <Button
                    disabled={allItems.length === 0}
                    variant="primary"
                    onClick={() => csvLink.current?.link.click()}
                    iconName="download"
                    iconAlign="left"
                  >
                    Download
                  </Button>
                  <CSVLink
                    data={allItems}
                    filename="session_logs.csv"
                    className="hidden"
                    ref={csvLink}
                    target="_blank"
                  />
                </div>
              </SpaceBetween>
            }
          >
            Session activity logs
          </Header>
        }
        filter={
          <div style={{ display: 'flex', flexWrap: 'wrap', flexGrow: 10, marginRight: '2rem' }}>
            <div style={{ flexGrow: 6, maxWidth: 728, marginRight: '1rem' }}>
              <TextFilter
                {...filterProps}
                filteringPlaceholder="Search Logs"
                countText={String(filteredItemsCount)}
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
      />
    </div>
  );
}

export default Logs;
