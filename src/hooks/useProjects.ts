import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from '@/src/lib/api';
import type { MobileProjectsResponse } from '@/src/types';
import { queryKeys } from './queryKeys';
import { useStoredToken } from './useAuth';

export function useProjects() {
  const tokenQuery = useStoredToken();
  const token = tokenQuery.data ?? null;

  return useQuery({
    queryKey: queryKeys.projects,
    enabled: Boolean(token),
    queryFn: () => apiRequest<MobileProjectsResponse>('/mobile/freelancer/projects', { token }),
  });
}

export function useProjectDetail(projectId: string | undefined) {
  const projectsQuery = useProjects();
  const project = projectsQuery.data?.projects.find((item) => item.id === projectId) ?? null;

  return {
    ...projectsQuery,
    data: project,
    project,
  };
}

export function useApplyProject() {
  const queryClient = useQueryClient();
  const tokenQuery = useStoredToken();

  return useMutation({
    mutationFn: (projectId: string) =>
      apiRequest<{ ok: boolean; application: { projectId: string; status: string; note?: string } }>('/mobile/freelancer/projects', {
        method: 'POST',
        token: tokenQuery.data ?? null,
        body: { projectId },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.projects });
    },
  });
}
