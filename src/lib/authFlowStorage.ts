import { Platform } from 'react-native';

export type SavedLoginFlow = {
  phone: string;
  challengeId?: string | null;
  intentId?: string | null;
  whatsappHref: string | null;
  stage: 'phone' | 'otp';
  otpMessage?: string;
  savedAt: number;
};

export type SavedRegisterFlow = {
  audience: 'FREELANCER' | 'AGENCY';
  firstName: string;
  lastName: string;
  phone: string;
  packageId: string;
  challengeId: string;
  intentId: string;
  stage: 'form' | 'otp';
  whatsappHref: string | null;
  notice?: string;
  savedAt: number;
};

const LOGIN_FLOW_KEY = 'gigxomi.active.login.flow';
const REGISTER_FLOW_KEY = 'gigxomi.active.register.flow';
const FLOW_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

let memoryLoginFlow: SavedLoginFlow | null = null;
let memoryRegisterFlow: SavedRegisterFlow | null = null;

type SecureStoreModule = typeof import('expo-secure-store');

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

export async function saveLoginFlow(flow: Omit<SavedLoginFlow, 'savedAt'>) {
  await clearRegisterFlow();
  const fullFlow: SavedLoginFlow = { ...flow, savedAt: Date.now() };
  memoryLoginFlow = fullFlow;
  const serialized = JSON.stringify(fullFlow);

  const SecureStore = await getAvailableSecureStore();
  if (SecureStore) {
    try {
      await SecureStore.setItemAsync(LOGIN_FLOW_KEY, serialized);
      return;
    } catch {}
  }

  const storage = getBrowserStorage();
  storage?.setItem(LOGIN_FLOW_KEY, serialized);
}

export async function getSavedLoginFlow(): Promise<SavedLoginFlow | null> {
  let raw: string | null = null;

  const SecureStore = await getAvailableSecureStore();
  if (SecureStore) {
    try {
      raw = await SecureStore.getItemAsync(LOGIN_FLOW_KEY);
    } catch {}
  }

  if (!raw) {
    const storage = getBrowserStorage();
    raw = storage?.getItem(LOGIN_FLOW_KEY) ?? null;
  }

  if (!raw) {
    return memoryLoginFlow && Date.now() - memoryLoginFlow.savedAt < FLOW_EXPIRY_MS ? memoryLoginFlow : null;
  }

  try {
    const parsed = JSON.parse(raw) as SavedLoginFlow;
    if (parsed && parsed.stage === 'otp' && Date.now() - parsed.savedAt < FLOW_EXPIRY_MS) {
      memoryLoginFlow = parsed;
      return parsed;
    }
    await clearLoginFlow();
    return null;
  } catch {
    return null;
  }
}

export async function clearLoginFlow() {
  memoryLoginFlow = null;
  const SecureStore = await getAvailableSecureStore();
  if (SecureStore) {
    try {
      await SecureStore.deleteItemAsync(LOGIN_FLOW_KEY);
    } catch {}
  }
  const storage = getBrowserStorage();
  storage?.removeItem(LOGIN_FLOW_KEY);
}

export async function saveRegisterFlow(flow: Omit<SavedRegisterFlow, 'savedAt'>) {
  await clearLoginFlow();
  const fullFlow: SavedRegisterFlow = { ...flow, savedAt: Date.now() };
  memoryRegisterFlow = fullFlow;
  const serialized = JSON.stringify(fullFlow);

  const SecureStore = await getAvailableSecureStore();
  if (SecureStore) {
    try {
      await SecureStore.setItemAsync(REGISTER_FLOW_KEY, serialized);
      return;
    } catch {}
  }

  const storage = getBrowserStorage();
  storage?.setItem(REGISTER_FLOW_KEY, serialized);
}

export async function getSavedRegisterFlow(): Promise<SavedRegisterFlow | null> {
  let raw: string | null = null;

  const SecureStore = await getAvailableSecureStore();
  if (SecureStore) {
    try {
      raw = await SecureStore.getItemAsync(REGISTER_FLOW_KEY);
    } catch {}
  }

  if (!raw) {
    const storage = getBrowserStorage();
    raw = storage?.getItem(REGISTER_FLOW_KEY) ?? null;
  }

  if (!raw) {
    return memoryRegisterFlow && Date.now() - memoryRegisterFlow.savedAt < FLOW_EXPIRY_MS ? memoryRegisterFlow : null;
  }

  try {
    const parsed = JSON.parse(raw) as SavedRegisterFlow;
    if (parsed && parsed.stage === 'otp' && Date.now() - parsed.savedAt < FLOW_EXPIRY_MS) {
      memoryRegisterFlow = parsed;
      return parsed;
    }
    await clearRegisterFlow();
    return null;
  } catch {
    return null;
  }
}

export async function clearRegisterFlow() {
  memoryRegisterFlow = null;
  const SecureStore = await getAvailableSecureStore();
  if (SecureStore) {
    try {
      await SecureStore.deleteItemAsync(REGISTER_FLOW_KEY);
    } catch {}
  }
  const storage = getBrowserStorage();
  storage?.removeItem(REGISTER_FLOW_KEY);
}
