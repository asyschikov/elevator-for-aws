// Re-export types and hooks from client
export { useQuery, useMutation, $api } from './client';
export type { paths } from './schema';

// Re-export all hooks
export * from './hooks';
