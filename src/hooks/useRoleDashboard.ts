import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from '@/src/lib/api';
import type { MobileFreelancerDashboardResponse, MobileGenericDashboardResponse, MobileRole } from '@/src/types';
import { queryKeys } from './queryKeys';
import { useStoredToken } from './useAuth';

function getDashboardPath(role?: MobileRole | null, workspaceMode?: 'AGENCY' | 'FREELANCER' | null) {
  if (role === 'SUPER_ADMIN') {
    return '/super-admin/dashboard';
  }

  if (role === 'MANAGER') {
    return '/manager/dashboard';
  }

  if (role === 'ADMIN' || workspaceMode === 'AGENCY') {
    return '/admin/dashboard';
  }

  return '/freelancer/dashboard';
}

export function useRoleDashboard(role?: MobileRole | null, workspaceMode?: 'AGENCY' | 'FREELANCER' | null, userId?: string) {
  const tokenQuery = useStoredToken();
  const token = tokenQuery.data ?? null;
  const path = getDashboardPath(role, workspaceMode);
  const keyRole = `${userId ?? 'anonymous'}:${role ?? 'guest'}:${workspaceMode ?? 'none'}`;

  return useQuery<MobileFreelancerDashboardResponse | MobileGenericDashboardResponse>({
    queryKey: queryKeys.roleDashboard(keyRole),
    enabled: Boolean(token),
    queryFn: () => apiRequest<MobileFreelancerDashboardResponse | MobileGenericDashboardResponse>(path, { token }),
  });
}

export type FreelancerAvailabilityResponse = {
  ok: boolean;
  availability: { onlineStatus: 'online' | 'offline'; acceptingProjects: boolean; updatedAt?: string | null };
};

export function useFreelancerAvailability(enabled = true) {
  const tokenQuery = useStoredToken();
  return useQuery({
    queryKey: queryKeys.freelancerAvailability,
    enabled: Boolean(tokenQuery.data && enabled),
    queryFn: () => apiRequest<FreelancerAvailabilityResponse>('/freelancer/availability', { token: tokenQuery.data }),
  });
}

export function useSetFreelancerAvailability() {
  const tokenQuery = useStoredToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (onlineStatus: 'online' | 'offline') => apiRequest<FreelancerAvailabilityResponse>('/freelancer/availability', {
      method: 'POST',
      token: tokenQuery.data,
      body: { onlineStatus, acceptingProjects: onlineStatus === 'online' },
    }),
    onSuccess: (response) => {
      queryClient.setQueryData(queryKeys.freelancerAvailability, response);
      void queryClient.invalidateQueries({ queryKey: queryKeys.editorDirectory });
    },
  });
}
