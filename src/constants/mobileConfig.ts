import { theme } from '@/src/constants/theme';
import { DISABLED_JOURNEY, sanitizeJourneyCapability, type JourneyCapability } from '@/src/lib/journey-core';
import type { MobileRole } from '@/src/types';

export const PUBLIC_AUTH_OTP_COMMAND = 'Get OTP';
export const DEFAULT_PUBLIC_AUTH_WHATSAPP_HREF = `https://wa.me/919981807309?text=${encodeURIComponent(PUBLIC_AUTH_OTP_COMMAND)}`;

export type MobileNavRole = 'freelancer' | 'agency' | 'manager' | 'superAdmin';

export type MobileNavKey =
  | 'dashboard'
  | 'work'
  | 'applyWork'
  | 'services'
  | 'chat'
  | 'earnings'
  | 'team'
  | 'money'
  | 'tasks'
  | 'reviews'
  | 'contacts'
  | 'escalations'
  | 'overview'
  | 'marketplace'
  | 'billing'
  | 'automation'
  | 'settings';

export type SafeMobileConfig = {
  journeyTracking: JourneyCapability;
  schemaVersion: number;
  theme: Partial<{
    bg: string;
    surface: string;
    primary: string;
    primarySoft: string;
    primaryBorder: string;
  }>;
  features: {
    newBottomNav: boolean;
    telegramInspiredChat: boolean;
    showOnboarding: boolean;
  };
  navigation: Record<MobileNavRole, MobileNavKey[]>;
  copy: {
    onboardingTitle: string;
  };
};

export type MobileNavDestination = {
  key: MobileNavKey;
  route: 'dashboard' | 'chats' | 'projects' | 'service' | 'earnings' | 'team' | 'money' | 'settings';
  label: string;
  icon: keyof typeof import('@expo/vector-icons').Feather.glyphMap;
};

export const DEFAULT_MOBILE_CONFIG: SafeMobileConfig = {
  journeyTracking: DISABLED_JOURNEY,
  schemaVersion: 1,
  theme: {
    bg: theme.colors.background,
    surface: theme.colors.surface,
    primary: theme.colors.accent,
    primarySoft: theme.colors.accentSoft,
    primaryBorder: theme.colors.accentBorder,
  },
  features: {
    newBottomNav: true,
    telegramInspiredChat: true,
    showOnboarding: true,
  },
  navigation: {
    freelancer: ['dashboard', 'chat', 'applyWork', 'team', 'settings'],
    agency: ['dashboard', 'chat', 'work', 'team', 'settings'],
    manager: ['dashboard', 'chat', 'tasks', 'settings'],
    superAdmin: ['overview', 'chat', 'team', 'settings'],
  },
  copy: {
    onboardingTitle: 'Complete your setup',
  },
};

export const MOBILE_NAV_DESTINATIONS: Record<MobileNavKey, MobileNavDestination | null> = {
  dashboard: { key: 'dashboard', route: 'dashboard', label: 'Dashboard', icon: 'home' },
  work: { key: 'work', route: 'projects', label: 'Work', icon: 'briefcase' },
  applyWork: { key: 'applyWork', route: 'projects', label: 'Opportunities', icon: 'send' },
  services: { key: 'services', route: 'service', label: 'Services', icon: 'plus-square' },
  chat: { key: 'chat', route: 'chats', label: 'Chat', icon: 'message-circle' },
  earnings: { key: 'earnings', route: 'earnings', label: 'Earnings', icon: 'trending-up' },
  team: { key: 'team', route: 'team', label: 'Team', icon: 'users' },
  money: null,
  tasks: { key: 'tasks', route: 'projects', label: 'Tasks', icon: 'check-square' },
  reviews: { key: 'reviews', route: 'projects', label: 'Reviews', icon: 'check-circle' },
  contacts: { key: 'contacts', route: 'team', label: 'Contacts', icon: 'book-open' },
  escalations: { key: 'escalations', route: 'projects', label: 'Escalate', icon: 'alert-triangle' },
  overview: { key: 'overview', route: 'dashboard', label: 'Overview', icon: 'activity' },
  marketplace: { key: 'marketplace', route: 'projects', label: 'Market', icon: 'grid' },
  billing: { key: 'billing', route: 'money', label: 'Billing', icon: 'credit-card' },
  automation: { key: 'automation', route: 'team', label: 'Team', icon: 'users' },
  settings: { key: 'settings', route: 'settings', label: 'Settings', icon: 'settings' },
};

