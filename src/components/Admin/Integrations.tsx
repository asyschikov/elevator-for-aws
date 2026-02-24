import React, { useState } from "react";
import {
  Box,
  Button,
  Header,
  SpaceBetween,
  Modal,
  FormField,
  Input,
  Form,
  Container,
  ColumnLayout,
  StatusIndicator,
  Cards,
} from "@cloudscape-design/components";
import { $api } from "../../api/client";
import type { components } from "../../api/schema.d";

type IntegrationResponse = components["schemas"]["IntegrationResponse"];
type CreateIntegrationInput = components["schemas"]["CreateIntegrationInput"];
type UpdateIntegrationInput = components["schemas"]["UpdateIntegrationInput"];

// Known integration definitions with their required params
const KNOWN_INTEGRATIONS = [
  {
    name: "betterstack" as const,
    label: "BetterStack",
    description: "On-call schedule integration with BetterStack",
    fields: [
      { key: "api_token", label: "API Token", sensitive: true },
      { key: "schedule_id", label: "Schedule ID", sensitive: false },
    ],
  },
];

interface Notification {
  type: "success" | "error" | "warning" | "info";
  content: string;
  dismissible: boolean;
  onDismiss: () => void;
}

interface IntegrationsProps {
  addNotification: (notifications: Notification[]) => void;
  setActiveHref?: (href: string) => void;
  user?: string;
  group?: string[];
}

function maskValue(value: string): string {
  if (value.length <= 4) return "****";
  return "****" + value.slice(-4);
}

