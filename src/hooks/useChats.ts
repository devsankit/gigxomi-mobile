import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { ApiError, apiRequest, isNetworkError } from '@/src/lib/api';
import {
  enqueuePendingChatMessage,
  listPendingChatMessages,
  markPendingChatMessageAttempt,
  removePendingChatMessage,
} from '@/src/lib/chatOutbox';
import {
  readCachedChatList,
  readCachedChatThread,
  writeCachedChatList,
  writeCachedChatThread,
} from '@/src/lib/chatCache';
import type {
  MobileConversation,
  MobileConversationAttachment,
  MobileConversationLane,
  MobileConversationMessage,
  MobileConversationRole,
  MobileConversationsResponse,
  MobileInboxAudience,
  MobilePaymentStatus,
} from '@/src/types';
import { queryKeys } from './queryKeys';
import { useStoredToken } from './useAuth';

const CHAT_LIST_STALE_MS = 0;
const CHAT_THREAD_STALE_MS = 0;
const CHAT_LIST_LIVE_SYNC_MS = 4_000;
const CHAT_THREAD_LIVE_SYNC_MS = 2_500;
const CHAT_FOCUS_REFETCH_MIN_MS = 1_000;
const CHAT_OUTBOX_FLUSH_MS = 12_000;
const CHAT_OUTBOX_MAX_ATTEMPTS = 5;

const pendingClientIds = new WeakMap<SendMessageInput, string>();
const outboxFlushes = new Map<MobileInboxAudience, Promise<void>>();

type SendMessageInput = {
  conversationId: string;
  lane: MobileConversationLane;
  body?: string;
  clientMessageId?: string;
  visibility?: 'client_private';
  attachments?: Array<{
    name: string;
    mimeType?: string;
    sizeBytes?: number;
    uploadTarget?: 'local' | 'youtube';
    durationSeconds?: number;
    note?: string;
    externalUrl?: string;
  }>;
};

type DeleteMessageInput = {
  conversationId: string;
  messageId: string;
  scope?: 'everyone';
};

type MarkPaymentInput = {
  conversationId: string;
  paymentRequestId: string;
  status: MobilePaymentStatus;
};

type AssignConversationInput = {
  conversationId: string;
  freelancerId?: string;
  freelancerIds?: string[];
  assignmentMode?: 'offer' | 'direct' | 'replace';
  projectDetails?: string;
};

type AssignmentResponseInput = {
  conversationId: string;
  action: 'ACCEPT' | 'PASS';
  rejectionReason?: string;
};

type LeadStatusInput = {
  conversationId: string;
  leadStatusId: string;
};

type CustomerLaneAccessInput = {
  conversationId: string;
  enabled: boolean;
};

type CreatePaymentRequestInput = {
  conversationId: string;
  lane: MobileConversationLane;
  amount: number;
  title: string;
  note?: string;
  dueLabel?: string;
  assignmentId?: string;
  projectId?: string;
  projectTitle?: string;
  payerRole?: 'client' | 'agency';
  payeeRole?: 'agency' | 'freelancer';
};

type TypingInput = {
  conversationId: string;
  lane: MobileConversationLane;
  active: boolean;
};

type MarkReadInput = {
  conversationId: string;
  lane?: MobileConversationLane;
};

type ClientAliasInput = {
  conversationId: string;
  alias: string;
};

type MobileConversationDetailResponse = {
  ok: boolean;
  conversation: MobileConversation | null;
};

function sanitizeConversationForAudience(
  conversation: MobileConversation | null | undefined,
  audience: MobileInboxAudience,
): MobileConversation | null | undefined {
  if (!conversation || audience !== 'freelancer') {
    return conversation;
  }

  const customerLaneVisible = conversation.laneCapabilities?.customer?.visible !== false;
  const customerWritable = Boolean(
    conversation.capabilities?.canSendCustomerMessage ??
      (conversation.laneCapabilities?.customer?.writable && conversation.freelancerCustomerLanePermission?.enabled)
  );

  const messages = (conversation.messages ?? []).filter((message) => {
    if (message.lane !== 'customer') {
      return true;
    }

    if (!customerLaneVisible) {
      return false;
    }

    return message.visibility !== 'client_private';
  });
  const unreadByLane = {
    customer: customerLaneVisible ? Math.max(0, conversation.unreadCountByLane?.customer ?? 0) : 0,
    internal: Math.max(0, conversation.unreadCountByLane?.internal ?? 0),
  };
  const visibleLanes = customerLaneVisible
    ? conversation.visibleLanes
    : (conversation.visibleLanes ?? []).filter((lane) => lane !== 'customer');

  const laneCapabilities = conversation.laneCapabilities
    ? {
        ...conversation.laneCapabilities,
        customer: {
          ...conversation.laneCapabilities.customer,
          visible: customerLaneVisible,
          writable: customerWritable,
          reason: customerWritable ? undefined : 'Client messaging is set to read-only by agency. Use the internal team lane to coordinate with your manager.',
        },
      }
    : conversation.laneCapabilities;

  const capabilities = conversation.capabilities
    ? {
        ...conversation.capabilities,
        canSendCustomerMessage: customerWritable,
        canViewPrivateMessages: false,
      }
    : conversation.capabilities;

  return {
    ...conversation,
    messages,
    visibleLanes,
    laneCapabilities,
    capabilities,
    laneCounts: {
      customer: messages.filter((message) => message.lane === 'customer').length,
      internal: messages.filter((message) => message.lane === 'internal').length,
    },
    unreadCountByLane: unreadByLane,
    unreadCount: unreadByLane.customer + unreadByLane.internal,
    latestMessageLane: customerLaneVisible ? conversation.latestMessageLane : 'internal',
    preferredLane: customerLaneVisible ? conversation.preferredLane : 'internal',
  };
}

