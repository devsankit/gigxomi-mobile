import { useQuery } from '@tanstack/react-query';

import { apiRequest } from '@/src/lib/api';
import type { MobileSubscriptionStatusResponse } from '@/src/types';
import { queryKeys } from './queryKeys';
import { useAuth, useStoredToken } from './useAuth';

export function useSubscriptionStatus(userId?: string | null, audience?: 'AGENCY' | 'FREELANCER' | null) {
  const auth = useAuth();
  const tokenQuery = useStoredToken();
  const token = tokenQuery.data ?? null;
  const scopedUserId = userId ?? auth.session?.userId ?? null;
  const scopedAudience = audience ?? auth.session?.packageAudience ?? (auth.session?.role === 'ADMIN' || auth.session?.role === 'MANAGER' ? 'AGENCY' : auth.session?.role === 'FREELANCER' ? 'FREELANCER' : null);

  return useQuery({
    queryKey: queryKeys.subscription(scopedUserId ?? 'anonymous', scopedAudience ?? 'UNKNOWN'),
    enabled: Boolean(token && scopedUserId),
    retry: 3,
    retryDelay: (attempt: number) => Math.min(1000 * 2 ** attempt, 4000),
    queryFn: async () => {
      try {
        return await apiRequest<MobileSubscriptionStatusResponse>('/mobile/subscription/status', { token, timeoutMs: 15_000 });
      } catch (error) {
        // If user already has an active session package, fallback gracefully
        const session = auth.session;
        const pkgStatus = String(session?.packageStatus ?? '');
        if (session && (pkgStatus === 'ACTIVE' || pkgStatus === 'TRIALING' || session.role === 'SUPER_ADMIN')) {
          return {
            ok: true,
            active: true,
            reason: 'ACTIVE',
            onboardingComplete: true,
            dashboardReady: true,
            subscription: null,
            packageStatus: session.packageStatus,
            packageName: session.packageName ?? 'Gigxomi Plan',
          } as unknown as MobileSubscriptionStatusResponse;
        }
        throw error;
      }
    },
  });
}
