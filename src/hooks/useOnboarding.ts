import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from '@/src/lib/api';
import type { MobileOnboardingResponse } from '@/src/types';
import { queryKeys } from './queryKeys';
import { useStoredToken } from './useAuth';

type OnboardingPatchInput = {
  completedSteps?: string[];
  skippedSteps?: string[];
  dismissed?: boolean;
  completedAt?: string | null;
  lastSeenStep?: string | null;
};

export function useOnboardingProgress() {
  const tokenQuery = useStoredToken();
  const token = tokenQuery.data ?? null;

  return useQuery({
    queryKey: queryKeys.onboarding,
    enabled: Boolean(token),
    queryFn: () => apiRequest<MobileOnboardingResponse>('/onboarding/progress', { token }),
  });
}

export function useUpdateOnboardingProgress() {
  const queryClient = useQueryClient();
  const tokenQuery = useStoredToken();

  return useMutation({
    mutationFn: (input: OnboardingPatchInput) =>
      apiRequest<MobileOnboardingResponse>('/onboarding/progress', {
        method: 'PATCH',
        token: tokenQuery.data ?? null,
        body: input,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.onboarding });
    },
  });
}
