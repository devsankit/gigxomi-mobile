type RefreshableQuery = { isEnabled: boolean; refetch: () => Promise<unknown> };

// React Query's manual refetch bypasses `enabled`; callers must preserve it.
export function refreshEnabledQueries(queries: RefreshableQuery[]) {
  return Promise.allSettled(queries.filter(query => query.isEnabled).map(query => query.refetch()));
}
