// Dependency-free contract: optional telemetry can never assert business outcomes.
export type JourneyCapability = { enabled: boolean; schemaVersion: 1; privacyNoticeVersion: string | null };
export const DISABLED_JOURNEY: JourneyCapability = { enabled: false, schemaVersion: 1, privacyNoticeVersion: null };
export function sanitizeJourneyCapability(value: unknown): JourneyCapability {
  if (!value || typeof value !== 'object') return { ...DISABLED_JOURNEY };
  const v = value as Record<string, unknown>;
  return v.enabled === true && v.schemaVersion === 1 && typeof v.privacyNoticeVersion === 'string' && /^[a-zA-Z0-9._-]{1,64}$/.test(v.privacyNoticeVersion)
    ? { enabled: true, schemaVersion: 1, privacyNoticeVersion: v.privacyNoticeVersion } : { ...DISABLED_JOURNEY };
}

export const JOURNEY_EVENTS = [
  'app.opened', 'session.restored', 'onboarding.step_viewed', 'onboarding.step_saved',
  'learning.opened', 'learning.lesson_opened', 'learning.playback_started',
  'team.opened', 'editor.portfolio_opened', 'editor.portfolio_played',
  'work.opened', 'application.submission_acknowledged',
] as const;
export type JourneyEventName = typeof JOURNEY_EVENTS[number];
export type JourneyEvent = {
  eventId: string; schemaVersion: 1; eventName: JourneyEventName; occurredAt: string;
  appVersion: string; distributionChannel: string; properties: Record<string, string>;
};
export type JourneyPreference = { allowed: boolean; privacyNoticeVersion: string; savedAt: string };
export type JourneyContext = { scope: string; token: string; expiresAt: number; capability: JourneyCapability; preference: JourneyPreference | null };
type Storage = { read(key: string): Promise<string | null>; write(key: string, value: string): Promise<void>; remove(key: string): Promise<void> };
export const JOURNEY_QUEUE_LIMIT = 200;
export const JOURNEY_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const JOURNEY_ENDPOINT = '/journey/events';
const eventSet = new Set<string>(JOURNEY_EVENTS);
const steps = new Set(['account', 'otp', 'plan', 'profile', 'portfolio', 'assessment', 'review', 'channels']);
export function cleanJourneyProperties(value: Record<string, unknown> = {}) {
  const result: Record<string, string> = {};
  // Deliberately no free text, URL, search term, score, amount, name or contact data.
  if (typeof value.step === 'string' && steps.has(value.step)) result.step = value.step;
  if (value.source === 'dashboard' || value.source === 'team' || value.source === 'learning' || value.source === 'profile') result.source = value.source;
  return result;
}
function validContext(context: JourneyContext | null, now: number): context is JourneyContext & { capability: JourneyCapability & { enabled: true }; preference: JourneyPreference } {
  return !!context?.scope && !!context.token && context.expiresAt > now && sanitizeJourneyCapability(context.capability).enabled &&
    context.preference?.allowed === true && context.preference.privacyNoticeVersion === context.capability.privacyNoticeVersion;
}
export function parseJourneyQueue(raw: string | null, now: number): JourneyEvent[] {
  try {
    const list: unknown = JSON.parse(raw || '[]');
    if (!Array.isArray(list)) return [];
    const seen = new Set<string>();
    return list.filter((v): v is JourneyEvent => {
      if (!v || v.schemaVersion !== 1 || !eventSet.has(v.eventName) || typeof v.eventId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(v.eventId) || seen.has(v.eventId)) return false;
      const timestamp = Date.parse(v.occurredAt);
      if (!Number.isFinite(timestamp) || timestamp > now || now - timestamp > JOURNEY_MAX_AGE_MS) return false;
      if (typeof v.appVersion !== 'string' || !/^\d+\.\d+\.\d+$/.test(v.appVersion) || !['DIRECT', 'PLAY_READER'].includes(v.distributionChannel)) return false;
      seen.add(v.eventId); return true;
    }).slice(-JOURNEY_QUEUE_LIMIT).map(v => ({ eventId: v.eventId, schemaVersion: 1, eventName: v.eventName, occurredAt: v.occurredAt, appVersion: v.appVersion, distributionChannel: v.distributionChannel, properties: cleanJourneyProperties(v.properties) }));
  } catch { return []; }
}