function Integrations(props: IntegrationsProps) {
  const integrationsQuery = $api.useQuery("get", "/integrations");

  const createMutation = $api.useMutation("post", "/integrations", {
    onSuccess: () => {
      integrationsQuery.refetch();
      handleDismiss();
      props.addNotification([
        {
          type: "success",
          content: "Integration configured successfully",
          dismissible: true,
          onDismiss: () => props.addNotification([]),
        },
      ]);
    },
  });

  const updateMutation = $api.useMutation("put", "/integrations/{integration_name}", {
    onSuccess: () => {
      integrationsQuery.refetch();
      handleDismiss();
      props.addNotification([
        {
          type: "success",
          content: "Integration updated successfully",
          dismissible: true,
          onDismiss: () => props.addNotification([]),
        },
      ]);
    },
  });

  const deleteMutation = $api.useMutation("delete", "/integrations/{integration_name}", {
    onSuccess: () => {
      integrationsQuery.refetch();
      setDeleteVisible(false);
      setDeleteTarget(null);
      props.addNotification([
        {
          type: "success",
          content: "Integration deleted successfully",
          dismissible: true,
          onDismiss: () => props.addNotification([]),
        },
      ]);
    },
  });

  const configuredIntegrations: IntegrationResponse[] = integrationsQuery.data?.items ?? [];

  // Modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [deleteVisible, setDeleteVisible] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [currentIntegration, setCurrentIntegration] = useState<string | null>(null);
  const [formParams, setFormParams] = useState<Record<string, string>>({});
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  function getConfigured(name: string): IntegrationResponse | undefined {
    return configuredIntegrations.find((i) => i.name === name);
  }

  function handleConfigure(name: string) {
    setEditMode(false);
    setCurrentIntegration(name);
    setFormParams({});
    setFormErrors({});
    setModalVisible(true);
  }

  function handleEdit(name: string) {
    const existing = getConfigured(name);
    setEditMode(true);
    setCurrentIntegration(name);
    setFormParams(existing?.params ?? {});
    setFormErrors({});
    setModalVisible(true);
  }

  function handleDeleteClick(name: string) {
    setDeleteTarget(name);
    setDeleteVisible(true);
  }

  function handleDelete() {
    if (deleteTarget) {
      deleteMutation.mutate({
        params: { path: { integration_name: deleteTarget } },
      });
    }
  }

  function handleDismiss() {
    setModalVisible(false);
    setCurrentIntegration(null);
    setFormParams({});
    setFormErrors({});
    setEditMode(false);
  }

  function validate(): boolean {
    const definition = KNOWN_INTEGRATIONS.find((i) => i.name === currentIntegration);
    if (!definition) return false;

    const errors: Record<string, string> = {};
    for (const field of definition.fields) {
      if (!formParams[field.key]?.trim()) {
        errors[field.key] = `${field.label} is required`;
      }
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }

  function handleSubmit() {
    if (!validate() || !currentIntegration) return;

    if (editMode) {
      const body: UpdateIntegrationInput = { params: formParams };
      updateMutation.mutate({
        params: { path: { integration_name: currentIntegration } },
        body,
      });
    } else {
      const body: CreateIntegrationInput = {
        name: currentIntegration as CreateIntegrationInput["name"],
        params: formParams,
      };
      createMutation.mutate({ body });
    }
  }

  const currentDefinition = KNOWN_INTEGRATIONS.find((i) => i.name === currentIntegration);

  const cardItems = KNOWN_INTEGRATIONS.map((def) => {
    const configured = getConfigured(def.name);
    return { ...def, configured };
  });

  return (
    <div>
      <Cards
        cardDefinition={{
          header: (item) => item.label,
          sections: [
            {
              id: "status",
              header: "Status",
              content: (item) =>
                item.configured ? (
                  <StatusIndicator type="success">Configured</StatusIndicator>
                ) : (
                  <StatusIndicator type="stopped">Not configured</StatusIndicator>
                ),
            },
            {
              id: "description",
              header: "Description",
              content: (item) => item.description,
            },
            {
              id: "params",
              header: "Parameters",
              content: (item) =>
                item.configured ? (
                  <ColumnLayout columns={2} variant="text-grid">
                    {item.fields.map((field) => (
                      <div key={field.key}>
                        <Box variant="awsui-key-label">{field.label}</Box>
                        <div>
                          {field.sensitive
                            ? maskValue(item.configured!.params[field.key] ?? "")
                            : item.configured!.params[field.key] ?? "-"}
                        </div>
                      </div>
                    ))}
                  </ColumnLayout>
                ) : (
                  <Box color="text-status-inactive">No parameters configured</Box>
                ),
            },
            {
              id: "actions",
              content: (item) =>
                item.configured ? (
                  <SpaceBetween size="xs" direction="horizontal">
                    <Button onClick={() => handleEdit(item.name)}>Edit</Button>
                    <Button onClick={() => handleDeleteClick(item.name)}>Delete</Button>
                  </SpaceBetween>
                ) : (
                  <Button variant="primary" onClick={() => handleConfigure(item.name)}>
                    Configure
                  </Button>
                ),
            },
          ],
        }}
        items={cardItems}
        loading={integrationsQuery.isLoading}
        loadingText="Loading integrations"
        header={
          <Header
            counter={`(${configuredIntegrations.length}/${KNOWN_INTEGRATIONS.length})`}
            actions={
              <Button
                iconName="refresh"
                onClick={() => integrationsQuery.refetch()}
                loading={integrationsQuery.isFetching}
              />
            }
          >
            Integrations
          </Header>
        }
        empty={
          <Box textAlign="center">
            <Box variant="strong">No integrations available</Box>
          </Box>
        }
      />

      {/* Create/Edit Modal */}
      <Modal
        onDismiss={handleDismiss}
        visible={modalVisible}
        closeAriaLabel="Close modal"
        size="medium"
        header={editMode ? `Edit ${currentDefinition?.label}` : `Configure ${currentDefinition?.label}`}
      >
        <Form
          actions={
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={handleDismiss}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleSubmit}
                loading={createMutation.isPending || updateMutation.isPending}
              >
                {editMode ? "Save" : "Configure"}
              </Button>
            </SpaceBetween>
          }
        >
          <SpaceBetween direction="vertical" size="l">
            {currentDefinition?.fields.map((field) => (
              <FormField
                key={field.key}
                label={field.label}
                errorText={formErrors[field.key]}
              >
                <Input
                  type={field.sensitive ? "password" : "text"}
                  value={formParams[field.key] ?? ""}
                  onChange={({ detail }) => {
                    setFormParams((prev) => ({ ...prev, [field.key]: detail.value }));
                    setFormErrors((prev) => ({ ...prev, [field.key]: "" }));
                  }}
                />
              </FormField>
            ))}
          </SpaceBetween>
        </Form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        onDismiss={() => {
          setDeleteVisible(false);
          setDeleteTarget(null);
        }}
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
                  setDeleteTarget(null);
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
        header="Delete integration"
      >
        Are you sure you want to delete the{" "}
        {KNOWN_INTEGRATIONS.find((i) => i.name === deleteTarget)?.label} integration?
      </Modal>
    </div>
  );
}

export default Integrations;