function sanitizeChatResponseForAudience(
  response: MobileConversationsResponse,
  audience: MobileInboxAudience,
): MobileConversationsResponse {
  return {
    ...response,
    conversations: response.conversations.map((conversation) => sanitizeConversationForAudience(conversation, audience) ?? conversation),
  };
}

async function fetchConversationFromList(input: {
  audience: MobileInboxAudience;
  conversationId: string;
  token: string | null;
}): Promise<MobileConversationDetailResponse> {
  const response = sanitizeChatResponseForAudience(
    await apiRequest<MobileConversationsResponse>(`/conversations?audience=${input.audience}&includeSupportData=0&lightweight=0`, {
      token: input.token,
    }),
    input.audience,
  );
  return {
    ok: response.ok,
    conversation: response.conversations.find((conversation) => conversation.id === input.conversationId) ?? null,
  };
}

async function fetchChatList(input: { audience: MobileInboxAudience; token: string | null; includeSupportData?: boolean }) {
  const includeSupportData = input.includeSupportData ? 1 : 0;
  try {
    const response = sanitizeChatResponseForAudience(
      await apiRequest<MobileConversationsResponse>(
        `/conversations?audience=${input.audience}&includeSupportData=${includeSupportData}`,
        {
          token: input.token,
        },
      ),
      input.audience,
    );
    await writeCachedChatList(input.audience, response);
    return response;
  } catch (error) {
    if (isNetworkError(error)) {
      const cached = await readCachedChatList(input.audience);
      if (cached) {
        return cached;
      }
    }
    throw error;
  }
}

async function fetchConversationDetail(input: {
  audience: MobileInboxAudience;
  conversationId: string;
  token: string | null;
}): Promise<MobileConversationDetailResponse> {
  try {
    const response = await apiRequest<MobileConversationDetailResponse>(
      `/conversations/${encodeURIComponent(input.conversationId)}/messages?audience=${input.audience}`,
      {
        token: input.token,
      },
    );
    response.conversation = sanitizeConversationForAudience(response.conversation, input.audience) ?? null;
    if (response.conversation) {
      await writeCachedChatThread(input.conversationId, input.audience, response.conversation);
    }
    return response;
  } catch (error) {
    if (isNetworkError(error)) {
      const cachedThread = await readCachedChatThread(input.conversationId, input.audience);
      if (cachedThread?.conversation) {
        return cachedThread;
      }
    }

    if (error instanceof ApiError && (error.status === 404 || error.status === 405)) {
      const response = await fetchConversationFromList(input);
      if (response.conversation) {
        await writeCachedChatThread(input.conversationId, input.audience, response.conversation);
      }
      return response;
    }

    throw error;
  }
}

type UseChatsOptions = {
  enabled?: boolean;
  liveSync?: boolean;
  includeSupportData?: boolean;
  isFocused?: boolean;
};

function useIsAppActive() {
  const [isActive, setIsActive] = useState(AppState.currentState === 'active');

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      setIsActive(state === 'active');
    });

    return () => subscription.remove();
  }, []);

  return isActive;
}

function upsertConversation(
  current: MobileConversationsResponse | undefined,
  nextConversation: MobileConversation | null | undefined,
): MobileConversationsResponse | undefined {
  if (!current?.conversations || !nextConversation) {
    return current;
  }

  const exists = current.conversations.some((conversation) => conversation.id === nextConversation.id);
  return {
    ...current,
    conversations: exists
      ? current.conversations.map((conversation) =>
          conversation.id === nextConversation.id ? mergeConversation(conversation, nextConversation) : conversation,
        )
      : [nextConversation, ...current.conversations],
  };
}

function mergeMessages(current: MobileConversationMessage[] | undefined, incoming: MobileConversationMessage[] | undefined) {
  const byId = new Map<string, MobileConversationMessage>();
  const pendingMessages: MobileConversationMessage[] = [];
  for (const message of current ?? []) {
    byId.set(message.id, message);
    if (message.id.startsWith('pending-')) {
      pendingMessages.push(message);
    }
  }
  for (const message of incoming ?? []) {
    const pendingReplacement = pendingMessages.find((pending) => shouldReplacePendingMessage(pending, message));
    if (pendingReplacement) {
      byId.delete(pendingReplacement.id);
    }
    byId.set(message.id, { ...byId.get(message.id), ...message });
  }

  return [...byId.values()].sort((left, right) => {
    const leftTime = new Date(left.createdAt ?? '').getTime();
    const rightTime = new Date(right.createdAt ?? '').getTime();
    return (Number.isFinite(leftTime) ? leftTime : 0) - (Number.isFinite(rightTime) ? rightTime : 0);
  });
}