export function resolveMobileNavRole(role?: MobileRole | null, workspaceMode?: 'AGENCY' | 'FREELANCER' | null): MobileNavRole {
  if (role === 'SUPER_ADMIN') {
    return 'superAdmin';
  }

  if (role === 'MANAGER') {
    return 'manager';
  }

  if (role === 'ADMIN' || workspaceMode === 'AGENCY') {
    return 'agency';
  }

  return 'freelancer';
}

function isSafeColorToken(value: unknown) {
  if (typeof value !== 'string') {
    return false;
  }

  return /^#[0-9a-f]{6}$/i.test(value) || /^rgba\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*(0|1|0?\.\d+)\s*\)$/i.test(value);
}

function validateNavList(value: unknown): MobileNavKey[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const keys = value.filter((item): item is MobileNavKey => typeof item === 'string' && item in MOBILE_NAV_DESTINATIONS);
  const uniqueKeys = [...new Set(keys)];

  return uniqueKeys.length >= 3 && uniqueKeys.length <= 5 ? uniqueKeys : null;
}

const ROLE_NAV_PREFERENCES: Record<MobileNavRole, MobileNavKey[]> = {
  freelancer: ['dashboard', 'chat', 'applyWork', 'team', 'settings'],
  agency: ['dashboard', 'chat', 'work', 'team', 'settings'],
  manager: ['dashboard', 'chat', 'tasks', 'settings'],
  superAdmin: ['overview', 'chat', 'team', 'settings'],
};

const ROLE_ALLOWED_NAV_KEYS: Record<MobileNavRole, Set<MobileNavKey>> = {
  freelancer: new Set(['dashboard', 'chat', 'applyWork', 'team', 'settings']),
  agency: new Set(['dashboard', 'chat', 'work', 'team', 'settings']),
  manager: new Set(['dashboard', 'chat', 'tasks', 'settings']),
  superAdmin: new Set(['overview', 'chat', 'team', 'settings']),
};

function mapNavKeyForRole(role: MobileNavRole, key: MobileNavKey): MobileNavKey {
  if (key === 'money' || key === 'billing' || key === 'earnings') {
    return role === 'superAdmin' ? 'overview' : role === 'freelancer' ? 'settings' : 'dashboard';
  }

  if (role === 'freelancer' && (key === 'work' || key === 'marketplace' || key === 'tasks')) {
    return 'applyWork';
  }

  if ((role === 'agency' || role === 'manager') && (key === 'applyWork' || key === 'marketplace')) {
    return role === 'manager' ? 'tasks' : 'work';
  }

  if (role === 'manager' && (key === 'contacts' || key === 'team')) {
    return 'reviews';
  }

  if (role === 'agency' && (key === 'contacts' || key === 'automation')) {
    return 'team';
  }

  if (role === 'superAdmin') {
    if (key === 'marketplace') return 'chat';
    if (key === 'automation') return 'team';
  }

  return key;
}

function normalizeNavListForRole(role: MobileNavRole, keys: MobileNavKey[]) {
  const preferred = ROLE_NAV_PREFERENCES[role];
  const allowed = ROLE_ALLOWED_NAV_KEYS[role];
  const mappedKeys = keys.map((key) => mapNavKeyForRole(role, key)).filter((key) => allowed.has(key));
  const ordered = [...preferred, ...mappedKeys];

  return [...new Set(ordered)].slice(0, 5);
}

