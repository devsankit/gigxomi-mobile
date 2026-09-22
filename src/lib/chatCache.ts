import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { getAccountCacheScope } from './account-boundary';

import type { MobileConversation, MobileConversationsResponse, MobileInboxAudience } from '@/src/types';

type CachedValue<T> = {
  data: T;
  savedAt: string;
  version: 1;
};

const CACHE_PREFIX = 'gigxomi.chat.';
const CACHE_DIRECTORY = `${FileSystem.documentDirectory ?? FileSystem.cacheDirectory ?? ''}gigxomi-chat-cache/`;

function getBrowserStorage() {
  try {
    return typeof globalThis.localStorage === 'undefined' ? null : globalThis.localStorage;
  } catch {
    return null;
  }
}

function cacheKey(value: string) {
  return `${CACHE_PREFIX}${value}`;
}

function cacheFilePath(value: string) {
  return `${CACHE_DIRECTORY}${encodeURIComponent(value)}.json`;
}

async function ensureCacheDirectory() {
  if (!CACHE_DIRECTORY) {
    return;
  }

  try {
    await FileSystem.makeDirectoryAsync(CACHE_DIRECTORY, { intermediates: true });
  } catch {
    // Directory creation is best-effort; reads will simply miss if unavailable.
  }
}

async function readCachedValue<T>(key: string) {
  const owner = getAccountCacheScope();
  if (!owner) return null;
  key = `account.v2.${owner}.${key}`;
  if (Platform.OS === 'web') {
    const raw = getBrowserStorage()?.getItem(cacheKey(key)) ?? null;
    return owner === getAccountCacheScope() ? parseCachedValue<T>(raw) : null;
  }

  if (!CACHE_DIRECTORY) {
    return null;
  }

  try {
    const raw = await FileSystem.readAsStringAsync(cacheFilePath(key));
    return owner === getAccountCacheScope() ? parseCachedValue<T>(raw) : null;
  } catch {
    return null;
  }
}

function parseCachedValue<T>(raw: string | null) {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as CachedValue<T>;
    return parsed?.data ?? null;
  } catch {
    return null;
  }
}

async function writeCachedValue<T>(key: string, data: T) {
  const owner = getAccountCacheScope();
  if (!owner) return;
  key = `account.v2.${owner}.${key}`;
  const payload: CachedValue<T> = {
    data,
    savedAt: new Date().toISOString(),
    version: 1,
  };
  const serialized = JSON.stringify(payload);

  if (Platform.OS === 'web') {
    getBrowserStorage()?.setItem(cacheKey(key), serialized);
    return;
  }

  if (!CACHE_DIRECTORY) {
    return;
  }

  await ensureCacheDirectory();
  await FileSystem.writeAsStringAsync(cacheFilePath(key), serialized);
}

export function getChatListCacheKey(audience: MobileInboxAudience) {
  return `list.${audience}`;
}

export function getChatThreadCacheKey(conversationId: string, audience: MobileInboxAudience) {
  return `thread.${audience}.${conversationId}`;
}

export async function readCachedChatList(audience: MobileInboxAudience) {
  return readCachedValue<MobileConversationsResponse>(getChatListCacheKey(audience));
}

export async function writeCachedChatList(audience: MobileInboxAudience, response: MobileConversationsResponse) {
  await writeCachedValue(getChatListCacheKey(audience), response);
}

export async function readCachedChatThread(conversationId: string, audience: MobileInboxAudience) {
  return readCachedValue<{ ok: boolean; conversation: MobileConversation | null }>(getChatThreadCacheKey(conversationId, audience));
}

export async function writeCachedChatThread(conversationId: string, audience: MobileInboxAudience, conversation: MobileConversation | null) {
  await writeCachedValue(getChatThreadCacheKey(conversationId, audience), { ok: true, conversation });
}
