import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import type { MobileSession } from '@/src/types';
import { resetAccountBoundary, setAccountCacheScope } from './account-boundary';

const SESSION_KEY = 'gigxomi.mobile.session.v1';
const LEGACY_SESSION_KEYS = ['gigxomi.mobileSession'];
let memorySession: MobileSession | null = null;

function getBrowserStorage() {
  try {
    return typeof globalThis.localStorage === 'undefined' ? null : globalThis.localStorage;
  } catch {
    return null;
  }
}

function getAvailableSecureStore() {
  if (Platform.OS === 'web') {
    return null;
  }

  try {
    return SecureStore;
  } catch {
    return null;
  }
}

function parseSession(value: string | null) {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as MobileSession;
    if (!parsed?.userId || !parsed.role || !parsed.expiresAt) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function saveSession(session: MobileSession) {
  memorySession = session;
  setAccountCacheScope(session);
  const serialized = JSON.stringify(session);
  const SecureStore = await getAvailableSecureStore();
  if (SecureStore) {
    try {
      await SecureStore.setItemAsync(SESSION_KEY, serialized);
      return;
    } catch {
      // Fall through to non-native storage for web previews and unsupported runtimes.
    }
  }

  const storage = getBrowserStorage();
  if (storage) {
    storage.setItem(SESSION_KEY, serialized);
  }
}

export async function getSession() {
  const SecureStore = await getAvailableSecureStore();
  if (SecureStore) {
    try {
      const session = parseSession(SecureStore.getItem(SESSION_KEY));
      if (session) {
        memorySession = session;
  setAccountCacheScope(session);
        return session;
      }

      for (const key of LEGACY_SESSION_KEYS) {
        const legacySession = parseSession(SecureStore.getItem(key));
        if (legacySession) {
          memorySession = legacySession;
          setAccountCacheScope(legacySession);
          await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(legacySession));
          await SecureStore.deleteItemAsync(key).catch(() => undefined);
          return legacySession;
        }
      }
    } catch {
      // Fall through to non-native storage for web previews and unsupported runtimes.
    }
  }

  const storage = getBrowserStorage();
  const stored = parseSession(storage?.getItem(SESSION_KEY) ?? null);
  if (stored) {
    memorySession = stored;
    setAccountCacheScope(stored);
    return stored;
  }

  for (const key of LEGACY_SESSION_KEYS) {
    const legacySession = parseSession(storage?.getItem(key) ?? null);
    if (legacySession) {
      storage?.setItem(SESSION_KEY, JSON.stringify(legacySession));
      storage?.removeItem(key);
      memorySession = legacySession;
          setAccountCacheScope(legacySession);
      return legacySession;
    }
  }

  memorySession = stored ?? memorySession;
  return memorySession;
}

export async function deleteSession() {
  resetAccountBoundary();
  const SecureStore = await getAvailableSecureStore();
  if (SecureStore) {
    try {
      await SecureStore.deleteItemAsync(SESSION_KEY);
      for (const key of LEGACY_SESSION_KEYS) {
        await SecureStore.deleteItemAsync(key).catch(() => undefined);
      }
    } catch {
      // Fall through and clear the fallback stores too.
    }
  }

  const storage = getBrowserStorage();
  storage?.removeItem(SESSION_KEY);
  for (const key of LEGACY_SESSION_KEYS) {
    storage?.removeItem(key);
  }
  memorySession = null;
}