function getMessageTimeValue(message: MobileConversationMessage) {
  const value = new Date(message.createdAt ?? '').getTime();
  return Number.isFinite(value) ? value : 0;
}

function getMessageAttachmentSignature(message: MobileConversationMessage) {
  return (message.attachments ?? [])
    .map((attachment) => `${attachment.kind}:${attachment.name}:${attachment.mimeType ?? ''}:${attachment.sizeLabel ?? ''}`)
    .join('|');
}

function shouldReplacePendingMessage(pending: MobileConversationMessage, incoming: MobileConversationMessage) {
  if (!pending.id.startsWith('pending-') || incoming.id.startsWith('pending-')) {
    return false;
  }

  if (incoming.clientMessageId && incoming.clientMessageId === pending.id) {
    return true;
  }

  const pendingTime = getMessageTimeValue(pending);
  const incomingTime = getMessageTimeValue(incoming);
  const closeInTime = !pendingTime || !incomingTime || Math.abs(incomingTime - pendingTime) <= 5 * 60_000;
  return (
    closeInTime &&
    pending.lane === incoming.lane &&
    pending.senderRole === incoming.senderRole &&
    pending.body.trim() === incoming.body.trim() &&
    (pending.visibility ?? '') === (incoming.visibility ?? '') &&
    getMessageAttachmentSignature(pending) === getMessageAttachmentSignature(incoming)
  );
}

function mergeConversation(current: MobileConversation | undefined, incoming: MobileConversation) {
  if (!current) {
    return incoming;
  }

  const currentBase = incoming.messages
    ? current.messages.filter((message) => message.id.startsWith('pending-'))
    : current.messages;
  const messages = mergeMessages(currentBase, incoming.messages);
  const laneCounts = {
    customer: Math.max(current.laneCounts?.customer ?? 0, incoming.laneCounts?.customer ?? 0, messages.filter((message) => message.lane === 'customer').length),
    internal: Math.max(current.laneCounts?.internal ?? 0, incoming.laneCounts?.internal ?? 0, messages.filter((message) => message.lane === 'internal').length),
  };

  return {
    ...current,
    ...incoming,
    customerProfileImageUrl: incoming.customerProfileImageUrl || current.customerProfileImageUrl,
    messages,
    laneCounts,
    visibleLanes: incoming.visibleLanes?.length ? incoming.visibleLanes : current.visibleLanes,
    unreadCountByLane: {
      customer: incoming.unreadCountByLane?.customer ?? current.unreadCountByLane?.customer ?? 0,
      internal: incoming.unreadCountByLane?.internal ?? current.unreadCountByLane?.internal ?? 0,
    },
  };
}

function setConversationCaches(
  queryClient: ReturnType<typeof useQueryClient>,
  audience: MobileInboxAudience,
  conversation: MobileConversation | null | undefined,
) {
  if (!conversation) {
    return;
  }
  const sanitizedConversation = sanitizeConversationForAudience(conversation, audience);
  if (!sanitizedConversation) {
    return;
  }

  queryClient.setQueryData<MobileConversationDetailResponse | undefined>(queryKeys.chatThread(conversation.id, audience), (current) => ({
    ok: current?.ok ?? true,
    conversation: mergeConversation(current?.conversation ?? undefined, sanitizedConversation),
  }));
  queryClient.setQueryData<MobileConversationsResponse | undefined>(queryKeys.chats(audience), (current) =>
    upsertConversation(current, sanitizedConversation),
  );
  queryClient.setQueryData<MobileConversationsResponse | undefined>(queryKeys.chats(audience, true), (current) =>
    upsertConversation(current, sanitizedConversation),
  );
  const cachedThread = queryClient.getQueryData<MobileConversationDetailResponse | undefined>(queryKeys.chatThread(conversation.id, audience));
  const cachedList =
    queryClient.getQueryData<MobileConversationsResponse | undefined>(queryKeys.chats(audience, true)) ??
    queryClient.getQueryData<MobileConversationsResponse | undefined>(queryKeys.chats(audience));
  void writeCachedChatThread(conversation.id, audience, cachedThread?.conversation ?? sanitizedConversation).catch(() => undefined);
  if (cachedList) {
    void writeCachedChatList(audience, cachedList).catch(() => undefined);
  }
}