export function createJourneyTracker(deps: {
  storage: Storage; now(): number; id(): string; appVersion: string; distributionChannel: 'DIRECT' | 'PLAY_READER';
  send(body: { schemaVersion: 1; privacyNoticeVersion: string; events: JourneyEvent[] }, token: string, signal: AbortSignal): Promise<{ ok: boolean; acceptedEventIds?: string[] }>;
}) {
  let context: JourneyContext | null = null;
  let epoch = 0;
  let chain: Promise<unknown> = Promise.resolve();
  let controller: AbortController | null = null;
  let retryAt = 0;
  let failures = 0;
  let halted = false;
  let suspended = false;
  const key = (scope: string) => `queue.${encodeURIComponent(scope)}`;
  const serial = (fn: () => Promise<unknown>) => { chain = chain.then(fn).catch(() => undefined); return chain; };
  const current = (captured: number) => !suspended && captured === epoch && validContext(context, deps.now());
  function configure(next: JourneyContext | null) {
    if (!suspended && JSON.stringify(next) === JSON.stringify(context)) return;
    const previous = context;
    context = next; suspended = false; epoch++; controller?.abort(); retryAt = 0; failures = 0; halted = false;
    // Serialize deletion behind any already-started write. Late work cannot restore it.
    if (previous && (previous.scope !== next?.scope || !validContext(next, deps.now()))) void serial(() => deps.storage.remove(key(previous.scope)));
    if (next && !validContext(next, deps.now())) void serial(() => deps.storage.remove(key(next.scope)));
  }
  function track(eventName: JourneyEventName, properties: Record<string, unknown> = {}) {
    if (suspended || !validContext(context, deps.now()) || !eventSet.has(eventName)) return Promise.resolve();
    const captured = epoch; const scope = context.scope;
    const event: JourneyEvent = { eventId: deps.id(), schemaVersion: 1, eventName, occurredAt: new Date(deps.now()).toISOString(), appVersion: deps.appVersion, distributionChannel: deps.distributionChannel, properties: cleanJourneyProperties(properties) };
    return serial(async () => {
      if (!current(captured)) return;
      const list = parseJourneyQueue(await deps.storage.read(key(scope)), deps.now());
      if (!current(captured)) return;
      await deps.storage.write(key(scope), JSON.stringify([...list, event].slice(-JOURNEY_QUEUE_LIMIT)));
    });
  }
  function flush() {
    if (suspended || !validContext(context, deps.now()) || halted || deps.now() < retryAt) return Promise.resolve();
    const captured = epoch; const saved = context;
    return serial(async () => {
      if (!current(captured) || halted || deps.now() < retryAt) return;
      const events = parseJourneyQueue(await deps.storage.read(key(saved.scope)), deps.now());
      if (!current(captured)) return;
      if (!events.length) { await deps.storage.remove(key(saved.scope)); return; }
      const batch = events.slice(0, 25);
      controller = new AbortController();
      try {
        const response = await deps.send({ schemaVersion: 1, privacyNoticeVersion: saved.capability.privacyNoticeVersion!, events: batch }, saved.token, controller.signal);
        if (!current(captured)) return;
        if (!response.ok || !Array.isArray(response.acceptedEventIds) || !batch.some(e => response.acceptedEventIds!.includes(e.eventId))) throw new Error('No event acknowledgement');
        const acknowledged = new Set(response.acceptedEventIds.filter(id => batch.some(e => e.eventId === id)));
        await deps.storage.write(key(saved.scope), JSON.stringify(events.filter(e => !acknowledged.has(e.eventId))));
        failures = 0; retryAt = 0;
      } catch (error) {
        if (!current(captured)) return;
        const status = (error as { status?: number })?.status;
        if ([400, 401, 403, 404, 410, 422].includes(status ?? 0)) halted = true;
        failures++; retryAt = deps.now() + Math.min(300_000, 30_000 * 2 ** Math.min(failures - 1, 4));
      } finally { controller = null; }
    });
  }
  function suspend() { if (!suspended) { suspended = true; epoch++; controller?.abort(); } }
  return { configure, suspend, track, flush, reset: () => configure(null), settled: () => chain };
}
