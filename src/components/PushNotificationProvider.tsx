import notifee, { EventType } from '@notifee/react-native';
import messaging, { FirebaseMessagingTypes } from '@react-native-firebase/messaging';
import { router } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Animated, PanResponder, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/src/hooks/useAuth';
import { useChats } from '@/src/hooks/useChats';
import { queryKeys } from '@/src/hooks/queryKeys';
import { queryClient } from '@/src/lib/queryClient';
import {
  acceptProjectOfferFromNotification,
  cancelProjectOfferNotification,
  ensureNotificationChannels,
  getPushPreference,
  getStoredPushToken,
  getRemoteMessageRouteData,
  displayRemotePushNotification,
  GIGXOMI_NOTIFICATION_REPLY_ACTION_ID,
  GIGXOMI_PROJECT_OFFER_ACCEPT_ACTION_ID,
  GIGXOMI_PROJECT_OFFER_REJECT_ACTION_ID,
  registerDevicePushToken,
  rejectProjectOfferFromNotification,
  savePushPreference,
  sendChatReplyFromNotification,
  shouldSuppressVisibleChatNotification,
  syncRotatedPushToken,
  unregisterDevicePushToken,
  type PushRegistrationResult,
  type PushRegistrationStatus,
} from '@/src/lib/pushNotifications';
import { theme } from '@/src/constants/theme';
import type { MobileConversation, MobileConversationsResponse } from '@/src/types';

function refreshThreadCache(conversationId: string) {
  if (!conversationId) {
    return;
  }

  void queryClient.invalidateQueries({
    predicate: (query) => query.queryKey[0] === 'chat-thread' && query.queryKey[1] === conversationId,
  });
}

function updateConversationPreviewFromNotification(conversationId: string, body: string, lane: 'customer' | 'internal' = 'customer') {
  if (!conversationId) {
    return;
  }

  queryClient.setQueriesData<MobileConversationsResponse | undefined>(
    {
      predicate: (query) => query.queryKey[0] === 'chats',
    },
    (current) => {
      if (!current?.conversations?.length) {
        return current;
      }

      let changed = false;
      const conversations = current.conversations.map((conversation) => {
        if (conversation.id !== conversationId) {
          return conversation;
        }

        changed = true;
        return {
          ...conversation,
          summary: body || conversation.summary,
          latestMessageLane: lane,
          preferredLane: lane,
          unreadCount: Math.max(0, (conversation.unreadCount ?? 0) + 1),
          unreadCountByLane: {
            ...conversation.unreadCountByLane,
            [lane]: Math.max(0, (conversation.unreadCountByLane?.[lane] ?? 0) + 1),
          },
        };
      });

      return changed ? { ...current, conversations } : current;
    },
  );
}

function refreshChatListCache() {
  void queryClient.invalidateQueries({
    predicate: (query) => query.queryKey[0] === 'chats',
  });
}

function refreshNotificationCache() {
  void queryClient.invalidateQueries({ queryKey: queryKeys.notifications });
}

type PushNotificationContextValue = {
  activeOfferConversationId: string | null;
  enabled: boolean;
  error: string;
  status: PushRegistrationStatus;
  token: string | null;
  enable: () => Promise<PushRegistrationResult | null>;
  disable: () => Promise<void>;
  previewFloatingBubble: () => void;
  refresh: () => Promise<void>;
};

const PushNotificationContext = createContext<PushNotificationContextValue | null>(null);
const SAFE_CHAT_NOTIFICATION_PREVIEW = 'New message - open Gigxomi to view.';

type FloatingPushBubble = {
  body: string;
  conversationId?: string;
  route: string;
  title: string;
  unreadCount: number;
};

const VALID_NOTIFICATION_AUDIENCES = new Set(['admin', 'manager', 'freelancer']);

function getNotificationString(data: Record<string, unknown>, key: string) {
  const value = data[key];
  return typeof value === 'string' ? value.trim() : '';
}

function getAudienceValue(value: unknown) {
  return typeof value === 'string' && VALID_NOTIFICATION_AUDIENCES.has(value) ? value : '';
}

function getLaneValue(value: unknown) {
  return value === 'customer' || value === 'internal' ? value : '';
}

