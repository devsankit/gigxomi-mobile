import notifee, { AndroidCategory, AndroidGroupAlertBehavior, AndroidImportance, AndroidStyle, AndroidVisibility } from '@notifee/react-native';
import messaging, { FirebaseMessagingTypes } from '@react-native-firebase/messaging';
import { Platform } from 'react-native';

import { apiRequest } from '@/src/lib/api';
import { isLocalActiveMobileView } from '@/src/lib/activeView';
import { getToken } from '@/src/lib/authStorage';

export const GIGXOMI_NOTIFICATION_CHANNELS = {
  chat: 'gigxomi-chat-messages-v2',
  project: 'gigxomi-project-offers-v6',
  status: 'gigxomi-status-updates',
  payment: 'gigxomi-payment-updates',
  default: 'gigxomi-default',
} as const;
export const GIGXOMI_NOTIFICATION_CHANNEL_ID = GIGXOMI_NOTIFICATION_CHANNELS.default;
const GIGXOMI_NOTIFICATION_CHANNEL_IDS: readonly string[] = Object.values(GIGXOMI_NOTIFICATION_CHANNELS);
export const GIGXOMI_NOTIFICATION_CHANNEL_GROUPS = {
  messages: 'gigxomi-messages',
  work: 'gigxomi-work',
  other: 'gigxomi-other',
} as const;
export const GIGXOMI_NOTIFICATION_REPLY_ACTION_ID = 'gigxomi-chat-reply';
export const GIGXOMI_PROJECT_OFFER_ACCEPT_ACTION_ID = 'gigxomi-project-offer-accept';
export const GIGXOMI_PROJECT_OFFER_REJECT_ACTION_ID = 'gigxomi-project-offer-reject';
const GIGXOMI_CHAT_NOTIFICATION_GROUP_ID = 'gigxomi-chat';
const GIGXOMI_CHAT_NOTIFICATION_SUMMARY_ID = 'gigxomi-chat-summary';
const CHAT_NOTIFICATION_HISTORY_LIMIT = 5;
const PROJECT_OFFER_WINDOW_MS = 10 * 60 * 1000;
const PROJECT_OFFER_ALARM_SOUND = 'project_offer_alarm';
const chatNotificationMessages = new Map<
  string,
  Array<{
    id: string;
    text: string;
    timestamp: number;
    senderName: string;
  }>
>();

export type PushRegistrationStatus =
  | 'disabled'
  | 'idle'
  | 'registering'
  | 'registered'
  | 'unsupported'
  | 'permission-denied'
  | 'permission-default'
  | 'failed';

export type PushRegistrationResult = {
  ok: boolean;
  status: PushRegistrationStatus;
  token?: string;
  error?: string;
};

export type GigxomiPushData = Record<string, unknown>;
export type PushDeviceDiagnostics = {
  authorizationStatus?: number;
  chatChannelBlocked?: boolean;
  chatChannelId: string;
  chatChannelName?: string;
  channelExists: boolean;
  platform: string;
  projectChannelBlocked?: boolean;
  projectChannelId: string;
  projectChannelName?: string;
};

const PUSH_PREF_KEY = 'gigxomi.push.enabled';
const PUSH_TOKEN_KEY = 'gigxomi.push.fcmToken';
const memoryPushStorage = new Map<string, string>();
type SecureStoreModule = typeof import('expo-secure-store');

export function isNativePushRuntimeSupported() {
  return Platform.OS === 'android' || Platform.OS === 'ios';
}

function getBrowserStorage() {
  try {
    return typeof globalThis.localStorage === 'undefined' ? null : globalThis.localStorage;
  } catch {
    return null;
  }
}

async function getAvailableSecureStore(): Promise<SecureStoreModule | null> {
  if (Platform.OS === 'web') {
    return null;
  }

  try {
    const SecureStore = await import('expo-secure-store');
    if (typeof SecureStore.isAvailableAsync !== 'function') {
      return null;
    }
    return (await SecureStore.isAvailableAsync()) ? SecureStore : null;
  } catch {
    return null;
  }
}

