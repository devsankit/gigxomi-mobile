import { useQuery } from '@tanstack/react-query';

import { apiRequest } from '@/src/lib/api';
import type { MobileOrdersResponse } from '@/src/types';
import { queryKeys } from './queryKeys';
import { useStoredToken } from './useAuth';

export function useOrders() {
  const tokenQuery = useStoredToken();
  const token = tokenQuery.data ?? null;

  return useQuery({
    queryKey: queryKeys.orders,
    enabled: Boolean(token),
    queryFn: () => apiRequest<MobileOrdersResponse>('/delivery/assets', { token }),
  });
}
