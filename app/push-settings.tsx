import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { AppButton } from '@/src/components/AppButton';
import { BrandedRefreshControl } from '@/src/components/BrandedRefreshControl';
import { AppCard } from '@/src/components/AppCard';
import { GigxomiHeader } from '@/src/components/GigxomiHeader';
import { usePushNotifications } from '@/src/components/PushNotificationProvider';
import { Screen } from '@/src/components/Screen';
import { theme } from '@/src/constants/theme';
import { usePushDebug, usePushDeviceDiagnostics } from '@/src/hooks/useIntegrations';
import { useSendTestPushNotification } from '@/src/hooks/useNotifications';
import { ensureNotificationChannels, openChatNotificationSettings, openProjectOfferNotificationSettings } from '@/src/lib/pushNotifications';

function describeStatus(status: ReturnType<typeof usePushNotifications>['status'], enabled: boolean, error: string) {
  if (error) return error;
  if (!enabled || status === 'disabled') return 'Push notifications are off for this device.';
  if (status === 'registered') return 'Push notifications are on for this device.';
  if (status === 'registering') return 'Turning on push notifications...';
  if (status === 'permission-denied') return 'Notifications are blocked in Android settings.';
  if (status === 'unsupported') return 'Install the Gigxomi Android app to register Firebase push notifications on this device.';
  return 'Turn on to register this device with Firebase Cloud Messaging.';
}

