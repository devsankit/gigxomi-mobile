export function safeReferralId(value: unknown): string | null {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{8,96}$/.test(value) && /[A-Za-z]/.test(value) ? value : null;
}
export function referralFromUrl(raw: string): string | null {
  if (raw.length > 2048) return null;
  try {
    const url = new URL(raw);
    if (url.username || url.password || url.port || url.hash) return null;
    if (url.protocol === 'https:' && ['gigxomi.com', 'www.gigxomi.com'].includes(url.hostname)) {
      const match = /^\/r\/([A-Za-z0-9_-]+)\/?$/.exec(url.pathname);
      return match ? safeReferralId(match[1]) : null;
    }
    if (url.protocol === 'gigxomi:' && url.hostname === 'r') return safeReferralId(url.pathname.replace(/^\//, ''));
  } catch { /* Untrusted links are ignored, never navigated. */ }
  return null;
}
export function referralFromInstallReferrer(raw: unknown) {
  if (typeof raw !== 'string' || raw.length > 2048) return null;
  try {
    const params = new URLSearchParams(raw);
    return params.getAll('ref').length === 1 ? safeReferralId(params.get('ref')) : null;
  } catch { return null; }
}
export function safeInstallTimestamp(value: unknown, now = Date.now()): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 1577836800 && value * 1000 <= now ? Math.floor(value * 1000) : null;
}
