import { usePathname } from 'expo-router';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState, Linking } from 'react-native';

import { useAuth } from '@/src/hooks/useAuth';
import { useMobileConfig } from '@/src/hooks/useMobileConfig';
import { DISABLED_JOURNEY, type JourneyPreference } from '@/src/lib/journey-core';
import { apiRequest } from '@/src/lib/api';
import { captureReferralLink, initializeInstallReferral, journey, readJourneyPreference, saveJourneyPreference } from '@/src/lib/journey-runtime';

type PreferenceControls = { available: boolean; allowed: boolean; saving: boolean; error: string; change(allowed: boolean): Promise<void> };
const PreferenceContext = createContext<PreferenceControls>({ available: false, allowed: false, saving: false, error: '', change: async () => {} });
export const useJourneyPreference = () => useContext(PreferenceContext);

export function JourneyProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const config = useMobileConfig(auth.token);
  const path = usePathname();
  const session = auth.session;
  const scope = session ? JSON.stringify([session.userId, session.tenantId ?? null, session.role]) : null;
  const capability = config.isError ? DISABLED_JOURNEY : config.data?.journeyTracking ?? DISABLED_JOURNEY;
  const [stored, setStored] = useState<{ scope: string; value: JourneyPreference | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const preference = scope === stored?.scope ? stored.value : null;
  const available = !!scope && !!auth.token && capability.enabled && !!session && session.expiresAt > Date.now();
  const allowed = available && preference?.allowed === true && preference.privacyNoticeVersion === capability.privacyNoticeVersion;

  useEffect(() => {
    void initializeInstallReferral();
    void Linking.getInitialURL().then(url => { if (url) void captureReferralLink(url); }).catch(() => undefined);
    const listener = Linking.addEventListener('url', ({ url }) => { void captureReferralLink(url); });
    return () => listener.remove();
  }, []);
  useEffect(() => {
    let active = true;
    setError('');
    if (scope) void readJourneyPreference(scope).then(value => { if (active) setStored({ scope, value }); });
    return () => { active = false; };
  }, [scope]);
  useEffect(() => {
    // Await restored config/preference without deleting a valid offline queue.
    // Suspension still prevents any export or observations during that interval.
    if (config.isPending || (scope && capability.enabled && stored?.scope !== scope)) {
      journey.suspend();
      return;
    }
    journey.configure(scope && auth.token && session ? { scope, token: auth.token, expiresAt: session.expiresAt, capability, preference } : null);
  }, [scope, auth.token, session, capability, preference, stored?.scope, config.isPending]);
  useEffect(() => {
    if (!allowed) return;
    void journey.track('session.restored');
    void journey.track('app.opened');
    const timer = setInterval(() => { if (AppState.currentState === 'active') void journey.flush(); }, 30_000);
    const listener = AppState.addEventListener('change', state => {
      if (state === 'active') { void journey.track('app.opened'); void journey.flush(); }
    });
    return () => { clearInterval(timer); listener.remove(); };
  }, [allowed, scope]);
  useEffect(() => {
    // Route parameters and arbitrary URLs are never serialized.
    if (path === '/team') void journey.track('team.opened');
    if (path === '/projects') void journey.track('work.opened');
    if (path === '/register') void journey.track('onboarding.step_viewed', { step: 'account' });
    if (path === '/login' || path === '/whatsapp-otp') void journey.track('onboarding.step_viewed', { step: 'otp' });
    if (path === '/package') void journey.track('onboarding.step_viewed', { step: 'plan' });
  }, [path]);
  const value = useMemo(() => ({ available, allowed, saving, error, change: async (next: boolean) => {
    if (!scope || !capability.privacyNoticeVersion || !available || saving) return;
    setSaving(true); setError('');
    const choice = { allowed: next, privacyNoticeVersion: capability.privacyNoticeVersion, savedAt: new Date().toISOString() };
    if (!next) { journey.reset(); setStored({ scope, value: choice }); }
    try {
      if (!next) await saveJourneyPreference(scope, choice);
      const response = await apiRequest<{ ok: boolean }>('/journey/preferences', { token: auth.token, method: 'POST', body: { schemaVersion: 1, ...choice }, timeoutMs: 8_000 });
      if (!response.ok) throw new Error('Preference not acknowledged');
      if (next) await saveJourneyPreference(scope, choice);
      setStored({ scope, value: choice });
    }
    catch { setError(next ? 'Your preference could not be saved. Sharing remains off; please retry.' : 'Sharing is off on this device. Retry to update your account preference.'); }
    finally { setSaving(false); }
  } }), [available, allowed, saving, error, scope, capability.privacyNoticeVersion, auth.token]);
  return <PreferenceContext.Provider value={value}>{children}</PreferenceContext.Provider>;
}
