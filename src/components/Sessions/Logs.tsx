// © 2023 Amazon Web Services, Inc. or its affiliates. All Rights Reserved.
// This AWS Content is provided subject to the terms of the AWS Customer Agreement available at
// http://aws.amazon.com/agreement or other written agreement between Customer and either
// Amazon Web Services, Inc. or Amazon Web Services EMEA SARL or both.
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
import "../../index.css";
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

interface SessionItem {
  queryId?: string;
}

function Logs(props) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const csvLink = useRef<any>(null);
  const [preferences, setPreferences] = useState({
    pageSize: 10,
    visibleContent: ["eventID", "eventName", "eventSource", "eventTime"],
  });

  // Mutations
  const createSession = $api.useMutation('post', '/sessions');
  const startSessionLogs = $api.useMutation('post', '/sessions/{session_id}/logs');

  // Query for session to get existing queryId
  const sessionQuery = $api.useQuery('get', '/sessions/{session_id}', {
    params: { path: { session_id: props.item?.id || '' } },
  }, { enabled: !!props.item?.id });

  // Get queryId from session or from mutation result
  const queryId = (sessionQuery.data as SessionItem)?.queryId || (startSessionLogs.data as { queryId?: string })?.queryId;

  // Query for logs (enabled when we have a queryId)
  const logsQuery = $api.useQuery('get', '/logs', {
    params: { query: { queryId: queryId || undefined } },
  }, {
    enabled: !!queryId,
    refetchInterval: props.item?.status === "in progress" ? 10000 : false
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
    sorting: {},
    selection: {},
  });

  const { selectedItems } = collectionProps;

  const isStartingQuery = createSession.isPending || startSessionLogs.isPending;
  const tableLoading = sessionQuery.isLoading || logsQuery.isLoading;

  async function handleStartQuery() {
    const endTime = props.item.status === "in progress"
      ? new Date().toISOString()
      : new Date(Date.parse(props.item.endTime) + 60 * 60 * 1000).toISOString();
    const expiry = props.item.status === "in progress"
      ? Math.floor(Date.now() / 1000)
      : Math.floor(Date.now() / 1000) + 432000;

    const sessionData = {
      id: props.item.id,
      startTime: props.item.startTime,
      endTime: endTime,
      username: props.item.username,
      accountId: props.item.accountId,
      role: props.item.role,
      approver_ids: props.item.approver_ids,
      expireAt: expiry,
    };

    await createSession.mutateAsync({ body: sessionData as never });
    await startSessionLogs.mutateAsync({ params: { path: { session_id: props.item.id } } });
  }

  // Show "Start Query" button if no queryId exists yet
  if (!queryId && !sessionQuery.isLoading) {
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
          {startSessionLogs.isError && (
            <Box color="text-status-error">Error starting query. Please try again.</Box>
          )}
        </SpaceBetween>
      </Box>
    );
  }

  return (
    <div className="container">
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
                {props.item.status === "in progress" && (
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
          <div className="input-container">
            <TextFilter
              {...filterProps}
              filteringPlaceholder="Search Logs"
              countText={String(filteredItemsCount)}
              className="input-filter"
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
      />
    </div>
  );
}

export default Logs;