function buildChatNotificationRoute(conversationId: string, audience?: unknown, lane?: unknown) {
  const cleanConversationId = conversationId.trim();
  if (!cleanConversationId) {
    return '/chats';
  }

  const audienceValue = getAudienceValue(audience);
  const laneValue = getLaneValue(lane);
  const params = new URLSearchParams();
  if (audienceValue) params.set('audience', audienceValue);
  if (laneValue) params.set('lane', laneValue);
  const query = params.toString();
  return `/chat/${encodeURIComponent(cleanConversationId)}${query ? `?${query}` : ''}`;
}

function safeDecodeRouteSegment(segment: string) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function normalizeMobileAppRoute(pathname: string, search = '') {
  const safeSearch = search && !search.startsWith('?') ? `?${search}` : search;
  const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
  const routePath = normalizedPath.replace(/\/+/g, '/');

  if (routePath === '/' || routePath === '') {
    return '/dashboard';
  }

  const params = new URLSearchParams(safeSearch.startsWith('?') ? safeSearch.slice(1) : safeSearch);
  const audience = params.get('audience') ?? params.get('role') ?? '';
  const queryConversationId =
    params.get('conversationId') ?? params.get('conversation') ?? params.get('threadId') ?? params.get('chatId') ?? '';
  const chatSegmentMatch = routePath.match(/(?:^|\/)chat\/([^/?#]+)/);

  if (chatSegmentMatch?.[1]) {
    return buildChatNotificationRoute(safeDecodeRouteSegment(chatSegmentMatch[1]), audience, params.get('lane'));
  }

  if (routePath === '/chat' || routePath.endsWith('/chat')) {
    return queryConversationId ? buildChatNotificationRoute(queryConversationId, audience, params.get('lane')) : '/chats';
  }

  if (routePath.startsWith('/projects/')) {
    const id = routePath.replace('/projects/', '').split('?')[0];
    return id ? `/assignment/${encodeURIComponent(id)}${safeSearch}` : `/projects${safeSearch}`;
  }

  if (routePath.startsWith('/team')) {
    return `/team${safeSearch}`;
  }

  return `${routePath}${safeSearch}`;
}

function normalizeParsedDeepLink(parsed: URL) {
  const queryConversationId =
    parsed.searchParams.get('conversationId') ??
    parsed.searchParams.get('conversation') ??
    parsed.searchParams.get('threadId') ??
    parsed.searchParams.get('chatId') ??
    '';
  const audience = parsed.searchParams.get('audience') ?? parsed.searchParams.get('role') ?? '';
  const lane = parsed.searchParams.get('lane') ?? '';

  if (parsed.protocol === 'gigxomi:' && (parsed.hostname === 'chat' || parsed.pathname.startsWith('/chat'))) {
    const pathnameConversationId = parsed.pathname.replace(/^\/chat\/?/, '').replace(/^\//, '');
    return buildChatNotificationRoute(pathnameConversationId || queryConversationId, audience, lane);
  }

  if (parsed.protocol === 'gigxomi:' && (parsed.hostname === '' || !parsed.hostname || parsed.pathname === '/' || !parsed.pathname)) {
    return '/dashboard';
  }

  const effectivePath = parsed.hostname && parsed.hostname !== 'www.gigxomi.com' && parsed.hostname !== 'gigxomi.com'
    ? `/${parsed.hostname}${parsed.pathname}`
    : parsed.pathname;

  return normalizeMobileAppRoute(effectivePath, parsed.search);
}

function normalizeDeepLinkRoute(rawLink: string) {
  const trimmedLink = rawLink.trim();
  if (!trimmedLink || trimmedLink === 'gigxomi://' || trimmedLink === 'gigxomi:///' || trimmedLink === 'gigxomi:') {
    return '/dashboard';
  }

  if (trimmedLink.startsWith('gigxomi://')) {
    try {
      return normalizeParsedDeepLink(new URL(trimmedLink));
    } catch {
      const remainder = trimmedLink.replace(/^gigxomi:\/\//, '').replace(/^\/+/, '');
      return remainder ? normalizeMobileAppRoute(remainder) : '/dashboard';
    }
  }

  if (trimmedLink.startsWith('http://') || trimmedLink.startsWith('https://')) {
    try {
      return normalizeParsedDeepLink(new URL(trimmedLink));
    } catch {
      return '/dashboard';
    }
  }

  if (trimmedLink.includes('://')) {
    return '/dashboard';
  }

  const [pathname, ...queryParts] = trimmedLink.split('?');
  const search = queryParts.length ? `?${queryParts.join('?')}` : '';
  return normalizeMobileAppRoute(pathname, search);
}

function routeFromNotificationData(data: Record<string, unknown>) {
  const type = getNotificationString(data, 'type');
  const entityType = getNotificationString(data, 'entityType');
  const entityId = getNotificationString(data, 'entityId');
  const conversationId = getConversationIdFromNotificationData(data);
  if (conversationId || type === 'chat' || type === 'chat_message' || entityType === 'conversation') {
    return buildChatNotificationRoute(conversationId, data.audience, data.lane);
  }

  const assignmentId = getNotificationString(data, 'assignmentId') || getNotificationString(data, 'projectId');
  if (assignmentId || type === 'project' || type === 'project_assigned') {
    return assignmentId ? `/assignment/${encodeURIComponent(assignmentId)}` : '/projects';
  }

  const teamId = getNotificationString(data, 'teamId');
  if (
    teamId ||
    type === 'team_invite' ||
    type === 'team_request' ||
    type === 'freelancer_work_interest' ||
    type === 'team_application_received' ||
    type.includes('team') ||
    entityType === 'team_request' ||
    entityType === 'team'
  ) {
    return '/team';
  }

  if (type === 'payment' || type === 'payout' || type.includes('wallet')) {
    return '/earnings';
  }

  if (type.includes('task') || type.includes('work') || entityType === 'task') {
    return entityId ? `/assignment/${encodeURIComponent(entityId)}` : '/projects';
  }

  const rawLink = getNotificationString(data, 'deepLinkUrl');
  if (rawLink) {
    const route = normalizeDeepLinkRoute(rawLink);
    if (route && route !== '/' && route !== '/dashboard') {
      return route;
    }
  }

  return '/notifications';
}

function getConversationIdFromNotificationData(data: Record<string, unknown>) {
  return (
    getNotificationString(data, 'conversationId') ||
    getNotificationString(data, 'chatId') ||
    getNotificationString(data, 'threadId')
  );
}

function openNotificationData(data: Record<string, unknown>) {
  const route = routeFromNotificationData(data);
  refreshThreadCache(getConversationIdFromNotificationData(data));
  refreshNotificationCache();
  router.push(route as any);
}

function getActiveProjectOffer(conversations?: MobileConversation[]) {
  const nowMs = Date.now();
  return (
    conversations
      ?.map((conversation) => ({
        conversation,
        offer: conversation.myAssignmentOffer ?? conversation.assignmentSummary?.myOffer ?? null,
      }))
      .filter(({ offer }) => offer?.status === 'PENDING' && (!offer.expiresAt || new Date(offer.expiresAt).getTime() > nowMs))
      .sort((left, right) => {
        const leftExpires = left.offer?.expiresAt ? new Date(left.offer.expiresAt).getTime() : Number.MAX_SAFE_INTEGER;
        const rightExpires = right.offer?.expiresAt ? new Date(right.offer.expiresAt).getTime() : Number.MAX_SAFE_INTEGER;
        return leftExpires - rightExpires;
      })[0] ?? null
  );
}

export function PushNotificationProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const isFreelancer = auth.session?.role === 'FREELANCER';
  const freelancerChats = useChats('freelancer', {
    enabled: Boolean(auth.token) && isFreelancer,
    includeSupportData: false,
    isFocused: true,
    liveSync: true,
  });
  const [enabled, setEnabled] = useState(false);
  const [preferenceLoaded, setPreferenceLoaded] = useState(false);
  const [status, setStatus] = useState<PushRegistrationStatus>('idle');
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [floatingBubble, setFloatingBubble] = useState<FloatingPushBubble | null>(null);
  const lastActiveOfferConversationIdRef = useRef('');
  const [bubbleOffset] = useState(() => new Animated.ValueXY({ x: 0, y: 0 }));
  const activeProjectOffer = useMemo(
    () => (isFreelancer ? getActiveProjectOffer(freelancerChats.data?.conversations) : null),
    [freelancerChats.data?.conversations, isFreelancer],
  );
  const bubblePanResponder = useMemo(() => {
    return PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dx) > 6 || Math.abs(gestureState.dy) > 6,
      onPanResponderGrant: () => {
        bubbleOffset.extractOffset();
      },
      onPanResponderMove: Animated.event([null, { dx: bubbleOffset.x, dy: bubbleOffset.y }], { useNativeDriver: false }),
      onPanResponderRelease: () => {
        bubbleOffset.flattenOffset();
      },
      onPanResponderTerminate: () => {
        bubbleOffset.flattenOffset();
      },
    });
  }, [bubbleOffset]);

  const register = useCallback(async (requestPermission: boolean): Promise<PushRegistrationResult | null> => {
    if (!auth.token) {
      setStatus('idle');
      return null;
    }

    setStatus('registering');
    setError('');
    const result = await registerDevicePushToken(auth.token, { requestPermission });
    setStatus(result.status);
    setToken(result.token ?? (await getStoredPushToken()));
    setError(result.error ?? '');
    return result;
  }, [auth.token]);

  async function enable() {
    await savePushPreference(true);
    setEnabled(true);
    const result = await register(true);
    if (result && !result.ok) {
      await savePushPreference(false);
      setEnabled(false);
    }
    return result;
  }

  async function disable() {
    await savePushPreference(false);
    setEnabled(false);
    setError('');

    if (!auth.token) {
      setStatus('disabled');
      setToken(null);
      return;
    }

    const result = await unregisterDevicePushToken(auth.token);
    setStatus(result.status);
    setToken(null);
    setError(result.error ?? '');
  }

  async function refresh() {
    const storedEnabled = await getPushPreference();
    const storedToken = await getStoredPushToken();
    setEnabled(storedEnabled);
    setToken(storedToken);
    setPreferenceLoaded(true);
    setStatus(storedEnabled ? (storedToken ? 'registered' : 'idle') : 'disabled');
  }

  function previewFloatingBubble() {
    setFloatingBubble({
      title: 'Gigxomi message',
      body: SAFE_CHAT_NOTIFICATION_PREVIEW,
      conversationId: 'preview',
      route: '/chats',
      unreadCount: 1,
    });
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }

    void ensureNotificationChannels();
  }, []);

  useEffect(() => {
    if (!preferenceLoaded || !enabled || !auth.token) {
      return;
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    void register(!token);
  }, [auth.token, enabled, preferenceLoaded, register, token]);

  useEffect(() => {
    const nextConversationId = activeProjectOffer?.conversation.id ?? '';
    const previousConversationId = lastActiveOfferConversationIdRef.current;
    if (previousConversationId && previousConversationId !== nextConversationId) {
      void cancelProjectOfferNotification(previousConversationId);
    }
    lastActiveOfferConversationIdRef.current = nextConversationId;
  }, [activeProjectOffer?.conversation.id]);

  useEffect(() => {
    if (Platform.OS !== 'android' && Platform.OS !== 'ios') {
      return undefined;
    }

    const unsubscribeMessage = messaging().onMessage(async (message) => {
      const data = getRemoteMessageRouteData(message);
      const route = routeFromNotificationData(data);
      const conversationId = getConversationIdFromNotificationData(data);
      const lane = getLaneValue(data.lane) || 'customer';
      const notificationType = String(data.type ?? '').trim().toLowerCase();
      const isProjectOffer =
        notificationType === 'assignment_new' ||
        notificationType === 'project_offer' ||
        notificationType === 'project_assigned' ||
        data.notificationCategoryId === 'gigxomi-project-offer';
      const isChatNotification = !isProjectOffer && Boolean(conversationId || notificationType === 'chat_message');
      const title = isChatNotification ? 'Gigxomi message' : String(data.title ?? '').trim() || 'Gigxomi update';
      const body = isChatNotification
        ? SAFE_CHAT_NOTIFICATION_PREVIEW
        : String(data.body ?? '').trim() || 'You have a new notification.';

      refreshNotificationCache();
      updateConversationPreviewFromNotification(conversationId, body, lane);
      refreshChatListCache();
      refreshThreadCache(conversationId);

      await displayRemotePushNotification(message);
      if (isProjectOffer) {
        return;
      }
      if (shouldSuppressVisibleChatNotification(data)) {
        return;
      }

      setFloatingBubble((current) => {
        const nextCount = (current?.unreadCount ?? 0) + 1;
        const sameConversation = current?.conversationId && current.conversationId === conversationId;

        if (current && !sameConversation) {
          return {
            body: `${nextCount} new chat alerts`,
            route: '/chats',
            title: 'Gigxomi messages',
            unreadCount: nextCount,
          };
        }

        return {
          body,
          conversationId,
          route,
          title,
          unreadCount: nextCount,
        };
      });

      // Auto dismiss floating bubble after 6 seconds to prevent UI obstruction
      setTimeout(() => {
        setFloatingBubble(null);
      }, 6000);
    });

    const unsubscribeOpened = messaging().onNotificationOpenedApp((message) => {
      openNotificationData(getRemoteMessageRouteData(message));
    });

    const unsubscribeNotifee = notifee.onForegroundEvent(({ detail, type }) => {
      if (type === EventType.ACTION_PRESS && detail.pressAction?.id === GIGXOMI_NOTIFICATION_REPLY_ACTION_ID) {
        void sendChatReplyFromNotification((detail.notification?.data ?? {}) as Record<string, unknown>, detail.input).then(() => {
          if (detail.notification?.id) {
            void notifee.cancelNotification(detail.notification.id);
          }
          refreshChatListCache();
          refreshThreadCache(getConversationIdFromNotificationData((detail.notification?.data ?? {}) as Record<string, unknown>));
        });
        return;
      }

      if (type === EventType.ACTION_PRESS && detail.pressAction?.id === GIGXOMI_PROJECT_OFFER_ACCEPT_ACTION_ID) {
        const data = (detail.notification?.data ?? {}) as Record<string, unknown>;
        const conversationId = getConversationIdFromNotificationData(data);
        void acceptProjectOfferFromNotification(data).then(() => {
          void cancelProjectOfferNotification(conversationId);
        }).finally(() => {
          refreshChatListCache();
          refreshThreadCache(conversationId);
          refreshNotificationCache();
        });
        return;
      }

      if (type === EventType.ACTION_PRESS && detail.pressAction?.id === GIGXOMI_PROJECT_OFFER_REJECT_ACTION_ID) {
        const data = (detail.notification?.data ?? {}) as Record<string, unknown>;
        const conversationId = getConversationIdFromNotificationData(data);
        void rejectProjectOfferFromNotification(data, detail.input).then(() => {
          void cancelProjectOfferNotification(conversationId);
        }).finally(() => {
          refreshChatListCache();
          refreshThreadCache(conversationId);
          refreshNotificationCache();
        });
        return;
      }

      if (type === EventType.PRESS) {
        openNotificationData((detail.notification?.data ?? {}) as Record<string, unknown>);
      }
    });

    const unsubscribeTokenRefresh = messaging().onTokenRefresh((nextToken) => {
      if (auth.token) {
        void syncRotatedPushToken(auth.token, nextToken);
      }
    });

    void messaging()
      .getInitialNotification()
      .then((message: FirebaseMessagingTypes.RemoteMessage | null) => {
        if (message) {
          openNotificationData(getRemoteMessageRouteData(message));
        }
      })
      .catch(() => undefined);

    void notifee
      .getInitialNotification()
      .then((initialNotification) => {
        const data = (initialNotification?.notification?.data ?? {}) as Record<string, unknown>;
        if (initialNotification?.pressAction?.id === GIGXOMI_PROJECT_OFFER_ACCEPT_ACTION_ID) {
          const conversationId = getConversationIdFromNotificationData(data);
          void acceptProjectOfferFromNotification(data).then(() => {
            void cancelProjectOfferNotification(conversationId);
          }).finally(() => {
            refreshChatListCache();
            refreshThreadCache(conversationId);
          });
          return;
        }
        if (initialNotification?.pressAction?.id === GIGXOMI_PROJECT_OFFER_REJECT_ACTION_ID) {
          const conversationId = getConversationIdFromNotificationData(data);
          void rejectProjectOfferFromNotification(data).then(() => {
            void cancelProjectOfferNotification(conversationId);
          }).finally(() => {
            refreshChatListCache();
            refreshThreadCache(conversationId);
          });
          return;
        }
        if (initialNotification?.notification) {
          openNotificationData(data);
        }
      })
      .catch(() => undefined);

    return () => {
      unsubscribeMessage();
      unsubscribeOpened();
      unsubscribeNotifee();
      unsubscribeTokenRefresh();
    };
  }, [auth.token]);

  const value = {
    activeOfferConversationId: activeProjectOffer?.conversation.id ?? null,
    enabled,
    error,
    status,
    token,
    enable,
    disable,
    previewFloatingBubble,
    refresh,
  };

  return (
    <PushNotificationContext.Provider value={value}>
      {children}
      {floatingBubble ? (
        <Animated.View
          pointerEvents="box-none"
          style={[
            styles.bubbleLayer,
            {
              transform: bubbleOffset.getTranslateTransform(),
            },
          ]}
          {...bubblePanResponder.panHandlers}
        >
          <View style={styles.bubblePreview}>
            <Text numberOfLines={1} style={styles.bubblePreviewTitle}>
              {floatingBubble.title}
            </Text>
            <Text numberOfLines={1} style={styles.bubblePreviewBody}>
              {floatingBubble.body}
            </Text>
          </View>
          <Pressable
            accessibilityLabel="Open floating notification"
            style={({ pressed }) => [styles.chatHead, pressed && styles.bubblePressed]}
            onPress={() => {
              const route = floatingBubble.route;
              setFloatingBubble(null);
              router.push(route);
            }}
          >
            <Text style={styles.chatHeadText}>GX</Text>
            <View style={styles.chatHeadBadge}>
              <Text style={styles.chatHeadBadgeText}>{Math.min(floatingBubble.unreadCount, 9)}</Text>
            </View>
          </Pressable>
          <Pressable
            hitSlop={10}
            style={styles.bubbleClose}
            onPress={() => {
              setFloatingBubble(null);
            }}
          >
            <Text style={styles.bubbleCloseText}>x</Text>
          </Pressable>
        </Animated.View>
      ) : null}
    </PushNotificationContext.Provider>
  );
}

