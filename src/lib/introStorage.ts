import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const INTRO_COMPLETED_KEY = 'gigxomi.intro.completed';
let memoryIntroCompleted = false;

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

export async function getIntroCompleted() {
  const SecureStore = await getAvailableSecureStore();
  if (SecureStore) {
    try {
      return SecureStore.getItem(INTRO_COMPLETED_KEY) === '1';
    } catch {
      // Fall through to browser/memory storage for web previews and unsupported runtimes.
    }
  }

  const storage = getBrowserStorage();
  return (storage?.getItem(INTRO_COMPLETED_KEY) ?? (memoryIntroCompleted ? '1' : '0')) === '1';
}

export async function saveIntroCompleted(completed = true) {
  const value = completed ? '1' : '0';
  const SecureStore = await getAvailableSecureStore();
  if (SecureStore) {
    try {
      await SecureStore.setItemAsync(INTRO_COMPLETED_KEY, value);
      return;
    } catch {
      // Fall through to browser/memory storage for web previews and unsupported runtimes.
    }
  }

  const storage = getBrowserStorage();
  if (storage) {
    storage.setItem(INTRO_COMPLETED_KEY, value);
  } else {
    memoryIntroCompleted = completed;
  }
}

export async function clearIntroCompleted() {
  const SecureStore = await getAvailableSecureStore();
  if (SecureStore) {
    try {
      await SecureStore.deleteItemAsync(INTRO_COMPLETED_KEY);
    } catch {
      // Fall through and clear fallback storage too.
    }
  }

  getBrowserStorage()?.removeItem(INTRO_COMPLETED_KEY);
  memoryIntroCompleted = false;
}