async function readPushStorage(key: string) {
  const SecureStore = await getAvailableSecureStore();
  if (SecureStore) {
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      // Fall through to web/memory storage for previews and unsupported runtimes.
    }
  }

  const storage = getBrowserStorage();
  return storage?.getItem(key) ?? memoryPushStorage.get(key) ?? null;
}

async function writePushStorage(key: string, value: string) {
  const SecureStore = await getAvailableSecureStore();
  if (SecureStore) {
    try {
      await SecureStore.setItemAsync(key, value);
      return;
    } catch {
      // Fall through to web/memory storage for previews and unsupported runtimes.
    }
  }

  const storage = getBrowserStorage();
  if (storage) {
    storage.setItem(key, value);
  } else {
    memoryPushStorage.set(key, value);
  }
}

async function deletePushStorage(key: string) {
  const SecureStore = await getAvailableSecureStore();
  if (SecureStore) {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {
      // Fall through and clear fallback stores too.
    }
  }

  getBrowserStorage()?.removeItem(key);
  memoryPushStorage.delete(key);
}

function getPlatformForApi() {
  return Platform.OS === 'ios' ? 'ios' : 'android';
}

function getNotificationString(data: Record<string, unknown>, key: string) {
  const value = data[key];
  return typeof value === 'string' ? value.trim() : '';
}

function getConversationIdFromPushData(data: Record<string, unknown>) {
  return getNotificationString(data, 'conversationId') || getNotificationString(data, 'chatId') || getNotificationString(data, 'threadId');
}

function getLaneFromPushData(data: Record<string, unknown>) {
  return data.lane === 'internal' ? 'internal' : 'customer';
}

function getNotificationTimeValue(data: Record<string, unknown>) {
  const timestamp = Number(getNotificationString(data, 'timestamp') || getNotificationString(data, 'createdAt'));
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : Date.now();
}

function isChatPushData(data: Record<string, unknown>) {
  if (isProjectOfferPushData(data)) {
    return false;
  }
  const type = getNotificationString(data, 'type');
  return Boolean(getConversationIdFromPushData(data) || type === 'chat' || type === 'chat_message');
}

function getNotificationChannelIdForData(data: Record<string, unknown>) {
  const explicitChannelId = getNotificationString(data, 'notificationChannelId');
  if (explicitChannelId && GIGXOMI_NOTIFICATION_CHANNEL_IDS.includes(explicitChannelId)) {
    return explicitChannelId;
  }

  const type = getNotificationString(data, 'type');
  if (isChatPushData(data)) {
    return GIGXOMI_NOTIFICATION_CHANNELS.chat;
  }
  if (type === 'project' || type === 'project_assigned' || type === 'team_invite') {
    return GIGXOMI_NOTIFICATION_CHANNELS.project;
  }
  if (type === 'work_accepted' || type === 'work_completed' || type === 'status' || type === 'project_status') {
    return GIGXOMI_NOTIFICATION_CHANNELS.status;
  }
  if (type === 'payment') {
    return GIGXOMI_NOTIFICATION_CHANNELS.payment;
  }
  return GIGXOMI_NOTIFICATION_CHANNELS.default;
}

function isProjectOfferPushData(data: Record<string, unknown>) {
  const type = getNotificationString(data, 'type').toLowerCase();
  return (
    type === 'assignment_new' ||
    type === 'project_offer' ||
    type === 'project_assigned' ||
    getNotificationString(data, 'notificationCategoryId') === 'gigxomi-project-offer'
  );
}

function isProjectOfferMissedPushData(data: Record<string, unknown>) {
  return getNotificationString(data, 'type').toLowerCase() === 'assignment_missed';
}

export function getProjectOfferNotificationId(conversationId: string) {
  const normalizedId = conversationId.trim();
  return normalizedId ? `project-offer-${normalizedId}` : '';
}