export function usePushNotifications() {
  const value = useContext(PushNotificationContext);
  if (!value) {
    throw new Error('usePushNotifications must be used inside PushNotificationProvider.');
  }

  return value;
}

const styles = StyleSheet.create({
  bubbleLayer: {
    position: 'absolute',
    right: 16,
    top: 96,
    zIndex: 1000,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    maxWidth: 318,
  },
  bubblePreview: {
    maxWidth: 226,
    minHeight: 44,
    justifyContent: 'center',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.accentBorder,
    backgroundColor: 'rgba(13, 19, 24, 0.96)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    shadowColor: theme.colors.background,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.24,
    shadowRadius: 16,
    elevation: 10,
  },
  bubblePreviewTitle: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '900',
  },
  bubblePreviewBody: {
    color: theme.colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
  chatHead: {
    width: 58,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 29,
    borderWidth: 2,
    borderColor: theme.colors.accentBorder,
    backgroundColor: theme.colors.surfaceRaised,
    shadowColor: theme.colors.accent,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 12,
  },
  bubblePressed: {
    transform: [{ scale: 0.98 }],
  },
  chatHeadText: {
    color: theme.colors.accent,
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  chatHeadBadge: {
    position: 'absolute',
    right: -1,
    top: -3,
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
    borderWidth: 1,
    borderColor: theme.colors.surface,
    backgroundColor: theme.colors.danger,
  },
  chatHeadBadgeText: {
    color: theme.colors.text,
    fontSize: 10,
    fontWeight: '900',
  },
  bubbleClose: {
    position: 'absolute',
    right: -6,
    bottom: -6,
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(13,19,24,0.96)',
  },
  bubbleCloseText: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    fontWeight: '900',
  },
});
