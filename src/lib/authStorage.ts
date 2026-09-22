import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const AUTH_TOKEN_KEY = 'gigxomi.authToken';
let memoryToken: string | null = null;

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

export async function saveToken(token: string) {
  const SecureStore = await getAvailableSecureStore();
  if (SecureStore) {
    try {
      await SecureStore.setItemAsync(AUTH_TOKEN_KEY, token);
      return;
    } catch {
      // Fall through to non-native storage for web previews and unsupported runtimes.
    }
  }

  const storage = getBrowserStorage();
  if (storage) {
    storage.setItem(AUTH_TOKEN_KEY, token);
  } else {
    memoryToken = token;
  }
}

export async function getToken() {
  const SecureStore = await getAvailableSecureStore();
  if (SecureStore) {
    try {
      const token = SecureStore.getItem(AUTH_TOKEN_KEY);
      if (token) {
        return token;
      }
    } catch {
      // Fall through to non-native storage for web previews and unsupported runtimes.
    }
  }

  const storage = getBrowserStorage();
  return storage?.getItem(AUTH_TOKEN_KEY) ?? memoryToken;
}

export async function deleteToken() {
  const SecureStore = await getAvailableSecureStore();
  if (SecureStore) {
    try {
      await SecureStore.deleteItemAsync(AUTH_TOKEN_KEY);
    } catch {
      // Fall through and clear the fallback stores too.
    }
  }

  const storage = getBrowserStorage();
  storage?.removeItem(AUTH_TOKEN_KEY);
  memoryToken = null;
}