function removeConversationFromListCaches(
  queryClient: ReturnType<typeof useQueryClient>,
  audience: MobileInboxAudience,
  conversationId: string,
) {
  const removeConversation = (current: MobileConversationsResponse | undefined) => {
    if (!current?.conversations.some((conversation) => conversation.id === conversationId)) {
      return current;
    }
    return {
      ...current,
      conversations: current.conversations.filter((conversation) => conversation.id !== conversationId),
    };
  };

  queryClient.setQueryData<MobileConversationsResponse | undefined>(queryKeys.chats(audience), removeConversation);
  queryClient.setQueryData<MobileConversationsResponse | undefined>(queryKeys.chats(audience, true), removeConversation);
  const cachedList =
    queryClient.getQueryData<MobileConversationsResponse | undefined>(queryKeys.chats(audience, true)) ??
    queryClient.getQueryData<MobileConversationsResponse | undefined>(queryKeys.chats(audience));
  if (cachedList) {
    void writeCachedChatList(audience, cachedList).catch(() => undefined);
  }
}

function getOptimisticSenderRole(audience: MobileInboxAudience): MobileConversationRole {
  return audience;
}

function getOptimisticSenderLabel(audience: MobileInboxAudience) {
  if (audience === 'freelancer') {
    return 'Freelancer';
  }

  if (audience === 'manager') {
    return 'Manager';
  }

  return 'Gigxomi Studio';
}