export async function cancelProjectOfferNotification(conversationId: string) {
  const notificationId = getProjectOfferNotificationId(conversationId);
  if (notificationId) {
    await notifee.cancelNotification(notificationId).catch(() => undefined);
  }
}

function getProjectOfferExpiresAt(data: Record<string, unknown>) {
  const rawExpiresAt = getNotificationString(data, 'expiresAt') || getNotificationString(data, 'assignmentExpiresAt');
  const expiresAt = rawExpiresAt ? new Date(rawExpiresAt).getTime() : 0;
  if (Number.isFinite(expiresAt) && expiresAt > Date.now()) {
    return expiresAt;
  }

  return Date.now() + PROJECT_OFFER_WINDOW_MS;
}

export function isSilentPushSyncData(data: Record<string, unknown>) {
  return data.silentSync === '1' || data.silentSync === 'true';
}

export function shouldSuppressVisibleChatNotification(data: Record<string, unknown>) {
  if (isProjectOfferPushData(data)) {
    return false;
  }

  const conversationId = getConversationIdFromPushData(data);
  return Boolean(
    isSilentPushSyncData(data) ||
      (conversationId && isLocalActiveMobileView({ viewType: 'chat', referenceId: conversationId })),
  );
}

function stringNotificationData(data: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, String(value ?? '')]));
}

export async function ensureNotificationChannels() {
  if (Platform.OS !== 'android') {
    return GIGXOMI_NOTIFICATION_CHANNEL_ID;
  }

  await notifee.createChannelGroups([
    {
      id: GIGXOMI_NOTIFICATION_CHANNEL_GROUPS.messages,
      name: 'Chats',
    },
    {
      id: GIGXOMI_NOTIFICATION_CHANNEL_GROUPS.work,
      name: 'Work updates',
    },
    {
      id: GIGXOMI_NOTIFICATION_CHANNEL_GROUPS.other,
      name: 'Other',
    },
  ]);

  await Promise.all([
    notifee.createChannel({
      id: GIGXOMI_NOTIFICATION_CHANNELS.chat,
      name: 'Message notifications',
      description: 'New chat messages with quick reply.',
      groupId: GIGXOMI_NOTIFICATION_CHANNEL_GROUPS.messages,
      importance: AndroidImportance.HIGH,
      visibility: AndroidVisibility.PRIVATE,
      vibration: true,
      sound: 'default',
      lights: true,
    }),
    notifee.createChannel({
      id: GIGXOMI_NOTIFICATION_CHANNELS.project,
      name: 'Project offer alarm',
      description: 'Urgent project offers with a repeating alarm until handled or expired.',
      groupId: GIGXOMI_NOTIFICATION_CHANNEL_GROUPS.work,
      importance: AndroidImportance.HIGH,
      visibility: AndroidVisibility.PRIVATE,
      vibration: true,
      vibrationPattern: [700, 250, 700, 450],
      sound: PROJECT_OFFER_ALARM_SOUND,
      lights: true,
    }),
    notifee.createChannel({
      id: GIGXOMI_NOTIFICATION_CHANNELS.status,
      name: 'Status changes',
      description: 'Work accepted, completed, and project status alerts.',
      groupId: GIGXOMI_NOTIFICATION_CHANNEL_GROUPS.work,
      importance: AndroidImportance.DEFAULT,
      visibility: AndroidVisibility.PRIVATE,
      vibration: true,
      sound: 'default',
    }),
    notifee.createChannel({
      id: GIGXOMI_NOTIFICATION_CHANNELS.payment,
      name: 'Payment updates',
      description: 'Payment and payout alerts.',
      groupId: GIGXOMI_NOTIFICATION_CHANNEL_GROUPS.work,
      importance: AndroidImportance.HIGH,
      visibility: AndroidVisibility.PRIVATE,
      vibration: true,
      sound: 'default',
      lights: true,
    }),
    notifee.createChannel({
      id: GIGXOMI_NOTIFICATION_CHANNELS.default,
      name: 'Other notifications',
      description: 'General Gigxomi updates.',
      groupId: GIGXOMI_NOTIFICATION_CHANNEL_GROUPS.other,
      importance: AndroidImportance.DEFAULT,
      visibility: AndroidVisibility.PRIVATE,
      vibration: true,
      sound: 'default',
    }),
  ]);

  return GIGXOMI_NOTIFICATION_CHANNEL_ID;
}

