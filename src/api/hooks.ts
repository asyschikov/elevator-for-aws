// React Query hooks for API operations
import { $api } from './client';

// ============ Query Hooks ============

// Requests
export const useRequests = () => $api.useQuery('get', '/requests');
export const useRequest = (requestId: string) =>
  $api.useQuery('get', '/requests/{request_id}', {
    params: { path: { request_id: requestId } },
  });

// Accounts
export const useAccounts = () => $api.useQuery('get', '/accounts');

// OUs
export const useOUs = () => $api.useQuery('get', '/ous');
export const useOU = (accountId: string) =>
  $api.useQuery('get', '/ou/{account_id}', {
    params: { path: { account_id: accountId } },
  });

// Permissions
export const usePermissions = () => $api.useQuery('get', '/permissions');
export const useMgmtPermissions = () => $api.useQuery('get', '/mgmt-permissions');

// Groups
export const useIdCGroups = () => $api.useQuery('get', '/idc-groups');
export const useGroupMembers = () => $api.useQuery('get', '/groups/members');

// Users
export const useUsers = () => $api.useQuery('get', '/users');

// User Policy
export const useUserPolicy = (userId: string, groupIds?: string, username?: string) =>
  $api.useQuery('get', '/user-policy', {
    params: { query: { userId, groupIds, username } },
  });

// Logs
export const useLogs = (queryId?: string, query?: string) =>
  $api.useQuery('get', '/logs', {
    params: { query: { queryId, query } },
  });

// ============ Mutation Hooks ============

// Requests
export const useCreateRequest = () => $api.useMutation('post', '/requests');
export const useUpdateRequest = () => $api.useMutation('put', '/requests/{request_id}');
export const useDeleteRequest = () => $api.useMutation('delete', '/requests/{request_id}');
export const useGrantRequest = () => $api.useMutation('post', '/requests/{request_id}/grant');
export const useRevokeRequest = () => $api.useMutation('post', '/requests/{request_id}/revoke');

// Policy
export const usePublishPolicy = () => $api.useMutation('post', '/policy');

// ============ Settings ============
export const useSettings = () => $api.useQuery('get', '/settings');
export const useUpdateSettings = () => $api.useMutation('put', '/settings');

// ============ Approvers ============
export const useApprovers = () => $api.useQuery('get', '/approvers');
export const useApprover = (approverId: string) =>
  $api.useQuery('get', '/approvers/{approver_id}', {
    params: { path: { approver_id: approverId } },
  });
export const useCreateApprover = () => $api.useMutation('post', '/approvers');
export const useUpdateApprover = () => $api.useMutation('put', '/approvers/{approver_id}');
export const useDeleteApprover = () => $api.useMutation('delete', '/approvers/{approver_id}');

// ============ Eligibility ============
export const useEligibilities = () => $api.useQuery('get', '/eligibility');
export const useEligibility = (policyId: string) =>
  $api.useQuery('get', '/eligibility/{policy_id}', {
    params: { path: { policy_id: policyId } },
  });
export const useCreateEligibility = () => $api.useMutation('post', '/eligibility');
export const useUpdateEligibility = () => $api.useMutation('put', '/eligibility/{policy_id}');
export const useDeleteEligibility = () => $api.useMutation('delete', '/eligibility/{policy_id}');