function getAttachmentSizeLabel(sizeBytes?: number) {
  if (!sizeBytes || !Number.isFinite(sizeBytes)) {
    return undefined;
  }

  if (sizeBytes >= 1024 * 1024) {
    return `${(sizeBytes / (1024 * 1024)).toFixed(sizeBytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
  }

  if (sizeBytes >= 1024) {
    return `${Math.ceil(sizeBytes / 1024)} KB`;
  }

  return `${sizeBytes} B`;
}

function getOptimisticAttachmentKind(attachment: NonNullable<SendMessageInput['attachments']>[number]): MobileConversationAttachment['kind'] {
  const mimeType = String(attachment.mimeType ?? '').toLowerCase();

  if (attachment.durationSeconds || mimeType.startsWith('audio/')) {
    return 'voice-note';
  }

  if (mimeType.startsWith('image/')) {
    return 'image';
  }

  if (mimeType.startsWith('video/')) {
    return 'video';
  }

  return 'file';
}

function buildOptimisticAttachments(input: SendMessageInput, clientMessageId: string): MobileConversationAttachment[] | undefined {
  const attachments = input.attachments ?? [];
  if (!attachments.length) {
    return undefined;
  }

  return attachments.map((attachment, index) => ({
    id: `${clientMessageId}-attachment-${index}`,
    kind: getOptimisticAttachmentKind(attachment),
    target: attachment.uploadTarget ?? 'local',
    name: attachment.name,
    mimeType: attachment.mimeType,
    sizeLabel: getAttachmentSizeLabel(attachment.sizeBytes),
    note: attachment.note,
    durationLabel: attachment.durationSeconds ? `${Math.max(1, Math.floor(attachment.durationSeconds))}s` : undefined,
    externalUrl: attachment.externalUrl,
  }));
}

function getOptimisticSummary(input: SendMessageInput) {
  const body = input.body?.trim();
  if (body) {
    return body;
  }

  const attachmentCount = input.attachments?.length ?? 0;
  if (attachmentCount === 1) {
    return input.attachments?.[0]?.name ? `Attachment: ${input.attachments[0].name}` : 'Attachment sent';
  }

  if (attachmentCount > 1) {
    return `${attachmentCount} attachments sent`;
  }

  return '';
}

function addOptimisticMessage(
  conversation: MobileConversation | null | undefined,
  input: SendMessageInput,
  audience: MobileInboxAudience,
  clientMessageId: string,
): MobileConversation | null | undefined {
  if (!conversation) {
    return conversation;
  }

  const timestamp = new Date().toISOString();
  const optimisticMessage: MobileConversationMessage = {
    id: clientMessageId,
    clientMessageId,
    lane: input.lane,
    senderRole: getOptimisticSenderRole(audience),
    senderLabel: getOptimisticSenderLabel(audience),
    body: input.body?.trim() ?? '',
    attachments: buildOptimisticAttachments(input, clientMessageId),
    visibility: input.visibility,
    deliveryStatus: 'sent',
    createdAt: timestamp,
  };
  const messages = [...conversation.messages.filter((message) => message.id !== clientMessageId), optimisticMessage];
  const summary = getOptimisticSummary(input);
  const currentLaneCounts = {
    customer: conversation.laneCounts?.customer ?? 0,
    internal: conversation.laneCounts?.internal ?? 0,
  };

  return {
    ...conversation,
    latestMessageLane: input.lane,
    preferredLane: input.lane,
    summary: summary || conversation.summary,
    messages,
    laneCounts: {
      ...currentLaneCounts,
      [input.lane]: Math.max(conversation.laneCounts?.[input.lane] ?? 0, messages.filter((message) => message.lane === input.lane).length),
    },
  };
}

function updateOptimisticMessageStatus(
  conversation: MobileConversation | null | undefined,
  clientMessageId: string,
  deliveryStatus: NonNullable<MobileConversationMessage['deliveryStatus']>,
  deliveryError?: string,
): MobileConversation | null | undefined {
  if (!conversation) {
    return conversation;
  }

  let changed = false;
  const messages = conversation.messages.map((message) => {
    if (message.id !== clientMessageId) {
      return message;
    }
    changed = true;
    return {
      ...message,
      deliveryStatus,
      deliveryError,
    };
  });

  return changed ? { ...conversation, messages } : conversation;
}

async function flushChatOutbox(
  audience: MobileInboxAudience,
  token: string | null,
  queryClient: ReturnType<typeof useQueryClient>,
) {
  if (!token) {
    return;
  }

  const existing = outboxFlushes.get(audience);
  if (existing) {
    return existing;
  }

  const task = (async () => {
    const pendingMessages = await listPendingChatMessages(audience);
    for (const pending of pendingMessages) {
      if (pending.attempts >= CHAT_OUTBOX_MAX_ATTEMPTS) {
        continue;
      }

      try {
        const response = await apiRequest<{ ok: boolean; conversation: MobileConversation | null }>(
          `/conversations/${pending.conversationId}/messages`,
          {
            method: 'POST',
            token,
        body: {
          lane: pending.lane,
          body: pending.body ?? '',
          attachments: pending.attachments ?? [],
          visibility: pending.visibility,
          clientMessageId: pending.clientMessageId,
        },
          },
        );
        await removePendingChatMessage(pending.id);
        setConversationCaches(queryClient, audience, response.conversation);
      } catch (error) {
        await markPendingChatMessageAttempt(pending.id, error);
        queryClient.setQueryData<MobileConversationDetailResponse | undefined>(
          queryKeys.chatThread(pending.conversationId, audience),
          (current) => ({
            ok: current?.ok ?? true,
            conversation: updateOptimisticMessageStatus(
              current?.conversation ?? null,
              pending.clientMessageId,
              'failed',
              error instanceof Error ? error.message : 'Message is queued for retry',
            ) ?? null,
          }),
        );

        const shouldStop = isNetworkError(error) || (error instanceof ApiError && [401, 403, 408, 429].includes(error.status));
        if (shouldStop) {
          break;
        }
      }
    }
  })();

  outboxFlushes.set(audience, task);
  try {
    await task;
  } finally {
    outboxFlushes.delete(audience);
  }
}

export function resolveAudienceForRole(role?: string | null): MobileInboxAudience {
  if (role === 'MANAGER') {
    return 'manager';
  }

  if (role === 'FREELANCER') {
    return 'freelancer';
  }

  return 'admin';
}

export function useChats(audience: MobileInboxAudience, options: UseChatsOptions = {}) {
  const tokenQuery = useStoredToken();
  const token = tokenQuery.data ?? null;
  const queryClient = useQueryClient();
  const lastActiveRefetchRef = useRef(0);
  const lastFocusRefetchRef = useRef(0);
  const isAppActive = useIsAppActive();
  const liveSync = options.liveSync ?? true;
  const includeSupportData = options.includeSupportData ?? false;
  const isFocused = options.isFocused ?? true;
  const enabled = options.enabled ?? true;

  const query = useQuery({
    queryKey: queryKeys.chats(audience, includeSupportData),
    enabled: Boolean(token) && enabled,
    staleTime: CHAT_LIST_STALE_MS,
    gcTime: 24 * 60 * 60_000,
    refetchOnMount: 'always',
    refetchOnReconnect: true,
    refetchInterval: liveSync && isAppActive && isFocused ? CHAT_LIST_LIVE_SYNC_MS : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    queryFn: () => fetchChatList({ audience, token, includeSupportData }),
  });

  const refetch = query.refetch;

  useEffect(() => {
    if (!token || !isAppActive || !liveSync || !isFocused) {
      return;
    }

    const lastRefetchAt = Math.max(query.dataUpdatedAt, lastFocusRefetchRef.current);
    if (Date.now() - lastRefetchAt <= CHAT_FOCUS_REFETCH_MIN_MS) {
      return;
    }

    lastFocusRefetchRef.current = Date.now();
    void refetch();
  }, [isAppActive, isFocused, liveSync, query.dataUpdatedAt, refetch, token]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (
        state === 'active' &&
        token &&
        liveSync &&
        isFocused &&
        Date.now() - Math.max(query.dataUpdatedAt, lastActiveRefetchRef.current) > CHAT_LIST_STALE_MS
      ) {
        lastActiveRefetchRef.current = Date.now();
        void refetch();
      }
    });

    return () => subscription.remove();
  }, [isFocused, liveSync, query.dataUpdatedAt, refetch, token]);

  useEffect(() => {
    if (!token || !isAppActive || !liveSync || !isFocused) {
      return undefined;
    }

    void flushChatOutbox(audience, token, queryClient);
    const timer = setInterval(() => {
      void flushChatOutbox(audience, token, queryClient);
    }, CHAT_OUTBOX_FLUSH_MS);

    return () => clearInterval(timer);
  }, [audience, isAppActive, isFocused, liveSync, queryClient, token]);

  return query;
}

export function useChatThread(
  conversationId: string | undefined,
  audience: MobileInboxAudience,
  options: { isFocused?: boolean; includeSupportData?: boolean } = {},
) {
  const queryClient = useQueryClient();
  const tokenQuery = useStoredToken();
  const token = tokenQuery.data ?? null;
  const isAppActive = useIsAppActive();
  const isFocused = options.isFocused ?? true;
  const lastFocusRefetchRef = useRef(0);
  const supportQuery = useChats(audience, { liveSync: false, includeSupportData: options.includeSupportData ?? false, isFocused });
  const cachedConversation = supportQuery.data?.conversations.find((item) => item.id === conversationId) ?? null;
  const query = useQuery({
    queryKey: conversationId ? queryKeys.chatThread(conversationId, audience) : ['chat-thread', 'missing', audience],
    enabled: Boolean(token && conversationId),
    staleTime: CHAT_THREAD_STALE_MS,
    gcTime: 24 * 60 * 60_000,
    refetchOnMount: 'always',
    refetchOnReconnect: true,
    refetchInterval: isAppActive && isFocused && token && conversationId ? CHAT_THREAD_LIVE_SYNC_MS : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    initialData: () => {
      if (!conversationId) return undefined;
      const cached = queryClient.getQueryData<MobileConversationDetailResponse>(queryKeys.chatThread(conversationId, audience));
      if (cached?.conversation && cached.conversation.messages && cached.conversation.messages.length > 3) {
        return cached;
      }
      return undefined;
    },
    queryFn: () =>
      fetchConversationDetail({
        audience,
        conversationId: conversationId ?? '',
        token,
      }),
  });
  const conversation = query.data?.conversation ?? cachedConversation;
  const refetch = query.refetch;

  useEffect(() => {
    if (!token || !conversationId || !isAppActive || !isFocused) {
      return;
    }

    const lastRefetchAt = Math.max(query.dataUpdatedAt, lastFocusRefetchRef.current);
    if (Date.now() - lastRefetchAt <= CHAT_FOCUS_REFETCH_MIN_MS) {
      return;
    }

    lastFocusRefetchRef.current = Date.now();
    void refetch();
  }, [conversationId, isAppActive, isFocused, query.dataUpdatedAt, refetch, token]);

  return {
    ...query,
    data: conversation,
    conversation,
    conversations: supportQuery.data?.conversations ?? [],
    assignableEditors: supportQuery.data?.assignableEditors ?? [],
    leadStatuses: supportQuery.data?.leadStatuses ?? [],
    templates: supportQuery.data?.templates ?? [],
  };
}

export function useSendMessage(audience: MobileInboxAudience) {
  const queryClient = useQueryClient();
  const tokenQuery = useStoredToken();

  return useMutation({
    retry: false,
    mutationFn: async (input: SendMessageInput) => {
      const resolvedClientMessageId = input.clientMessageId?.trim() || pendingClientIds.get(input) || '';
      const response = await apiRequest<{ ok: boolean; conversation: MobileConversation | null }>(`/conversations/${input.conversationId}/messages`, {
        method: 'POST',
        token: tokenQuery.data ?? null,
        body: {
          lane: input.lane,
          body: input.body ?? '',
          attachments: input.attachments ?? [],
          visibility: input.visibility,
          clientMessageId: resolvedClientMessageId || undefined,
        },
      });
      const clientMessageId = resolvedClientMessageId;
      if (clientMessageId) {
        await removePendingChatMessage(clientMessageId);
      }
      return response;
    },
    onMutate: async (input) => {
      const threadKey = queryKeys.chatThread(input.conversationId, audience);
      const chatsKey = queryKeys.chats(audience);
      const mutableInput = input as SendMessageInput;
      const clientMessageId = mutableInput.clientMessageId?.trim() || `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      mutableInput.clientMessageId = clientMessageId;
      pendingClientIds.set(input, clientMessageId);

      await Promise.all([
        queryClient.cancelQueries({ queryKey: threadKey }),
        queryClient.cancelQueries({ queryKey: chatsKey }),
      ]);

      const previousThread = queryClient.getQueryData<MobileConversationDetailResponse | undefined>(threadKey);
      const previousChats = queryClient.getQueryData<MobileConversationsResponse | undefined>(chatsKey);
      const baseConversation =
        previousThread?.conversation ?? previousChats?.conversations.find((conversation) => conversation.id === input.conversationId);
      const optimisticConversation = addOptimisticMessage(
        baseConversation,
        input,
        audience,
        clientMessageId,
      );

      await enqueuePendingChatMessage({
        id: clientMessageId,
        audience,
        clientMessageId,
        conversationId: input.conversationId,
        lane: input.lane,
        body: input.body,
        attachments: input.attachments,
        visibility: input.visibility,
      });

      if (optimisticConversation) {
        setConversationCaches(queryClient, audience, optimisticConversation);
      }

      return {
        chatsKey,
        hadPreviousChats: previousChats !== undefined,
        hadPreviousThread: previousThread !== undefined,
        previousChats,
        previousThread,
        threadKey,
      };
    },
    onError: (error, input, context) => {
      const clientMessageId = pendingClientIds.get(input);
      if (clientMessageId && isNetworkError(error)) {
        void markPendingChatMessageAttempt(clientMessageId, error);
        queryClient.setQueryData<MobileConversationDetailResponse | undefined>(queryKeys.chatThread(input.conversationId, audience), (current) => ({
          ok: current?.ok ?? true,
          conversation: updateOptimisticMessageStatus(
            current?.conversation ?? null,
            clientMessageId,
            'failed',
            'Queued. Will retry when the connection is stable.',
          ) ?? null,
        }));
        return;
      }

      if (clientMessageId) {
        void removePendingChatMessage(clientMessageId);
      }

      if (context?.hadPreviousThread) {
        queryClient.setQueryData(context.threadKey, context.previousThread);
      } else if (context?.threadKey) {
        queryClient.removeQueries({ exact: true, queryKey: context.threadKey });
      }

      if (context?.hadPreviousChats) {
        queryClient.setQueryData(context.chatsKey, context.previousChats);
      } else if (context?.chatsKey) {
        queryClient.removeQueries({ exact: true, queryKey: context.chatsKey });
      }
    },
    onSuccess: (response) => {
      setConversationCaches(queryClient, audience, response.conversation);
    },
  });
}

