import { useSyncExternalStore } from 'react';
import { deferOnboarding, isOnboardingDeferred, subscribeOnboardingDeferral } from '@/src/lib/onboarding-deferral';

export function useOnboardingDeferral(userId?: string) {
  const deferred = useSyncExternalStore(subscribeOnboardingDeferral, () => isOnboardingDeferred(userId));
  return { deferred, defer: () => { if (userId) deferOnboarding(userId); } };
}