export async function ensureNotificationChannel() {
  return ensureNotificationChannels();
}

export async function getPushDeviceDiagnostics(): Promise<PushDeviceDiagnostics> {
  if (Platform.OS !== 'android') {
    return {
      chatChannelId: GIGXOMI_NOTIFICATION_CHANNELS.chat,
      channelExists: false,
      platform: Platform.OS,
      projectChannelId: GIGXOMI_NOTIFICATION_CHANNELS.project,
    };
  }

  await ensureNotificationChannels();
  const [settings, channel, projectChannel] = await Promise.all([
    notifee.getNotificationSettings().catch(() => null),
    notifee.getChannel(GIGXOMI_NOTIFICATION_CHANNELS.chat).catch(() => null),
    notifee.getChannel(GIGXOMI_NOTIFICATION_CHANNELS.project).catch(() => null),
  ]);

  return {
    authorizationStatus: settings?.authorizationStatus,
    chatChannelBlocked: channel?.blocked,
    chatChannelId: GIGXOMI_NOTIFICATION_CHANNELS.chat,
    chatChannelName: channel?.name,
    channelExists: Boolean(channel),
    platform: Platform.OS,
    projectChannelBlocked: projectChannel?.blocked,
    projectChannelId: GIGXOMI_NOTIFICATION_CHANNELS.project,
    projectChannelName: projectChannel?.name,
  };
}

export async function openChatNotificationSettings() {
  if (Platform.OS !== 'android') {
    return;
  }

  await notifee.openNotificationSettings(GIGXOMI_NOTIFICATION_CHANNELS.chat);
}

export async function openProjectOfferNotificationSettings() {
  if (Platform.OS !== 'android') {
    return;
  }

  await notifee.openNotificationSettings(GIGXOMI_NOTIFICATION_CHANNELS.project);
}

export async function getPushPreference() {
  // A new install registers by default; Android still controls the permission
  // prompt, while an explicit in-app opt-out remains persisted as `0`.
  return (await readPushStorage(PUSH_PREF_KEY)) !== '0';
}

export async function savePushPreference(enabled: boolean) {
  await writePushStorage(PUSH_PREF_KEY, enabled ? '1' : '0');
}

export async function getStoredPushToken() {
  return readPushStorage(PUSH_TOKEN_KEY);
}

async function saveStoredPushToken(token: string) {
  await writePushStorage(PUSH_TOKEN_KEY, token);
}

async function clearStoredPushToken() {
  await deletePushStorage(PUSH_TOKEN_KEY);
}

async function requestPushPermission() {
  const settings = await notifee.requestPermission();
  if (settings.authorizationStatus > 0) {
    return true;
  }

  const firebaseStatus = await messaging().requestPermission();
  return (
    firebaseStatus === messaging.AuthorizationStatus.AUTHORIZED ||
    firebaseStatus === messaging.AuthorizationStatus.PROVISIONAL
  );
}

async function registerTokenWithBackend(authToken: string, fcmToken: string) {
  await apiRequest('/mobile/push-token', {
    method: 'POST',
    token: authToken,
    body: {
      provider: 'fcm',
      projectOfferChannelId: GIGXOMI_NOTIFICATION_CHANNELS.project,
      token: fcmToken,
      platform: getPlatformForApi(),
      supportsProjectOfferActions: true,
    },
  });
}

