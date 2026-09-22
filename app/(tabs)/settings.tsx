import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { AppButton } from '@/src/components/AppButton';
import { AppCard } from '@/src/components/AppCard';
import { useJourneyPreference } from '@/src/components/JourneyProvider';
import { GigxomiHeader } from '@/src/components/GigxomiHeader';
import { usePushNotifications } from '@/src/components/PushNotificationProvider';
import { Screen } from '@/src/components/Screen';
import { StableAvatar } from '@/src/components/StableAvatar';
import { resolveMobileNavRole } from '@/src/constants/mobileConfig';
import { theme } from '@/src/constants/theme';
import { useAuth } from '@/src/hooks/useAuth';
import { useRefreshOnFocus } from '@/src/hooks/useRefreshOnFocus';
import { useSendTestPushNotification } from '@/src/hooks/useNotifications';
import { useSubscriptionStatus } from '@/src/hooks/useSubscriptionStatus';
import { useUserProfile } from '@/src/hooks/useUserProfile';
import { openProjectOfferNotificationSettings } from '@/src/lib/pushNotifications';

function SettingsRow({
  icon,
  title,
  value,
  onPress,
  trailing,
  showChevron = true,
}: {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  value: string;
  onPress?: () => void;
  trailing?: ReactNode;
  showChevron?: boolean;
}) {
  const isInteractive = Boolean(onPress || trailing);
  return (
    <Pressable disabled={!isInteractive} onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.rowPressed, !isInteractive && styles.rowMuted]}>
      <View style={styles.rowIcon}>
        <Feather name={icon} size={18} color={theme.colors.accent} />
      </View>
      <View style={styles.rowCopy}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowValue}>{value}</Text>
      </View>
      {trailing ?? (showChevron ? <Feather name="chevron-right" size={18} color={theme.colors.mutedText} /> : null)}
    </Pressable>
  );
}

function SectionLabel({ title }: { title: string }) {
  return <Text style={styles.sectionLabel}>{title}</Text>;
}

function describePushStatus(status: ReturnType<typeof usePushNotifications>['status'], enabled: boolean, error: string) {
  if (error) {
    return error;
  }

  if (!enabled || status === 'disabled') {
    return 'Mobile push alerts are disabled for this device.';
  }

  if (status === 'registered') {
    return 'Mobile push alerts are registered for this device.';
  }

  if (status === 'registering') {
    return 'Registering this device for mobile push alerts...';
  }

  if (status === 'unsupported') {
    return 'Native push requires an Android/iOS Firebase development build.';
  }

  if (status === 'permission-denied') {
    return 'Notifications are blocked in device settings.';
  }

  return 'Turn on to register this device with Firebase Cloud Messaging.';
}