export function sanitizeMobileConfig(payload: unknown): SafeMobileConfig {
  if (!payload || typeof payload !== 'object') {
    return DEFAULT_MOBILE_CONFIG;
  }

  const record = payload as Record<string, unknown>;
  const themeRecord = record.theme && typeof record.theme === 'object' ? (record.theme as Record<string, unknown>) : {};
  const featuresRecord = record.features && typeof record.features === 'object' ? (record.features as Record<string, unknown>) : {};
  const navigationRecord = record.navigation && typeof record.navigation === 'object' ? (record.navigation as Record<string, unknown>) : {};
  const copyRecord = record.copy && typeof record.copy === 'object' ? (record.copy as Record<string, unknown>) : {};

  return {
    schemaVersion: typeof record.schemaVersion === 'number' ? record.schemaVersion : DEFAULT_MOBILE_CONFIG.schemaVersion,
    journeyTracking: sanitizeJourneyCapability(record.journeyTracking),
    theme: {
      bg: isSafeColorToken(themeRecord.bg) ? String(themeRecord.bg) : DEFAULT_MOBILE_CONFIG.theme.bg,
      surface: isSafeColorToken(themeRecord.surface) ? String(themeRecord.surface) : DEFAULT_MOBILE_CONFIG.theme.surface,
      primary: isSafeColorToken(themeRecord.primary) ? String(themeRecord.primary) : DEFAULT_MOBILE_CONFIG.theme.primary,
      primarySoft: isSafeColorToken(themeRecord.primarySoft) ? String(themeRecord.primarySoft) : DEFAULT_MOBILE_CONFIG.theme.primarySoft,
      primaryBorder: isSafeColorToken(themeRecord.primaryBorder) ? String(themeRecord.primaryBorder) : DEFAULT_MOBILE_CONFIG.theme.primaryBorder,
    },
    features: {
      newBottomNav: typeof featuresRecord.newBottomNav === 'boolean' ? featuresRecord.newBottomNav : DEFAULT_MOBILE_CONFIG.features.newBottomNav,
      telegramInspiredChat:
        typeof featuresRecord.telegramInspiredChat === 'boolean' ? featuresRecord.telegramInspiredChat : DEFAULT_MOBILE_CONFIG.features.telegramInspiredChat,
      showOnboarding: typeof featuresRecord.showOnboarding === 'boolean' ? featuresRecord.showOnboarding : DEFAULT_MOBILE_CONFIG.features.showOnboarding,
    },
    navigation: {
      freelancer: validateNavList(navigationRecord.freelancer) ?? DEFAULT_MOBILE_CONFIG.navigation.freelancer,
      agency: validateNavList(navigationRecord.agency) ?? DEFAULT_MOBILE_CONFIG.navigation.agency,
      manager: validateNavList(navigationRecord.manager) ?? DEFAULT_MOBILE_CONFIG.navigation.manager,
      superAdmin: validateNavList(navigationRecord.superAdmin) ?? DEFAULT_MOBILE_CONFIG.navigation.superAdmin,
    },
    copy: {
      onboardingTitle: typeof copyRecord.onboardingTitle === 'string' ? copyRecord.onboardingTitle.slice(0, 80) : DEFAULT_MOBILE_CONFIG.copy.onboardingTitle,
    },
  };
}

export function getMobileNavDestinations(config: SafeMobileConfig, role: MobileNavRole, availableRoutes: Set<string>) {
  const navigationKeys = normalizeNavListForRole(role, config.navigation[role]);
  const resolved = navigationKeys
    .map((key) => MOBILE_NAV_DESTINATIONS[key])
    .filter((item): item is MobileNavDestination => item !== null && availableRoutes.has(item.route));

  if (resolved.length >= 4) {
    return resolved.slice(0, 5);
  }

  const fallback = DEFAULT_MOBILE_CONFIG.navigation[role]
    .map((key) => MOBILE_NAV_DESTINATIONS[key])
    .filter((item): item is MobileNavDestination => item !== null && availableRoutes.has(item.route))
    .slice(0, 5);

  if (fallback.length >= 4) {
    return fallback;
  }

  return DEFAULT_MOBILE_CONFIG.navigation.freelancer
    .map((key) => MOBILE_NAV_DESTINATIONS[key])
    .filter((item): item is MobileNavDestination => item !== null && availableRoutes.has(item.route))
    .slice(0, 5);
}
