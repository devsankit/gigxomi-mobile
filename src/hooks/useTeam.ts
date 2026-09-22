import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from '@/src/lib/api';
import type {
  MobileContactsResponse,
  MobileAgencyDirectoryResponse,
  MobileEditorDirectoryResponse,
  MobileManagersResponse,
  MobileTeamMembershipStatus,
  MobileTeamRequestsResponse,
  MobileTeamEditor,
} from '@/src/types';
import { queryKeys } from './queryKeys';
import { useAuth, useStoredToken } from './useAuth';

export function useManagers(enabled = true) {
  const tokenQuery = useStoredToken();
  const token = tokenQuery.data ?? null;

  return useQuery({
    queryKey: queryKeys.managers,
    enabled: Boolean(token && enabled),
    queryFn: () => apiRequest<MobileManagersResponse>('/admin/managers', { token }),
  });
}

export function useCreateManager() {
  const tokenQuery = useStoredToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: { name: string; phone: string; email?: string; pin?: string; role?: string }) =>
      apiRequest<{ ok: boolean; manager?: Record<string, unknown> }>('/admin/managers', {
        method: 'POST',
        token: tokenQuery.data ?? null,
        body,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.managers });
    },
  });
}

export function useTeamRequests(enabled = true) {
  const tokenQuery = useStoredToken();
  const token = tokenQuery.data ?? null;

  return useQuery({
    queryKey: queryKeys.teamRequests,
    enabled: Boolean(token && enabled),
    queryFn: () => apiRequest<MobileTeamRequestsResponse>('/freelancer/team-requests', { token }),
  });
}

export function useContacts(enabled = true) {
  const tokenQuery = useStoredToken();
  const token = tokenQuery.data ?? null;

  return useQuery({
    queryKey: queryKeys.contacts,
    enabled: Boolean(token && enabled),
    queryFn: () => apiRequest<MobileContactsResponse>('/admin/contacts', { token }),
  });
}

export type EditorDirectoryOptions = { enabled?: boolean; scope?: 'team' | 'general'; search?: string; onlineOnly?: boolean };
export function useEditorDirectory(input: EditorDirectoryOptions | boolean = {}) {
  const options = typeof input === 'boolean' ? { enabled: input } : input;
  const auth = useAuth();
  const scope = options.scope ?? 'general';
  const search = options.search?.trim() ?? '';
  const query = useInfiniteQuery({
    queryKey: [...queryKeys.editorDirectory, auth.session?.userId, auth.session?.tenantId, scope, search, Boolean(options.onlineOnly)],
    enabled: Boolean(auth.token && auth.session && options.enabled !== false),
    initialPageParam: '',
    queryFn: ({ pageParam, signal }) => apiRequest<MobileEditorDirectoryResponse>(
      '/team/editor-directory?' + new URLSearchParams({ scope, search, limit: '24', cursor: pageParam, online: options.onlineOnly ? '1' : '0' }).toString(),
      { token: auth.token, signal }),
    getNextPageParam: (lastPage) => lastPage.mode === 'agency' ? lastPage.pageInfo?.nextCursor ?? undefined : undefined,
    retry: 1,
  });
  const first = query.data?.pages[0];
  const data: MobileEditorDirectoryResponse | undefined = first?.mode === 'agency'
    ? { ...first, editors: Array.from(new Map(query.data!.pages.flatMap(page => page.mode === 'agency' ? page.editors : []).map(editor => [editor.id, editor])).values()) }
    : first;
  return { ...query, data };
}

export function useEditorProfile(editorId: string | null) {
  const auth = useAuth();
  return useQuery({
    queryKey: [...queryKeys.editorDirectory, 'profile', auth.session?.userId, auth.session?.tenantId, editorId],
    enabled: Boolean(editorId && auth.token && auth.session),
    queryFn: ({ signal }) => apiRequest<{ ok: boolean; editor: MobileTeamEditor }>(
      '/team/editor-directory/' + encodeURIComponent(editorId!), { token: auth.token, signal }),
    retry: 1,
  });
}

export function useAgencyDirectory(enabled = true) {
  const auth = useAuth();
  const token = auth.token;

  return useQuery({
    queryKey: [...queryKeys.agencyDirectory, auth.session?.userId, auth.session?.tenantId],
    enabled: Boolean(token && enabled),
    queryFn: () => apiRequest<MobileAgencyDirectoryResponse>('/mobile/v2/team', { token }),
  });
}

export function useRequestAgency() {
  const tokenQuery = useStoredToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ agencyUserId, message, requestKind, roleType }: { agencyUserId: string; message: string; requestKind: 'TEAM' | 'WORK'; roleType: string }) =>
      apiRequest<{ ok: boolean; duplicate?: boolean }>('/mobile/v2/team', {
        method: 'POST',
        token: tokenQuery.data ?? null,
        body: { agencyUserId, message, requestKind, roleType },
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.agencyDirectory }),
        queryClient.invalidateQueries({ queryKey: queryKeys.editorDirectory }),
      ]);
    },
  });
}

export function useInviteTeamEditor() {
  const tokenQuery = useStoredToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (editorProfileId: string) =>
      apiRequest<{ ok: boolean }>('/team/editor-directory', {
        method: 'POST',
        token: tokenQuery.data ?? null,
        body: { editorProfileId },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.editorDirectory }),
  });
}

export function useUpdateTeamMembership() {
  const tokenQuery = useStoredToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ membershipId, status }: { membershipId: string; status: MobileTeamMembershipStatus }) =>
      apiRequest<{ ok: boolean }>(`/team/memberships/${encodeURIComponent(membershipId)}`, {
        method: 'PATCH',
        token: tokenQuery.data ?? null,
        body: { status },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.editorDirectory }),
  });
}

export function useCancelTeamInvitation() {
  const tokenQuery = useStoredToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (requestId: string) =>
      apiRequest<{ ok: boolean }>(`/team/memberships/${encodeURIComponent(requestId)}`, {
        method: 'DELETE',
        token: tokenQuery.data ?? null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.editorDirectory });
    },
  });
}
