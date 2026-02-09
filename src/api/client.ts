import { fetchAuthSession } from 'aws-amplify/auth';
import createFetchClient from 'openapi-fetch';
import createClient from 'openapi-react-query';

import type { paths } from './schema';
import config from '../config.json';

// Create fetch client with auth middleware
const fetchClient = createFetchClient<paths>({
  baseUrl: config.apiEndpoint,
});

// Auth middleware - using Amplify v6 Auth
fetchClient.use({
  async onRequest({ request }) {
    try {
      const session = await fetchAuthSession();
      const token = session.tokens?.idToken?.toString();
      if (token) {
        request.headers.set('Authorization', `Bearer ${token}`);
      }
    } catch (error) {
      console.error('Failed to get auth token:', error);
    }
    return request;
  },
});

// Create React Query client with typed hooks
const $api = createClient(fetchClient);

// Export the typed useQuery and useMutation hooks
export const useQuery = $api.useQuery;
export const useMutation = $api.useMutation;

export { $api };
export type { paths };
