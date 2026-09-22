// No credentials are stored here. A generation invalidates work started by a
// previous account; the identity scopes local, best-effort display caches.
let generation = 0;
let scope: string | null = null;
const listeners = new Set<() => void>();
export function subscribeAccountBoundary(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
function notifyBoundary() { for (const listener of listeners) { try { listener(); } catch { /* Optional consumers must not block authentication. */ } } }

export function getAccountGeneration() { return generation; }
export function getAccountCacheScope() { return scope; }
export function resetAccountBoundary() { generation += 1; scope = null; notifyBoundary(); }
export function setAccountCacheScope(account: { userId: string; tenantId?: string | null; role: string }) {
  const next = JSON.stringify([account.userId, account.tenantId ?? null, account.role]);
  if (next !== scope) { generation += 1; scope = next; notifyBoundary(); }
}