export function useDeleteMessage(audience: MobileInboxAudience) {
  const queryClient = useQueryClient();
  const tokenQuery = useStoredToken();

  return useMutation({
    mutationFn: async (input: DeleteMessageInput) => {
      return apiRequest<{
        ok: boolean;
        conversation: MobileConversation | null;
        deletedMessageId: string;
        meta?: { deleteSupported?: boolean; deleteSynced?: boolean; note?: string | null };
      }>(`/conversations/${encodeURIComponent(input.conversationId)}/messages`, {
        method: 'POST',
        token: tokenQuery.data ?? null,
        body: {
          action: 'delete-message',
          messageId: input.messageId,
          scope: input.scope ?? 'everyone',
        },
      });
    },
    onSuccess: (response) => {
      setConversationCaches(queryClient, audience, response.conversation);
    },
  });
}

export function useAssignConversation(audience: MobileInboxAudience) {
  const queryClient = useQueryClient();
  const tokenQuery = useStoredToken();

  return useMutation({
    mutationFn: (input: AssignConversationInput) =>
      apiRequest<{ ok: boolean; conversation: MobileConversation | null }>(`/conversations/${input.conversationId}/assignment`, {
        method: 'POST',
        token: tokenQuery.data ?? null,
        body: {
          freelancerId: input.freelancerId ?? input.freelancerIds?.[0],
          freelancerIds: input.freelancerIds ?? (input.freelancerId ? [input.freelancerId] : []),
          assignmentMode: input.assignmentMode ?? 'direct',
          projectDetails: input.projectDetails,
        },
      }),
    onSuccess: (response) => {
      setConversationCaches(queryClient, audience, response.conversation);
    },
  });
}