export default function SettingsTab() {
  const journeyPreference = useJourneyPreference();
  const auth = useAuth();
  const subscriptionQuery = useSubscriptionStatus();
  const profileQuery = useUserProfile();
  const session = auth.session;
  const pushNotifications = usePushNotifications();
  const sendTestPush = useSendTestPushNotification();
  const role = session?.role;
  const navRole = resolveMobileNavRole(role, session?.workspaceMode);
  const isFreelancer = navRole === 'freelancer';
  const isAgency = navRole === 'agency';
  const isManager = navRole === 'manager';

  useRefreshOnFocus(auth.sessionQuery.refetch);
  useRefreshOnFocus(subscriptionQuery.refetch);
  useRefreshOnFocus(profileQuery.refetch, role === 'FREELANCER' || role === 'SUPER_ADMIN');

  async function handleSendTestPush() {
    const registeredToken =
      pushNotifications.status === 'registered' && pushNotifications.token
        ? pushNotifications.token
        : (await pushNotifications.enable())?.token;

    if (!registeredToken) {
      return;
    }

    sendTestPush.mutate({ token: registeredToken });
  }

  async function handleLogout() {
    await auth.logout();
    router.replace('/login');
  }

  const name = session?.displayName ?? 'Gigxomi user';
  const contact = session?.email ?? session?.phone ?? 'Secure mobile session pending';
  const packageLabel = subscriptionQuery.data?.active
    ? subscriptionQuery.data.subscription?.package?.name ?? subscriptionQuery.data.packageName ?? 'Active package'
    : 'Package required';
  const profileImageUrl = profileQuery.data?.profile?.profileImageUrl;

  return (
    <Screen>
      <GigxomiHeader />
      {journeyPreference.available ? <AppCard>
        <SettingsRow icon="shield" title="Personalized learning and offers" value="Optional: allow Gigxomi to use app activity for personalized learning and marketing, including advertising measurement. Your access is unchanged if you decline." trailing={<Switch accessibilityLabel="Share optional journey activity" disabled={journeyPreference.saving} value={journeyPreference.allowed} onValueChange={value => { void journeyPreference.change(value); }} />} />
        {journeyPreference.error ? <Text accessibilityRole="alert" style={{ color: theme.colors.textSecondary }}>{journeyPreference.error}</Text> : null}
      </AppCard> : null}

      <View style={styles.header}>
        <Text style={styles.eyebrow}>Settings</Text>
        <Text style={styles.title}>Account</Text>
      </View>

      <AppCard style={styles.profileCard}>
        <StableAvatar imageUrl={profileImageUrl} label={name} size={62} />
        <View style={styles.profileCopy}>
          <Text style={styles.name}>{name}</Text>
          <Text style={styles.contact}>{contact}</Text>
          <Text style={styles.session}>{session ? `${session.role} - ${packageLabel}` : 'Login to sync account settings.'}</Text>
        </View>
      </AppCard>

      <SectionLabel title="Account" />
      <View style={styles.section}>
        <SettingsRow icon="user" title="Profile" value="Account identity and profile data." onPress={() => router.push('/profile')} />
        <SettingsRow icon="credit-card" title="Package / subscription" value={packageLabel} onPress={() => router.push('/package')} />
      </View>

      {isFreelancer || isAgency || isManager ? (
        <>
          <SectionLabel title="Workspace" />
          <View style={styles.section}>
            {isAgency || isFreelancer ? <SettingsRow icon="book-open" title="Learning" value="Playlists, practical lessons, and your saved progress." onPress={() => router.push('/learning')} /> : null}
            {isFreelancer ? (
              <>
                <SettingsRow icon="plus-square" title="Services" value="Create, publish, edit, and review service listings." onPress={() => router.push('/service')} />
                <SettingsRow icon="trending-up" title="Earnings" value="Wallet, payout requests, and payment status." onPress={() => router.push('/earnings')} />
              </>
            ) : null}
            {isAgency ? (
              <>
                <SettingsRow icon="users" title="Team" value="Managers, contacts, seats, and connected editors." onPress={() => router.push('/team')} />
                <SettingsRow icon="credit-card" title="Money" value="Billing, payouts, and account movement." onPress={() => router.push('/money')} />
              </>
            ) : null}
            {isManager ? (
              <SettingsRow icon="check-circle" title="Review queue" value="Delivery reviews and assigned work remain available here." onPress={() => router.push('/projects')} />
            ) : null}
          </View>
        </>
      ) : null}

      <SectionLabel title="Notifications" />
      <View style={styles.section}>
        <SettingsRow
          icon="bell"
          title="Push settings"
          value={describePushStatus(pushNotifications.status, pushNotifications.enabled, pushNotifications.error)}
          onPress={() => router.push('/push-settings')}
          showChevron={false}
          trailing={
            <Switch
              ios_backgroundColor={theme.colors.surfaceRaised}
              disabled={pushNotifications.status === 'registering'}
              onValueChange={(value) => {
                void (value ? pushNotifications.enable() : pushNotifications.disable());
              }}
              thumbColor={pushNotifications.enabled ? theme.colors.accent : theme.colors.mutedText}
              trackColor={{ false: theme.colors.surfaceRaised, true: theme.colors.accentMuted }}
              value={pushNotifications.enabled}
            />
          }
        />
        <SettingsRow
          icon="send"
          title="Send test notification"
          value={
            pushNotifications.status === 'registering'
              ? 'Registering this device with Firebase...'
              : sendTestPush.isPending
                ? 'Sending a safe test alert...'
                : sendTestPush.data?.ok
                  ? 'Test notification sent to this device.'
                  : sendTestPush.error
                    ? sendTestPush.error.message
                    : 'Register this device and send a safe Firebase test alert.'
          }
          onPress={() => {
            void handleSendTestPush();
          }}
        />
        {Platform.OS === 'android' ? (
          <SettingsRow
            icon="volume-2"
            title="Project offer ringtone"
            value="Choose the offer sound, vibration, and alert behavior in Android settings."
            onPress={() => {
              void openProjectOfferNotificationSettings();
            }}
          />
        ) : null}
        <SettingsRow icon="inbox" title="Notification inbox" value="Open real backend notifications and mark them read." onPress={() => router.push('/notifications')} />
      </View>

      {isAgency || isManager ? (
        <>
          <SectionLabel title="Admin" />
          <View style={styles.section}>
            <SettingsRow icon="cpu" title="Integrations" value="Connect customer inbox plugins and payout tools." onPress={() => router.push('/integrations')} />
            {role === 'ADMIN' || role === 'SUPER_ADMIN' ? (
              <SettingsRow icon="users" title="Manager permissions" value="Control manager access for this workspace." onPress={() => router.push('/manager-permissions')} />
            ) : null}
          </View>
        </>
      ) : null}

      <View style={styles.logout}>
        <AppButton
          title="Logout"
          variant="danger"
          icon={<Feather name="log-out" size={17} color={theme.colors.text} />}
          onPress={handleLogout}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.lg,
  },
  eyebrow: {
    color: theme.colors.accent,
    fontSize: theme.typography.caption,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  title: {
    color: theme.colors.text,
    fontSize: 28,
    fontWeight: '900',
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  avatar: {
    width: 62,
    height: 62,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 31,
    borderWidth: 1,
    borderColor: theme.colors.accentBorder,
    backgroundColor: theme.colors.accentSoft,
  },
  avatarText: {
    color: theme.colors.text,
    fontSize: theme.typography.title,
    fontWeight: '900',
  },
  profileCopy: {
    flex: 1,
    gap: 4,
  },
  name: {
    color: theme.colors.text,
    fontSize: theme.typography.title,
    fontWeight: '900',
  },
  contact: {
    color: theme.colors.mutedText,
    fontSize: theme.typography.small,
  },
  session: {
    color: theme.colors.accent,
    fontSize: theme.typography.caption,
    fontWeight: '800',
  },
  section: {
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.md,
    borderRadius: theme.radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    backgroundColor: theme.colors.surface,
  },
  sectionLabel: {
    color: theme.colors.mutedText,
    fontSize: theme.typography.caption,
    fontWeight: '900',
    textTransform: 'uppercase',
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.xs,
  },
  row: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderSubtle,
    paddingHorizontal: theme.spacing.md,
  },
  rowPressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
  rowMuted: {
    opacity: 0.72,
  },
  rowIcon: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 19,
    backgroundColor: theme.colors.surfaceSoft,
  },
  rowCopy: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.body,
    fontWeight: '900',
  },
  rowValue: {
    color: theme.colors.mutedText,
    fontSize: theme.typography.caption,
    lineHeight: 16,
  },
  logout: {
    marginTop: theme.spacing.lg,
  },
});
