import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from '@/src/lib/api';
import type { MobileNotificationReadResponse, MobileNotificationsResponse, MobilePushTestResponse } from '@/src/types';
import { queryKeys } from './queryKeys';
import { useStoredToken } from './useAuth';

export function useNotifications() {
  const tokenQuery = useStoredToken();
  const token = tokenQuery.data ?? null;

  return useQuery<MobileNotificationsResponse>({
    queryKey: queryKeys.notifications,
    enabled: Boolean(token),
    queryFn: () => apiRequest<MobileNotificationsResponse>('/notifications', { token }),
    refetchInterval: 30_000,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  const tokenQuery = useStoredToken();

  return useMutation({
    mutationFn: (notificationId: string) =>
      apiRequest<MobileNotificationReadResponse>(`/notifications/${encodeURIComponent(notificationId)}/read`, {
        method: 'POST',
        token: tokenQuery.data ?? null,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.notifications });
    },
  });
}

export function useSendTestPushNotification() {
  const tokenQuery = useStoredToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input?: { platform?: 'android' | 'ios'; token?: string | null; type?: 'chat' | 'system' }) =>
      apiRequest<MobilePushTestResponse>('/mobile/push-test', {
        method: 'POST',
        token: tokenQuery.data ?? null,
        body: {
          platform: input?.platform,
          title: input?.type === 'chat' ? 'Gigxomi test chat' : 'Gigxomi mobile push test',
          token: input?.token,
          type: input?.type,
          message: input?.type === 'chat' ? 'Chat notifications are connected for this mobile device.' : 'Push notifications are connected for this mobile device.',
          deepLinkUrl: input?.type === 'chat' ? undefined : '/notifications',
        },
      }),
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.pushDebug });
    },
  });
}
