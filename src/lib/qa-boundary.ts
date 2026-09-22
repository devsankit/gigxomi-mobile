export function assertQaRequestUrl(url: string, qaEnabled: boolean, allowedBase?: string) {
  if (!qaEnabled) return;
  if (!allowedBase) throw new Error('QA requires an explicit isolated API URL. Production fallback is disabled.');
  const allowed = new URL(allowedBase);
  const target = new URL(url);
  const host = allowed.hostname.toLowerCase();
  if (host === 'gigxomi.com' || host.endsWith('.gigxomi.com') || host === 'postproduction.work' || host.endsWith('.postproduction.work')) {
    throw new Error('QA requests to production domains are disabled.');
  }
  if (!['http:', 'https:'].includes(allowed.protocol) || target.origin !== allowed.origin || allowed.username || allowed.password) {
    throw new Error('QA request is outside the isolated API origin.');
  }
}
