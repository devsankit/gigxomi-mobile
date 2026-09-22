import { QueryClient } from '@tanstack/react-query';

import { ApiError } from '@/src/lib/api';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 24 * 60 * 60_000,
      retry: (failureCount, error) => {
        if (error instanceof ApiError && (error.status === 401 || error.status === 403 || error.status === 404)) {
          return false;
        }
        return failureCount < 2;
      },
      refetchOnReconnect: true,
    },
    mutations: {
      // Offers, applications and payments are not safe to replay globally.
      // Idempotent flows (such as Learning events) own their stable-ID retries.
      retry: false,
    },
  },
});
