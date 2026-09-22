import { useQuery } from '@tanstack/react-query';

import { apiRequest } from '@/src/lib/api';
import type { MobileIntegrationStatusResponse, MobilePushDebugResponse, MobileRole, MobileSystemHealthResponse } from '@/src/types';
import { queryKeys } from './queryKeys';
import { useStoredToken } from './useAuth';

function canViewAdminIntegration(role?: MobileRole | null) {
  return role === 'SUPER_ADMIN' || role === 'ADMIN' || role === 'MANAGER';
}

function canViewPaymentConfig(role?: MobileRole | null) {
  return role === 'SUPER_ADMIN' || role === 'ADMIN';
}

export function useWhatsAppIntegration(role?: MobileRole | null) {
  const tokenQuery = useStoredToken();
  const token = tokenQuery.data ?? null;

  return useQuery({
    queryKey: queryKeys.whatsappIntegration,
    enabled: Boolean(token && canViewAdminIntegration(role)),
    queryFn: () => apiRequest<MobileIntegrationStatusResponse>('/admin/whatsapp?sync=1', { token }),
  });
}

export function useUpiConfig(role?: MobileRole | null) {
  const tokenQuery = useStoredToken();
  const token = tokenQuery.data ?? null;

  return useQuery({
    queryKey: queryKeys.upiConfig,
    enabled: Boolean(token && canViewPaymentConfig(role)),
    queryFn: () => apiRequest<MobileIntegrationStatusResponse>('/admin/upi', { token }),
  });
}

export function useYouTubeIntegration() {
  const tokenQuery = useStoredToken();
  const token = tokenQuery.data ?? null;

  return useQuery({
    queryKey: queryKeys.youtubeIntegration,
    enabled: Boolean(token),
    queryFn: () => apiRequest<MobileIntegrationStatusResponse>('/admin/youtube', { token }),
  });
}

export function usePushRuntimeConfig() {
  return useQuery({
    queryKey: queryKeys.pushConfig,
    queryFn: () => apiRequest<MobileIntegrationStatusResponse>('/mobile/push-config'),
  });
}

export function usePushDebug(enabled = true) {
  const tokenQuery = useStoredToken();
  const token = tokenQuery.data ?? null;

  return useQuery({
    queryKey: queryKeys.pushDebug,
    enabled: Boolean(token && enabled),
    queryFn: () => apiRequest<MobilePushDebugResponse>('/mobile/push-debug', { token }),
  });
}

export function usePushDeviceDiagnostics(enabled = true) {
  return useQuery({
    queryKey: queryKeys.pushDeviceDiagnostics,
    enabled,
    queryFn: async () => {
      const { getPushDeviceDiagnostics } = await import('@/src/lib/pushNotifications');
      return getPushDeviceDiagnostics();
    },
  });
}

export function useSystemHealth() {
  return useQuery({
    queryKey: queryKeys.systemHealth,
    queryFn: () => apiRequest<MobileSystemHealthResponse>('/system/db-health'),
    refetchInterval: 60_000,
  });
}

export type AgencyConnection = {
  id?: string;
  provider: 'INSTAGRAM' | 'WHATSAPP';
  status: string;
  displayName?: string | null;
  lastError?: string | null;
  externalAccountId?: string | null;
};

export function useAgencyChannelIntegrations(enabled = true) {
  const tokenQuery = useStoredToken();
  const token = tokenQuery.data ?? null;

  return useQuery({
    queryKey: ['agency', 'channel-integrations'],
    enabled: Boolean(token && enabled),
    queryFn: async () => {
      return await apiRequest<{
        connections: AgencyConnection[];
        onboarding: { profileDoneAt?: string | null; payload?: Record<string, unknown> | null } | null;
      }>('/mobile/v2/integrations', { token });
    },
    staleTime: 10_000,
  });
}

export async function startWhatsAppSetup(token: string) {
  try {
    const v2Result = await apiRequest<{ authorizeUrl?: string }>('/mobile/v2/integrations/whatsapp/connect', {
      method: 'POST',
      token,
      body: { policyAccepted: true },
    });
    if (v2Result.authorizeUrl?.trim()) {
      return v2Result.authorizeUrl.trim();
    }
  } catch {
    // Fallback to admin whatsapp setup draft
  }

  const result = await apiRequest<{ connection?: { onboardingUrl?: string } | null }>('/admin/whatsapp?ensureDraft=1', { token });
  const authorizeUrl = result.connection?.onboardingUrl?.trim();
  if (!authorizeUrl) throw new Error('WhatsApp setup URL is unavailable. Please try again.');
  return authorizeUrl;
}

export async function startInstagramSetup(token: string) {
  const result = await apiRequest<{ authorizeUrl: string }>('/mobile/v2/integrations/instagram/connect', {
    method: 'POST',
    token,
    body: { policyAccepted: true },
  });
  if (!result.authorizeUrl) throw new Error('Instagram setup URL is unavailable. Please try again.');
  return result.authorizeUrl;
}
