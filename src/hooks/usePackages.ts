import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from '@/src/lib/api';
import { saveToken } from '@/src/lib/authStorage';
import { saveSession } from '@/src/lib/sessionStorage';
import type { MobilePackagesResponse, MobileSubscribeResponse } from '@/src/types';
import { queryKeys } from './queryKeys';
import { useAuth, useStoredToken } from './useAuth';

export function usePackages(userId?: string | null, audience?: 'AGENCY' | 'FREELANCER' | null) {
  const auth = useAuth();
  const tokenQuery = useStoredToken();
  const token = tokenQuery.data ?? null;
  const scopedUserId = userId ?? auth.session?.userId ?? null;
  const scopedAudience = audience ?? auth.session?.packageAudience ?? (auth.session?.role === 'ADMIN' || auth.session?.role === 'MANAGER' ? 'AGENCY' : auth.session?.role === 'FREELANCER' ? 'FREELANCER' : null);

  return useQuery({
    queryKey: queryKeys.packages(scopedUserId ?? 'anonymous', scopedAudience ?? 'UNKNOWN'),
    enabled: Boolean(token && scopedUserId && scopedAudience),
    queryFn: () => apiRequest<MobilePackagesResponse>('/mobile/packages', { token }),
  });
}

export function useSubscribePackage() {
  const queryClient = useQueryClient();
  const tokenQuery = useStoredToken();

  return useMutation({
    mutationFn: ({ packageId, billingCycle, distributionChannel }: { packageId: string; billingCycle: 'MONTHLY' | 'YEARLY'; distributionChannel: 'DIRECT' | 'PLAY_READER' }) =>
      apiRequest<MobileSubscribeResponse>('/mobile/billing/subscribe', {
        method: 'POST',
        token: tokenQuery.data ?? null,
        body: { packageId, billingCycle, distributionChannel },
      }),
    onSuccess: async (response) => {
      await saveToken(response.token);
      await saveSession(response.session);
      queryClient.setQueryData(queryKeys.token, response.token);
      queryClient.setQueryData(queryKeys.session, { ok: true, session: response.session });
      await queryClient.invalidateQueries({ queryKey: ['subscription'] });
      await queryClient.invalidateQueries({ queryKey: ['packages'] });
    },
  });
}
