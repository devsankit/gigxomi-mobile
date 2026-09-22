import { useQuery } from '@tanstack/react-query';

import { apiRequest } from '@/src/lib/api';
import type { MobileFreelancerReferralResponse } from '@/src/types';
import { queryKeys } from './queryKeys';
import { useStoredToken } from './useAuth';

export function useFreelancerReferral(enabled = true) {
  const tokenQuery = useStoredToken();
  const token = tokenQuery.data ?? null;

  return useQuery({
    queryKey: queryKeys.freelancerReferrals,
    enabled: Boolean(token && enabled),
    queryFn: () => apiRequest<MobileFreelancerReferralResponse>('/freelancer/referrals', { token }),
  });
}
