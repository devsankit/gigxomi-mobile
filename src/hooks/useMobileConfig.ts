import { useQuery } from '@tanstack/react-query';

import { DEFAULT_MOBILE_CONFIG, sanitizeMobileConfig } from '@/src/constants/mobileConfig';
import { apiRequest } from '@/src/lib/api';
import { queryKeys } from './queryKeys';

export function useMobileConfig(token?: string | null) {
  return useQuery({
    queryKey: queryKeys.mobileConfig,
    queryFn: async () => {
      try {
        const payload = await apiRequest<unknown>('/mobile/config', { token });
        return sanitizeMobileConfig(payload);
      } catch {
        return DEFAULT_MOBILE_CONFIG;
      }
    },
    retry: false,
    staleTime: 5 * 60_000,
  });
}