export default function PushSettingsScreen() {
  const push = usePushNotifications();
  const pushDebug = usePushDebug();
  const deviceDiagnosticsQuery = usePushDeviceDiagnostics(push.status !== 'unsupported');
  const sendTestPush = useSendTestPushNotification();
  const [repairStatus, setRepairStatus] = useState('');
  const switchEnabled = push.enabled && push.status !== 'unsupported';
  const deviceDiagnostics = deviceDiagnosticsQuery.data ?? null;

  async function handleSendTestPush() {
    const registeredToken = push.status === 'registered' && push.token ? push.token : (await push.enable())?.token;
    if (!registeredToken) {
      return;
    }
    sendTestPush.mutate({ token: registeredToken, type: 'chat' });
  }

  async function handleRepairNotifications() {
    setRepairStatus('Repairing notification registration...');
    await ensureNotificationChannels();
    const result = await push.enable();
    await push.refresh();
    await deviceDiagnosticsQuery.refetch();
    await pushDebug.refetch();

    const token = result?.token || (push.status === 'registered' ? push.token : null);
    if (token) {
      sendTestPush.mutate({ token, type: 'chat' });
      setRepairStatus('Channels recreated, token registered, and chat test sent.');
      return;
    }

    setRepairStatus('Channels recreated. Turn push on again if no token was returned.');
  }

  return (
    <Screen
      refreshControl={
        <BrandedRefreshControl
          tintColor={theme.colors.accent}
          refreshing={push.status === 'registering'}
          onRefresh={() => {
            void push.refresh();
          }}
        />
      }
    >
      <GigxomiHeader
        rightSlot={
          <Pressable
            style={styles.iconButton}
            onPress={() => {
              if (router.canGoBack()) {
                router.back();
              } else {
                router.replace('/(tabs)/dashboard');
              }
            }}
          >
            <Feather name="x" size={19} color={theme.colors.textSecondary} />
          </Pressable>
        }
      />

      <View style={styles.header}>
        <Text style={styles.eyebrow}>Notifications</Text>
        <Text style={styles.title}>Push settings</Text>
        <Text style={styles.copy}>Control chat alerts, Android message channels, and quick replies for this device.</Text>
      </View>

      {sendTestPush.error ? <Text style={styles.error}>{sendTestPush.error.message}</Text> : null}
      {pushDebug.error ? <Text style={styles.error}>{pushDebug.error.message}</Text> : null}
      {repairStatus ? <Text style={styles.success}>{repairStatus}</Text> : null}

      <AppCard style={styles.card}>
        <View style={styles.switchRow}>
          <View style={styles.switchCopy}>
            <Text style={styles.cardTitle}>Push notifications</Text>
            <Text style={styles.cardCopy}>{describeStatus(push.status, push.enabled, push.error)}</Text>
          </View>
          <Switch
            ios_backgroundColor={theme.colors.surfaceRaised}
            disabled={push.status === 'registering' || push.status === 'unsupported'}
            onValueChange={(value) => {
              void (value ? push.enable() : push.disable());
            }}
            thumbColor={switchEnabled ? theme.colors.accent : theme.colors.mutedText}
            trackColor={{ false: theme.colors.surfaceRaised, true: theme.colors.accentMuted }}
            value={switchEnabled}
          />
        </View>
      </AppCard>

      <AppCard style={styles.card}>
        <Text style={styles.cardTitle}>Android chat channel</Text>
        <Text style={styles.cardCopy}>Channel: {deviceDiagnostics?.chatChannelName || 'Message notifications'}</Text>
        <Text style={styles.cardCopy}>ID: {deviceDiagnostics?.chatChannelId || pushDebug.data?.push?.chatChannelId || 'Checking...'}</Text>
        <Text style={styles.cardCopy}>
          Permission:{' '}
          {deviceDiagnostics?.authorizationStatus === undefined ? 'Checking...' : deviceDiagnostics.authorizationStatus > 0 ? 'Allowed' : 'Blocked'}
        </Text>
        <Text style={styles.cardCopy}>Channel status: {deviceDiagnostics?.chatChannelBlocked ? 'Blocked in Android settings' : 'Available'}</Text>
        <Text style={styles.cardCopy}>Offer channel: {deviceDiagnostics?.projectChannelName || 'Ringing project offers'}</Text>
        <Text style={styles.cardCopy}>Offer channel ID: {deviceDiagnostics?.projectChannelId || pushDebug.data?.push?.channels?.project || 'Checking...'}</Text>
        <Text style={styles.cardCopy}>
          Offer sound: {deviceDiagnostics?.projectChannelBlocked ? 'Blocked in Android settings' : 'Tap below to choose any phone ringtone'}
        </Text>
        <Text style={styles.cardCopy}>Backend tokens: {pushDebug.data?.push?.activeTokenCount ?? 'Checking...'}</Text>
        <Text style={styles.cardCopy}>
          Last offer push:{' '}
          {pushDebug.data?.assignmentDispatch?.last
            ? `${pushDebug.data.assignmentDispatch.last.status} (${pushDebug.data.assignmentDispatch.last.sent}/${pushDebug.data.assignmentDispatch.last.attempted} sent)`
            : 'No offer dispatch recorded since server restart'}
        </Text>
        <Text style={styles.cardCopy}>
          Last backend log:{' '}
          {pushDebug.data?.latestNotificationLog
            ? `${pushDebug.data.latestNotificationLog.type} ${pushDebug.data.latestNotificationLog.status}`
            : 'No recent log'}
        </Text>
      </AppCard>

      <View style={styles.actions}>
        <AppButton
          title={sendTestPush.isPending ? 'Sending chat test...' : 'Send chat test notification'}
          disabled={push.status === 'registering' || push.status === 'unsupported'}
          loading={sendTestPush.isPending}
          icon={<Feather name="send" size={17} color={theme.colors.background} />}
          onPress={() => {
            void handleSendTestPush();
          }}
        />
        <AppButton
          title="Repair notifications"
          variant="secondary"
          disabled={push.status === 'registering' || push.status === 'unsupported'}
          icon={<Feather name="tool" size={17} color={theme.colors.text} />}
          onPress={() => {
            void handleRepairNotifications();
          }}
        />
        <AppButton
          title="Choose project offer ringtone"
          variant="secondary"
          icon={<Feather name="bell" size={17} color={theme.colors.text} />}
          onPress={() => {
            void openProjectOfferNotificationSettings();
          }}
        />
        <AppButton
          title="Open Android chat settings"
          variant="secondary"
          icon={<Feather name="settings" size={17} color={theme.colors.text} />}
          onPress={() => {
            void openChatNotificationSettings();
          }}
        />
        {push.enabled && push.status !== 'registered' ? <Text style={styles.helpText}>Turn push off and on again if this device is not receiving alerts.</Text> : null}
        <AppButton title="Notification inbox" variant="secondary" onPress={() => router.push('/notifications')} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  iconButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
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
  copy: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.small,
    lineHeight: 19,
  },
  error: {
    color: theme.colors.danger,
    fontSize: theme.typography.small,
    marginBottom: theme.spacing.sm,
  },
  success: {
    color: theme.colors.accent,
    fontSize: theme.typography.small,
    marginBottom: theme.spacing.sm,
  },
  card: {
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  switchCopy: {
    flex: 1,
    gap: 4,
  },
  cardTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.section,
    fontWeight: '900',
  },
  cardCopy: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.small,
    lineHeight: 19,
  },
  actions: {
    gap: theme.spacing.md,
  },
  helpText: {
    color: theme.colors.mutedText,
    fontSize: theme.typography.small,
    lineHeight: 18,
  },
});
