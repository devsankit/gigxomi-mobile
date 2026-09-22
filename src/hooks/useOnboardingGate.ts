import { useQuery } from '@tanstack/react-query';

import { apiRequest } from '@/src/lib/api';
import type { MobileFreelancerOnboardingResponse, MobileRole } from '@/src/types';
import { queryKeys } from './queryKeys';
import { freelancerProfileComplete, freelancerSetupStep } from '@/src/lib/freelancer-setup';

type AgencyOnboardingResponse = {
  ok: boolean;
  onboarding: {
    profileDoneAt?: string | null;
    completedAt?: string | null;
    payload?: Record<string, unknown> | null;
  } | null;
  connections?: Array<{ provider: 'INSTAGRAM' | 'WHATSAPP'; status: string }>;
  complete?: boolean;
};

export function useOnboardingGate(role: MobileRole | undefined, token: string | null, userId?: string) {
  const requiresOnboarding = role === 'ADMIN' || role === 'FREELANCER';

  return useQuery({
    queryKey: queryKeys.onboardingGate(role ?? 'UNKNOWN', userId),
    enabled: Boolean(token && userId && requiresOnboarding),
    retry: 3,
    retryDelay: (attempt: number) => Math.min(1000 * 2 ** attempt, 4000),
    staleTime: 15_000,
    queryFn: async () => {
      if (role === 'FREELANCER') {
        const response = await apiRequest<MobileFreelancerOnboardingResponse>('/freelancer/onboarding', { token, timeoutMs: 15_000 });
        return {
          complete: response.onboarding.completed && freelancerSetupStep(response.onboarding) === 'review',
          profileComplete: Boolean(response.onboarding.profile && freelancerProfileComplete(response.onboarding.profile)),
          audience: 'FREELANCER' as const,
        };
      }

      const response = await apiRequest<AgencyOnboardingResponse>('/mobile/v2/integrations', { token, timeoutMs: 15_000 });
      return {
        complete: Boolean(response.complete),
        profileComplete: Boolean(response.onboarding?.profileDoneAt),
        audience: 'AGENCY' as const,
      };
    },
  });
}
