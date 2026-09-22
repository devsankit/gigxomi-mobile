import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from '@/src/lib/api';
import type { FreelancerServiceRecord, FreelancerServicesResponse } from '@/src/types';
import { queryKeys } from './queryKeys';
import { useAuth, useStoredToken } from './useAuth';

export type ServiceCategory = 'Video Editing';

export type ServiceFormInput = {
  title: string;
  sampleVideoUrl?: string;
  sampleVideoEmbedUrl?: string;
  category: ServiceCategory;
  summary: string;
  description: string;
  basePrice: number;
  specialty: string;
  targetAudience: string;
  deliveryTime: string;
  revisions: string;
  tags: string;
  seoTitle: string;
  seoDescription: string;
  seoKeywords: string;
  deliverables: string;
  faq: string;
};

export function useServices(enabled = true) {
  const auth = useAuth();
  const token = auth.token;

  return useQuery({
    queryKey: [...queryKeys.services, auth.session?.userId, auth.session?.tenantId],
    enabled: Boolean(token && enabled),
    queryFn: () => apiRequest<FreelancerServicesResponse>('/freelancer/services', { token }),
  });
}

export function useServiceDetail(serviceId: string | undefined) {
  const tokenQuery = useStoredToken();
  const token = tokenQuery.data ?? null;

  return useQuery({
    queryKey: queryKeys.serviceDetail(serviceId ?? ''),
    enabled: Boolean(token && serviceId),
    queryFn: () => apiRequest<{ ok: boolean; service: FreelancerServiceRecord }>(`/freelancer/services/${serviceId}`, { token }),
  });
}

export function useCreateService() {
  const queryClient = useQueryClient();
  const tokenQuery = useStoredToken();

  return useMutation({
    mutationFn: (input: ServiceFormInput) =>
      apiRequest<{ ok: boolean; service: FreelancerServiceRecord }>('/freelancer/services', {
        method: 'POST',
        token: tokenQuery.data ?? null,
        body: input,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.services });
    },
  });
}

export function useUpdateService() {
  const queryClient = useQueryClient();
  const tokenQuery = useStoredToken();

  return useMutation({
    mutationFn: ({ serviceId, input }: { serviceId: string; input: ServiceFormInput }) =>
      apiRequest<{ ok: boolean; service: FreelancerServiceRecord }>(`/freelancer/services/${encodeURIComponent(serviceId)}`, {
        method: 'PATCH',
        token: tokenQuery.data ?? null,
        body: input,
      }),
    onSuccess: async (_payload, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.services }),
        queryClient.invalidateQueries({ queryKey: queryKeys.serviceDetail(variables.serviceId) }),
      ]);
    },
  });
}

export function useSubmitServiceReview() {
  const queryClient = useQueryClient();
  const tokenQuery = useStoredToken();

  return useMutation({
    mutationFn: (serviceId: string) =>
      apiRequest<{ ok: boolean; service: FreelancerServiceRecord }>(`/freelancer/services/${encodeURIComponent(serviceId)}/submit`, {
        method: 'POST',
        token: tokenQuery.data ?? null,
      }),
    onSuccess: async (_payload, serviceId) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.services }),
        queryClient.invalidateQueries({ queryKey: queryKeys.serviceDetail(serviceId) }),
      ]);
    },
  });
}

export function useUpdateServiceVisibility() {
  const queryClient = useQueryClient();
  const tokenQuery = useStoredToken();

  return useMutation({
    mutationFn: ({
      availability,
      listingEnabled,
      serviceId,
    }: {
      availability?: 'ACTIVE' | 'PAUSED';
      listingEnabled?: boolean;
      serviceId: string;
    }) =>
      apiRequest<{ ok: boolean; service: FreelancerServiceRecord }>(`/freelancer/services/${encodeURIComponent(serviceId)}`, {
        method: 'PATCH',
        token: tokenQuery.data ?? null,
        body: { availability, listingEnabled },
      }),
    onSuccess: async (_payload, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.services }),
        queryClient.invalidateQueries({ queryKey: queryKeys.serviceDetail(variables.serviceId) }),
      ]);
    },
  });
}
