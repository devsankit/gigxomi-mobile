import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import * as SecureStore from 'expo-secure-store';
import { NativeModules, Platform } from 'react-native';

import { subscribeAccountBoundary } from './account-boundary';
import { apiRequest } from './api';
import { createJourneyTracker, JOURNEY_ENDPOINT, type JourneyPreference } from './journey-core';
import { referralFromInstallReferrer, referralFromUrl, safeInstallTimestamp, safeReferralId } from './referral-contract';

const storage = {
  async read(key: string) {
    if (Platform.OS === 'web') return globalThis.localStorage?.getItem(`gx.journey.${key}`) ?? null;
    if (!FileSystem.documentDirectory) return null;
    const path = `${FileSystem.documentDirectory}journey-v1/${key}.json`;
    return (await FileSystem.getInfoAsync(path)).exists ? FileSystem.readAsStringAsync(path) : null;
  },
  async write(key: string, value: string) {
    if (Platform.OS === 'web') { globalThis.localStorage?.setItem(`gx.journey.${key}`, value); return; }
    if (!FileSystem.documentDirectory) return;
    const dir = `${FileSystem.documentDirectory}journey-v1/`;
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    await FileSystem.writeAsStringAsync(`${dir}${key}.json`, value);
  },
  async remove(key: string) {
    if (Platform.OS === 'web') { globalThis.localStorage?.removeItem(`gx.journey.${key}`); return; }
    if (FileSystem.documentDirectory) await FileSystem.deleteAsync(`${FileSystem.documentDirectory}journey-v1/${key}.json`, { idempotent: true });
  },
};
let sequence = 0;
export const journey = createJourneyTracker({
  storage, now: Date.now,
  id: () => `j_${Date.now().toString(36)}_${(++sequence).toString(36)}_${Math.random().toString(36).slice(2, 14)}`,
  appVersion: Constants.expoConfig?.version ?? '2.1.4',
  distributionChannel: process.env.EXPO_PUBLIC_DISTRIBUTION_CHANNEL === 'PLAY_READER' ? 'PLAY_READER' : 'DIRECT',
  send: (body, token, signal) => apiRequest(JOURNEY_ENDPOINT, { method: 'POST', body, token, signal, timeoutMs: 8_000 }),
});
subscribeAccountBoundary(() => journey.reset());
export async function readJourneyPreference(scope: string): Promise<JourneyPreference | null> {
  try {
    const v = JSON.parse(await storage.read(`preference.${encodeURIComponent(scope)}`) || 'null');
    return v && typeof v.allowed === 'boolean' && typeof v.privacyNoticeVersion === 'string' && typeof v.savedAt === 'string' ? v : null;
  } catch { return null; }
}
export async function saveJourneyPreference(scope: string, value: JourneyPreference) {
  // Revoke synchronously, before any fallible disk operation.
  if (!value.allowed) journey.reset();
  await storage.write(`preference.${encodeURIComponent(scope)}`, JSON.stringify(value));
}

type InstallMetadata = { schemaVersion: 1; firstOpenedAt: number; checked: boolean; referralId: string | null; installStartedAt: number | null };
const INSTALL_KEY = 'gigxomi.install-referral.v1';
let installChain: Promise<unknown> = Promise.resolve();
async function readInstall(): Promise<InstallMetadata> {
  let value: Partial<InstallMetadata> | null = null;
  try {
    value = JSON.parse(Platform.OS === 'web' ? globalThis.localStorage?.getItem(INSTALL_KEY) || 'null' : await SecureStore.getItemAsync(INSTALL_KEY) || 'null');
  } catch { /* Treat unsupported storage as a fresh local observation. */ }
  return { schemaVersion: 1, firstOpenedAt: typeof value?.firstOpenedAt === 'number' && value.firstOpenedAt <= Date.now() ? value.firstOpenedAt : Date.now(), checked: value?.checked === true, referralId: safeReferralId(value?.referralId), installStartedAt: typeof value?.installStartedAt === 'number' ? safeInstallTimestamp(value.installStartedAt / 1000) : null };
}
async function writeInstall(value: InstallMetadata) {
  if (Platform.OS === 'web') globalThis.localStorage?.setItem(INSTALL_KEY, JSON.stringify(value));
  else await SecureStore.setItemAsync(INSTALL_KEY, JSON.stringify(value));
}
export function initializeInstallReferral() {
  installChain = installChain.then(async () => {
    const value = await readInstall();
    if (value.checked) return;
    // Write before the optional native request; one attempt per installation, never an auth dependency.
    await writeInstall({ ...value, checked: true });
    if (Platform.OS !== 'android' || !NativeModules.GigxomiInstallReferrer?.read) return;
    const result = await NativeModules.GigxomiInstallReferrer.read();
    if (result?.status !== 'available') return;
    await writeInstall({ ...value, checked: true, referralId: value.referralId ?? referralFromInstallReferrer(result.referrer), installStartedAt: safeInstallTimestamp(result.installStartedAtSeconds) });
  }).catch(() => undefined);
  return installChain;
}
export function captureReferralLink(url: string) {
  const referralId = referralFromUrl(url);
  if (!referralId) return Promise.resolve();
  installChain = installChain.then(async () => {
    const value = await readInstall();
    // First valid local touch only. This is not a server-verified lead association.
    if (!value.referralId) await writeInstall({ ...value, referralId });
  }).catch(() => undefined);
  return installChain;
}