export async function registerDevicePushToken(
  authToken: string,
  options: { requestPermission: boolean },
): Promise<PushRegistrationResult> {
  if (!isNativePushRuntimeSupported()) {
    return { ok: false, status: 'unsupported', error: 'Firebase push notifications require an Android or iOS build.' };
  }

  try {
    await ensureNotificationChannels();
    if (options.requestPermission) {
      const granted = await requestPushPermission();
      if (!granted) {
        return { ok: false, status: 'permission-denied', error: 'Notifications are blocked for this device.' };
      }
    }

    await messaging().registerDeviceForRemoteMessages();
    const fcmToken = (await messaging().getToken()).trim();
    if (!fcmToken) {
      return { ok: false, status: 'failed', error: 'Firebase did not return an FCM token.' };
    }

    await registerTokenWithBackend(authToken, fcmToken);
    await saveStoredPushToken(fcmToken);

    return { ok: true, status: 'registered', token: fcmToken };
  } catch (error) {
    return {
      ok: false,
      status: 'failed',
      error: error instanceof Error ? error.message : 'FCM registration failed.',
    };
  }
}

export async function syncRotatedPushToken(authToken: string, fcmToken: string) {
  const token = fcmToken.trim();
  if (!token) {
    return;
  }

  await registerTokenWithBackend(authToken, token);
  await saveStoredPushToken(token);
}

export async function unregisterDevicePushToken(authToken: string): Promise<PushRegistrationResult> {
  const fcmToken = await getStoredPushToken();
  await clearStoredPushToken();

  if (!fcmToken) {
    return { ok: true, status: 'disabled' };
  }

  try {
    await apiRequest('/mobile/push-token', {
      method: 'DELETE',
      token: authToken,
      body: {
        token: fcmToken,
      },
    });

    await messaging().deleteToken().catch(() => undefined);

    return { ok: true, status: 'disabled' };
  } catch (error) {
    return {
      ok: false,
      status: 'failed',
      error: error instanceof Error ? error.message : 'FCM token deactivation failed.',
    };
  }
}

export function getPushRuntimeDiagnostics() {
  return {
    appOwnership: 'development-build',
    isDevice: isNativePushRuntimeSupported(),
    platform: Platform.OS,
    provider: 'fcm',
  };
}

export function getRemoteMessageRouteData(message: FirebaseMessagingTypes.RemoteMessage): GigxomiPushData {
  return {
    ...(message.data ?? {}),
    title: message.notification?.title,
    body: message.notification?.body,
  };
}

export function shouldDisplayRemotePushInBackground(message: FirebaseMessagingTypes.RemoteMessage) {
  // Android renders notification+data payloads itself while the app is
  // backgrounded or terminated. Only synthesize a Notifee notification for
  // data-only messages, otherwise the same offer appears twice.
  return !message.notification;
}

function getChatNotificationId(conversationId: string) {
  return `chat-${conversationId}`;
}

function pushChatNotificationMessage(input: { conversationId: string; messageId: string; senderName: string; text: string; timestamp: number }) {
  const existing = chatNotificationMessages.get(input.conversationId) ?? [];
  const next = [
    ...existing.filter((message) => message.id !== input.messageId),
    {
      id: input.messageId,
      senderName: input.senderName,
      text: input.text,
      timestamp: input.timestamp,
    },
  ]
    .sort((left, right) => left.timestamp - right.timestamp)
    .slice(-CHAT_NOTIFICATION_HISTORY_LIMIT);

  chatNotificationMessages.set(input.conversationId, next);
  return next;
}

async function shouldShowChatSummaryNotification(conversationId: string) {
  if (Platform.OS !== 'android') {
    return false;
  }

  const displayedNotifications = await notifee.getDisplayedNotifications().catch(() => []);
  const activeChatIds = new Set(
    displayedNotifications
      .map((item) => item.notification.id)
      .filter((id): id is string => Boolean(id?.startsWith('chat-') && id !== getChatNotificationId(conversationId))),
  );
  return activeChatIds.size > 0;
}

