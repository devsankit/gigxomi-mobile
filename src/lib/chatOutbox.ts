import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { getAccountCacheScope } from './account-boundary';

import type { MobileConversationLane, MobileInboxAudience } from '@/src/types';

type PendingAttachment = {
  name: string;
  mimeType?: string;
  sizeBytes?: number;
  uploadTarget?: 'local' | 'youtube';
  durationSeconds?: number;
  note?: string;
  externalUrl?: string;
};

export type PendingChatMessage = {
  id: string;
  audience: MobileInboxAudience;
  clientMessageId: string;
  conversationId: string;
  lane: MobileConversationLane;
  body?: string;
  visibility?: 'client_private';
  attachments?: PendingAttachment[];
  attempts: number;
  createdAt: string;
  lastAttemptAt?: string;
  lastError?: string;
};

type OutboxPayload = {
  version: 1;
  messages: PendingChatMessage[];
};

const OUTBOX_KEY = 'gigxomi.chat.outbox';
const OUTBOX_PATH = `${FileSystem.documentDirectory ?? FileSystem.cacheDirectory ?? ''}${OUTBOX_KEY}.json`;

let queue = Promise.resolve();

function getBrowserStorage() {
  try {
    return typeof globalThis.localStorage === 'undefined' ? null : globalThis.localStorage;
  } catch {
    return null;
  }
}

function parsePayload(raw: string | null): OutboxPayload {
  if (!raw) {
    return { version: 1, messages: [] };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<OutboxPayload>;
    return {
      version: 1,
      messages: Array.isArray(parsed.messages) ? parsed.messages : [],
    };
  } catch {
    return { version: 1, messages: [] };
  }
}

async function readPayload(owner = getAccountCacheScope()) {
  if (!owner) return { version: 1, messages: [] } satisfies OutboxPayload;
  const key = `${OUTBOX_KEY}.account.v2.${owner}`;
  const file = `${OUTBOX_PATH}.account.v2.${encodeURIComponent(owner)}`;
  if (Platform.OS === 'web') {
    return parsePayload(getBrowserStorage()?.getItem(key) ?? null);
  }

  if (!OUTBOX_PATH) {
    return { version: 1, messages: [] } satisfies OutboxPayload;
  }

  try {
    const raw = await FileSystem.readAsStringAsync(file);
    return owner === getAccountCacheScope() ? parsePayload(raw) : { version: 1, messages: [] } satisfies OutboxPayload;
  } catch {
    return { version: 1, messages: [] } satisfies OutboxPayload;
  }
}

async function writePayload(payload: OutboxPayload, owner: string) {
  if (owner !== getAccountCacheScope()) throw new Error('Account changed; pending message was not modified.');
  const key = `${OUTBOX_KEY}.account.v2.${owner}`;
  const file = `${OUTBOX_PATH}.account.v2.${encodeURIComponent(owner)}`;
  const serialized = JSON.stringify(payload);

  if (Platform.OS === 'web') {
    getBrowserStorage()?.setItem(key, serialized);
    return;
  }

  if (!OUTBOX_PATH) {
    return;
  }

  await FileSystem.writeAsStringAsync(file, serialized);
}

async function updateOutbox<T>(callback: (payload: OutboxPayload) => T | Promise<T>) {
  const owner = getAccountCacheScope();
  const task = queue.then(async () => {
    if (!owner || owner !== getAccountCacheScope()) throw new Error('Sign in to the original account to send this message.');
    const payload = await readPayload(owner);
    const result = await callback(payload);
    await writePayload({
      version: 1,
      messages: payload.messages,
    }, owner);
    return result;
  });

  queue = task.then(
    () => undefined,
    () => undefined,
  );

  return task;
}

export async function enqueuePendingChatMessage(message: Omit<PendingChatMessage, 'attempts' | 'createdAt'>) {
  return updateOutbox((payload) => {
    const pending: PendingChatMessage = {
      ...message,
      attempts: 0,
      createdAt: new Date().toISOString(),
    };
    payload.messages = [...payload.messages.filter((item) => item.id !== pending.id), pending];
    return pending;
  });
}

export async function listPendingChatMessages(audience?: MobileInboxAudience) {
  const payload = await readPayload();
  return payload.messages
    .filter((message) => !audience || message.audience === audience)
    .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());
}

export async function removePendingChatMessage(id: string) {
  await updateOutbox((payload) => {
    payload.messages = payload.messages.filter((message) => message.id !== id);
  });
}

export async function markPendingChatMessageAttempt(id: string, error?: unknown) {
  await updateOutbox((payload) => {
    payload.messages = payload.messages.map((message) =>
      message.id === id
        ? {
            ...message,
            attempts: message.attempts + 1,
            lastAttemptAt: new Date().toISOString(),
            lastError: error instanceof Error ? error.message : 'Message send failed',
          }
        : message,
    );
  });
}
