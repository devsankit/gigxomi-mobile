// Session-only: never persisted and never treated as profile completion or entitlement.
let deferredUser: string | null = null;
const listeners = new Set<() => void>();

export function isOnboardingDeferred(userId?: string) {
  return Boolean(userId && deferredUser === userId);
}

export function deferOnboarding(userId: string) {
  deferredUser = userId;
  listeners.forEach((listener) => listener());
}

export function resetOnboardingDeferral() {
  deferredUser = null;
  listeners.forEach((listener) => listener());
}

export function subscribeOnboardingDeferral(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