async function displayChatSummaryNotification(data: Record<string, unknown>) {
  await notifee.displayNotification({
    id: GIGXOMI_CHAT_NOTIFICATION_SUMMARY_ID,
    title: 'Gigxomi messages',
    body: 'New chat messages',
    data: stringNotificationData({
      ...data,
      type: 'chat',
      route: '/chats',
    }),
    android: {
      channelId: GIGXOMI_NOTIFICATION_CHANNELS.chat,
      groupId: GIGXOMI_CHAT_NOTIFICATION_GROUP_ID,
      groupSummary: true,
      groupAlertBehavior: AndroidGroupAlertBehavior.CHILDREN,
      category: AndroidCategory.MESSAGE,
      pressAction: { id: 'default', launchActivity: 'default' },
      smallIcon: 'ic_launcher',
    },
  });
}

export async function displayRemotePushNotification(message: FirebaseMessagingTypes.RemoteMessage) {
  const data = getRemoteMessageRouteData(message);
  if (shouldSuppressVisibleChatNotification(data)) {
    return;
  }

  const isChatNotification = isChatPushData(data);
  const isProjectOffer = isProjectOfferPushData(data);
  const isProjectOfferMissed = isProjectOfferMissedPushData(data);
  const conversationId = getConversationIdFromPushData(data);
  if (isProjectOfferMissed && conversationId) {
    await cancelProjectOfferNotification(conversationId);
  }
  const title = isChatNotification
    ? getNotificationString(data, 'conversationTitle') || getNotificationString(data, 'title') || 'Gigxomi message'
    : getNotificationString(data, 'title') || 'Gigxomi update';
  const body = isChatNotification
    ? getNotificationString(data, 'body') || 'New message - reply or open Gigxomi to view.'
    : getNotificationString(data, 'body') || 'You have a new notification.';
  const senderName = getNotificationString(data, 'senderName') || title;
  const messageId = getNotificationString(data, 'messageId') || `${conversationId || 'chat'}-${Date.now()}`;
  const timestamp = getNotificationTimeValue(data);
  const avatarUrl = getNotificationString(data, 'conversationAvatarUrl');
  const projectOfferExpiresAt = isProjectOffer ? getProjectOfferExpiresAt(data) : 0;

  const channelId = getNotificationChannelIdForData(data);
  const notificationId =
    isProjectOffer && conversationId
      ? getProjectOfferNotificationId(conversationId)
      : isChatNotification && conversationId
        ? getChatNotificationId(conversationId)
        : undefined;
  const chatMessages =
    isChatNotification && conversationId
      ? pushChatNotificationMessage({
          conversationId,
          messageId,
          senderName,
          text: body,
          timestamp,
        })
      : [];

  await ensureNotificationChannels();
  try {
    await notifee.displayNotification({
      ...(notificationId ? { id: notificationId } : {}),
      title,
      body,
      data: stringNotificationData(data),
      android: {
        channelId,
        autoCancel: !isProjectOffer,
        category: isChatNotification ? AndroidCategory.MESSAGE : isProjectOffer ? AndroidCategory.CALL : AndroidCategory.STATUS,
        circularLargeIcon: Boolean(avatarUrl),
        groupId: isChatNotification ? GIGXOMI_CHAT_NOTIFICATION_GROUP_ID : undefined,
        groupAlertBehavior: isChatNotification ? AndroidGroupAlertBehavior.CHILDREN : undefined,
        importance: isChatNotification || isProjectOffer ? AndroidImportance.HIGH : undefined,
        lightUpScreen: isProjectOffer,
        loopSound: isProjectOffer,
        ongoing: isProjectOffer,
        onlyAlertOnce: false,
        largeIcon: avatarUrl || undefined,
        pressAction: { id: 'default', launchActivity: 'default' },
        smallIcon: 'ic_notification',
        sound: isProjectOffer ? PROJECT_OFFER_ALARM_SOUND : undefined,
        showChronometer: isProjectOffer,
        showTimestamp: isChatNotification,
        timestamp: isProjectOffer ? projectOfferExpiresAt : undefined,
        chronometerDirection: isProjectOffer ? 'down' : undefined,
        timeoutAfter: isProjectOffer ? Math.max(1000, projectOfferExpiresAt - Date.now()) : undefined,
        style:
          isChatNotification && chatMessages.length
            ? {
                type: AndroidStyle.MESSAGING,
                title,
                person: {
                  id: 'gigxomi-device-user',
                  name: 'You',
                },
                messages: chatMessages.map((message) => ({
                  text: message.text,
                  timestamp: message.timestamp,
                  person: {
                    id: message.senderName,
                    name: message.senderName,
                  },
                })),
              }
            : undefined,
        actions:
          Platform.OS === 'android' && isProjectOffer && conversationId
            ? [
                {
                  title: 'Accept',
                  pressAction: { id: GIGXOMI_PROJECT_OFFER_ACCEPT_ACTION_ID },
                },
                {
                  title: 'Reject',
                  pressAction: { id: GIGXOMI_PROJECT_OFFER_REJECT_ACTION_ID },
                },
              ]
            : Platform.OS === 'android' && isChatNotification
            ? [
                {
                  title: 'Reply',
                  pressAction: { id: GIGXOMI_NOTIFICATION_REPLY_ACTION_ID },
                  input: {
                    allowFreeFormInput: true,
                    placeholder: 'Reply...',
                  },
                },
              ]
            : undefined,
      },
    });
  } catch (displayError) {
    console.warn('[notifee] Failed to display notification:', displayError);
  }

  if (isChatNotification && conversationId && (await shouldShowChatSummaryNotification(conversationId))) {
    try {
      await displayChatSummaryNotification(data);
    } catch (summaryError) {
      console.warn('[notifee] Failed to display chat summary notification:', summaryError);
    }
  }
}