export function useRespondConversationAssignment(audience: MobileInboxAudience) {
  const queryClient = useQueryClient();
  const tokenQuery = useStoredToken();

  return useMutation({
    mutationFn: (input: AssignmentResponseInput) =>
      apiRequest<{ ok: boolean; conversation: MobileConversation | null }>(`/conversations/${input.conversationId}/assignment/respond`, {
        method: 'POST',
        token: tokenQuery.data ?? null,
        body: {
          action: input.action,
          rejectionReason: input.rejectionReason,
        },
      }),
    onSuccess: (response) => {
      setConversationCaches(queryClient, audience, response.conversation);
    },
  });
}

export function useSetConversationLeadStatus(audience: MobileInboxAudience) {
  const queryClient = useQueryClient();
  const tokenQuery = useStoredToken();

  return useMutation({
    mutationFn: (input: LeadStatusInput) =>
      apiRequest<{ ok: boolean; conversation: MobileConversation | null }>(`/conversations/${input.conversationId}/lead-status`, {
        method: 'POST',
        token: tokenQuery.data ?? null,
        body: {
          leadStatusId: input.leadStatusId,
        },
      }),
    onMutate: async (input: LeadStatusInput) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.chatThread(input.conversationId, audience) });
      const previous = queryClient.getQueryData<MobileConversationDetailResponse>(queryKeys.chatThread(input.conversationId, audience));
      if (previous?.conversation) {
        queryClient.setQueryData<MobileConversationDetailResponse>(queryKeys.chatThread(input.conversationId, audience), {
          ...previous,
          conversation: {
            ...previous.conversation,
            leadStatusId: input.leadStatusId,
          },
        });
      }
      return { previous };
    },
    onError: (_err: unknown, input: LeadStatusInput, context: { previous?: MobileConversationDetailResponse } | undefined) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.chatThread(input.conversationId, audience), context.previous);
      }
    },
    onSuccess: (response) => {
      setConversationCaches(queryClient, audience, response.conversation);
    },
  });
}

