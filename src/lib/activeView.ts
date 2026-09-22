import { apiRequest } from '@/src/lib/api';

const activeViewKeys = new Set<string>();

function getViewKey(input: { viewType: 'chat' | 'project' | 'team'; referenceId: string }) {
  return `${input.viewType}:${input.referenceId.trim()}`;
}

export function markLocalActiveMobileView(input: { viewType: 'chat' | 'project' | 'team'; referenceId: string }) {
  const referenceId = input.referenceId.trim();
  if (!referenceId) {
    return;
  }

  activeViewKeys.add(getViewKey({ ...input, referenceId }));
}

export function clearLocalActiveMobileView(input: { viewType: 'chat' | 'project' | 'team'; referenceId: string }) {
  const referenceId = input.referenceId.trim();
  if (!referenceId) {
    return;
  }

  activeViewKeys.delete(getViewKey({ ...input, referenceId }));
}

export function isLocalActiveMobileView(input: { viewType: 'chat' | 'project' | 'team'; referenceId: string }) {
  const referenceId = input.referenceId.trim();
  return Boolean(referenceId && activeViewKeys.has(getViewKey({ ...input, referenceId })));
}

export async function registerActiveMobileView(
  authToken: string,
  input: { viewType: 'chat' | 'project' | 'team'; referenceId: string },
) {
  const referenceId = input.referenceId.trim();
  if (!referenceId) {
    return;
  }

  markLocalActiveMobileView({ ...input, referenceId });
  await apiRequest('/mobile/active-view', {
    method: 'POST',
    token: authToken,
    body: {
      viewType: input.viewType,
      referenceId,
    },
  });
}

export async function clearActiveMobileView(
  authToken: string,
  input: { viewType: 'chat' | 'project' | 'team'; referenceId: string },
) {
  const referenceId = input.referenceId.trim();
  if (!referenceId) {
    return;
  }

  clearLocalActiveMobileView({ ...input, referenceId });
  await apiRequest('/mobile/active-view', {
    method: 'DELETE',
    token: authToken,
    body: {
      viewType: input.viewType,
      referenceId,
    },
  });
}