export async function sendChatReplyFromNotification(data: Record<string, unknown>, replyText: unknown) {
  const body = typeof replyText === 'string' ? replyText.trim() : '';
  const conversationId = getConversationIdFromPushData(data);
  if (!body || !conversationId) {
    return { ok: false, error: 'Missing reply text or conversation id.' };
  }

  const authToken = await getToken();
  if (!authToken) {
    return { ok: false, error: 'Sign in again to reply from notifications.' };
  }

  return apiRequest<{ ok: boolean }>(`/conversations/${encodeURIComponent(conversationId)}/messages`, {
    method: 'POST',
    token: authToken,
    body: {
      body,
      lane: getLaneFromPushData(data),
      clientMessageId: `push-reply-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    },
  });
}

export async function acceptProjectOfferFromNotification(data: Record<string, unknown>) {
  const conversationId = getConversationIdFromPushData(data);
  if (!conversationId) {
    return { ok: false, error: 'Missing conversation id.' };
  }

  const authToken = await getToken();
  if (!authToken) {
    return { ok: false, error: 'Sign in again to accept this project.' };
  }

  return apiRequest<{ ok: boolean }>(`/conversations/${encodeURIComponent(conversationId)}/assignment/respond`, {
    method: 'POST',
    token: authToken,
    body: {
      action: 'ACCEPT',
    },
  });
}

export async function rejectProjectOfferFromNotification(data: Record<string, unknown>, rejectionReason?: unknown) {
  const conversationId = getConversationIdFromPushData(data);
  if (!conversationId) {
    return { ok: false, error: 'Missing conversation id.' };
  }

  const authToken = await getToken();
  if (!authToken) {
    return { ok: false, error: 'Sign in again to reject this project.' };
  }

  const normalizedReason = typeof rejectionReason === 'string' ? rejectionReason.trim() : '';
  return apiRequest<{ ok: boolean }>(`/conversations/${encodeURIComponent(conversationId)}/assignment/respond`, {
    method: 'POST',
    token: authToken,
    body: {
      action: 'PASS',
      rejectionReason: normalizedReason || 'Rejected from Android notification.',
    },
  });
}