export function useToggleFreelancerCustomerLaneAccess(audience: MobileInboxAudience) {
  const queryClient = useQueryClient();
  const tokenQuery = useStoredToken();

  return useMutation({
    mutationFn: (input: CustomerLaneAccessInput) =>
      apiRequest<{ ok: boolean; conversation: MobileConversation | null }>(
        `/conversations/${input.conversationId}/freelancer-customer-access`,
        {
          method: 'POST',
          token: tokenQuery.data ?? null,
          body: {
            enabled: input.enabled,
          },
        },
      ),
    onMutate: async (input: CustomerLaneAccessInput) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.chatThread(input.conversationId, audience) });
      const previous = queryClient.getQueryData<MobileConversationDetailResponse>(queryKeys.chatThread(input.conversationId, audience));
      if (previous?.conversation) {
        const prevPerm = previous.conversation.freelancerCustomerLanePermission;
        queryClient.setQueryData<MobileConversationDetailResponse>(queryKeys.chatThread(input.conversationId, audience), {
          ...previous,
          conversation: {
            ...previous.conversation,
            freelancerCustomerLanePermission: {
              transportState: prevPerm?.transportState ?? 'ready',
              transportNote: prevPerm?.transportNote ?? '',
              ...prevPerm,
              enabled: input.enabled,
              grantedAt: new Date().toISOString(),
              grantedByRole: audience === 'manager' ? 'manager' : 'admin',
            },
          },
        });
      }
      return { previous };
    },
    onError: (_err: unknown, input: CustomerLaneAccessInput, context: { previous?: MobileConversationDetailResponse } | undefined) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.chatThread(input.conversationId, audience), context.previous);
      }
    },
    onSuccess: (response) => {
      setConversationCaches(queryClient, audience, response.conversation);
    },
  });
}

export function useCreatePaymentRequest(audience: MobileInboxAudience) {
  const queryClient = useQueryClient();
  const tokenQuery = useStoredToken();

  return useMutation({
    mutationFn: (input: CreatePaymentRequestInput) =>
      apiRequest<{ ok: boolean; conversation: MobileConversation | null; paymentRequest?: unknown }>(
        `/conversations/${input.conversationId}/payment-request`,
        {
          method: 'POST',
          token: tokenQuery.data ?? null,
          body: {
            lane: input.lane,
            amount: input.amount,
            title: input.title,
            note: input.note ?? '',
            dueLabel: input.dueLabel,
            assignmentId: input.assignmentId,
            projectId: input.projectId,
            projectTitle: input.projectTitle,
            payerRole: input.payerRole,
            payeeRole: input.payeeRole,
          },
        },
      ),
    onSuccess: (response) => {
      setConversationCaches(queryClient, audience, response.conversation);
    },
  });
}

export function useUpdateTypingState() {
  const tokenQuery = useStoredToken();

  return useMutation({
    mutationFn: (input: TypingInput) =>
      apiRequest<{ ok: boolean }>(`/conversations/${input.conversationId}/typing`, {
        method: 'POST',
        token: tokenQuery.data ?? null,
        body: {
          lane: input.lane,
          active: input.active,
        },
      }),
  });
}

export function useMarkConversationRead(audience: MobileInboxAudience) {
  const queryClient = useQueryClient();
  const tokenQuery = useStoredToken();

  return useMutation({
    mutationFn: (input: MarkReadInput | string) => {
      const normalized = typeof input === 'string' ? { conversationId: input } : input;
      return apiRequest<{ ok: boolean; conversation: MobileConversation | null }>(`/conversations/${normalized.conversationId}/read`, {
        method: 'POST',
        token: tokenQuery.data ?? null,
        body: { audience, lane: normalized.lane },
      });
    },
    onSuccess: (response, input) => {
      if (!response.conversation) {
        const normalized = typeof input === 'string' ? { conversationId: input } : input;
        removeConversationFromListCaches(queryClient, audience, normalized.conversationId);
        return;
      }
      setConversationCaches(queryClient, audience, response.conversation);
    },
  });
}

export function useUpdateClientAlias(audience: MobileInboxAudience) {
  const queryClient = useQueryClient();
  const tokenQuery = useStoredToken();

  return useMutation({
    mutationFn: (input: ClientAliasInput) =>
      apiRequest<{ ok: boolean; conversation: MobileConversation | null }>(`/conversations/${input.conversationId}/client-alias`, {
        method: 'POST',
        token: tokenQuery.data ?? null,
        body: {
          alias: input.alias,
        },
      }),
    onSuccess: (response) => {
      setConversationCaches(queryClient, audience, response.conversation);
    },
  });
}

export function useMarkPaymentStatus(audience: MobileInboxAudience) {
  const queryClient = useQueryClient();
  const tokenQuery = useStoredToken();

  return useMutation({
    mutationFn: (input: MarkPaymentInput) =>
      apiRequest<{ ok: boolean; conversation: MobileConversation | null }>(`/conversations/${input.conversationId}/payment-request`, {
        method: 'POST',
        token: tokenQuery.data ?? null,
        body: {
          action: 'mark-status',
          paymentRequestId: input.paymentRequestId,
          status: input.status,
        },
      }),
    onSuccess: (response) => {
      setConversationCaches(queryClient, audience, response.conversation);
    },
  });
}
