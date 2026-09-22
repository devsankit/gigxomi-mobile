import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from '@/src/lib/api';
import { saveSession } from '@/src/lib/sessionStorage';
import type { MobileSessionResponse, MobileUserProfileResponse } from '@/src/types';
import { queryKeys } from './queryKeys';
import { useAuth, useStoredToken } from './useAuth';

export function useUserProfile() {
  const auth = useAuth();
  const tokenQuery = useStoredToken();
  const token = tokenQuery.data ?? null;
  const canUseFreelancerProfile = auth.session?.role === 'FREELANCER' || auth.session?.role === 'SUPER_ADMIN';

  return useQuery({
    queryKey: queryKeys.profile,
    enabled: Boolean(token && canUseFreelancerProfile),
    queryFn: () => apiRequest<MobileUserProfileResponse>('/freelancer/profile', { token }),
  });
}

export function useUpdateUserProfile() {
  const queryClient = useQueryClient();
  const tokenQuery = useStoredToken();

  return useMutation({
    mutationFn: (input: Partial<MobileUserProfileResponse['profile']>) =>
      apiRequest<MobileUserProfileResponse>('/freelancer/profile', {
        method: 'POST',
        token: tokenQuery.data ?? null,
        body: input,
      }),
    retry: 2,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.profile });
    },
  });
}

export function useUpdateDisplayName() {
  const queryClient = useQueryClient();
  const tokenQuery = useStoredToken();

  return useMutation({
    mutationFn: async (displayName: string) => {
      const response = await apiRequest<MobileSessionResponse>('/mobile/session', {
        method: 'PATCH',
        token: tokenQuery.data ?? null,
        body: { displayName },
      });
      if (response?.session) {
        await saveSession(response.session);
        queryClient.setQueryData(queryKeys.session, { ok: true, session: response.session });
      }
      return response;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.session });
    },
  });
}

