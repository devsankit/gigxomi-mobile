import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppCard } from '@/src/components/AppCard';
import { AppButton } from '@/src/components/AppButton';
import { BrandedRefreshControl } from '@/src/components/BrandedRefreshControl';
import { GigxomiHeader } from '@/src/components/GigxomiHeader';
import { Screen } from '@/src/components/Screen';
import { theme } from '@/src/constants/theme';
import { useAuth } from '@/src/hooks/useAuth';
import {
  startInstagramSetup,
  startWhatsAppSetup,
  useAgencyChannelIntegrations,
  usePushDebug,
  usePushRuntimeConfig,
  useUpiConfig,
  useWhatsAppIntegration,
  useYouTubeIntegration,
} from '@/src/hooks/useIntegrations';
import { useRefreshOnFocus } from '@/src/hooks/useRefreshOnFocus';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function text(record: Record<string, unknown>, keys: string[], fallback = 'Not configured') {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
    if (typeof value === 'boolean') {
      return value ? 'Enabled' : 'Disabled';
    }
  }

  return fallback;
}

function StatusCard({
  icon,
  label,
  primary,
  secondary,
  tone = 'neutral',
  actionLabel,
  onAction,
  loadingAction,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  primary: string;
  secondary: string;
  tone?: 'neutral' | 'accent' | 'warning';
  actionLabel?: string;
  onAction?: () => void;
  loadingAction?: boolean;
}) {
  return (
    <AppCard style={styles.card}>
      <View style={styles.cardTop}>
        <View style={[styles.cardIcon, tone === 'accent' && styles.cardIconAccent, tone === 'warning' && styles.cardIconWarning]}>
          <Feather name={icon} size={18} color={tone === 'neutral' ? theme.colors.textSecondary : theme.colors.accent} />
        </View>
        <View style={styles.cardCopy}>
          <Text style={styles.cardLabel}>{label}</Text>
          <Text style={styles.cardPrimary}>{primary}</Text>
          <Text style={styles.cardSecondary}>{secondary}</Text>
        </View>
      </View>
      {actionLabel && onAction ? (
        <View style={styles.cardActionRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={actionLabel}
            disabled={loadingAction}
            onPress={onAction}
            style={({ pressed }) => [
              styles.cardActionBtn,
              tone === 'accent' ? styles.cardActionBtnSecondary : styles.cardActionBtnPrimary,
              pressed && styles.pressed,
              loadingAction && styles.cardActionBtnDisabled,
            ]}
          >
            {loadingAction ? (
              <ActivityIndicator size="small" color={tone === 'accent' ? theme.colors.accentStrong : '#000000'} />
            ) : (
              <>
                <Text style={tone === 'accent' ? styles.cardActionBtnSecondaryText : styles.cardActionBtnPrimaryText}>
                  {actionLabel}
                </Text>
                <Feather
                  name={tone === 'accent' ? 'refresh-cw' : 'external-link'}
                  size={13}
                  color={tone === 'accent' ? theme.colors.accentStrong : '#000000'}
                />
              </>
            )}
          </Pressable>
        </View>
      ) : null}
    </AppCard>
  );
}

export default function IntegrationsScreen() {
  const auth = useAuth();
  const role = auth.session?.role;
  const token = auth.token || null;
  const isAgencyRole = role === 'ADMIN' || role === 'SUPER_ADMIN';

  const channelsQuery = useAgencyChannelIntegrations(isAgencyRole);
  const whatsappQuery = useWhatsAppIntegration(role);
  const upiQuery = useUpiConfig(role);
  const youtubeQuery = useYouTubeIntegration();
  const pushQuery = usePushRuntimeConfig();
  const pushDebugQuery = usePushDebug();

  const [connectingWhatsApp, setConnectingWhatsApp] = useState(false);
  const [connectingInstagram, setConnectingInstagram] = useState(false);

  useRefreshOnFocus(whatsappQuery.refetch, whatsappQuery.isEnabled);
  useRefreshOnFocus(channelsQuery.refetch, channelsQuery.isEnabled);
  useRefreshOnFocus(upiQuery.refetch, upiQuery.isEnabled);
  useRefreshOnFocus(youtubeQuery.refetch);
  useRefreshOnFocus(pushQuery.refetch);
  useRefreshOnFocus(pushDebugQuery.refetch);

  const connections = channelsQuery.data?.connections ?? [];
  const instagramConnection = connections.find((c) => c.provider === 'INSTAGRAM');
  const whatsappConnection = connections.find((c) => c.provider === 'WHATSAPP');
  const whatsappFromQuery = asRecord(whatsappQuery.data?.connection);

  const isWhatsAppConnected =
    whatsappConnection?.status === 'CONNECTED' ||
    whatsappFromQuery.status === 'connected' ||
    Boolean(whatsappFromQuery.pluginEnabled);

  const isInstagramConnected =
    instagramConnection?.status === 'CONNECTED' ||
    instagramConnection?.status === 'Ready for webhook';

  const upi = asRecord(upiQuery.data?.config);
  const youtube = asRecord(youtubeQuery.data?.connection);
  const pushConfig = asRecord(pushQuery.data?.config);
  const uploads = youtubeQuery.data?.uploads ?? [];

  const handleConnectWhatsApp = async () => {
    if (!token) return;
    setConnectingWhatsApp(true);
    try {
      const url = await startWhatsAppSetup(token);
      await Linking.openURL(url);
    } catch (err) {
      Alert.alert(
        'WhatsApp Business API',
        err instanceof Error ? err.message : 'Could not launch WhatsApp setup. Tap Complete Onboarding for manual setup.'
      );
    } finally {
      setConnectingWhatsApp(false);
    }
  };

  const handleConnectInstagram = async () => {
    if (!token) return;
    setConnectingInstagram(true);
    try {
      const url = await startInstagramSetup(token);
      await Linking.openURL(url);
    } catch (err) {
      Alert.alert(
        'Instagram Graph API',
        err instanceof Error ? err.message : 'Could not connect Instagram. Tap Complete Onboarding for manual setup.'
      );
    } finally {
      setConnectingInstagram(false);
    }
  };

  return (
    <Screen
      refreshControl={
        <BrandedRefreshControl
          tintColor={theme.colors.accent}
          refreshing={
            channelsQuery.isFetching ||
            whatsappQuery.isFetching ||
            upiQuery.isFetching ||
            youtubeQuery.isFetching ||
            pushQuery.isFetching
          }
          onRefresh={() => {
            void channelsQuery.refetch();
            void whatsappQuery.refetch();
            void upiQuery.refetch();
            void youtubeQuery.refetch();
            void pushQuery.refetch();
            void pushDebugQuery.refetch();
          }}
        />
      }
    >
      <GigxomiHeader
        rightSlot={
          <Pressable style={styles.iconButton} onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}>
            <Feather name="x" size={19} color={theme.colors.textSecondary} />
          </Pressable>
        }
      />

      <View style={styles.header}>
        <Text style={styles.eyebrow}>Operations</Text>
        <Text style={styles.title}>Integrations</Text>
        <Text style={styles.copy}>Keep your client channels connected and check their latest status.</Text>
      </View>

      {isAgencyRole ? (
        <AppCard style={styles.card}>
          <Text style={styles.cardLabel}>Client inbox connections</Text>
          <Text style={styles.cardSecondary}>
            Connect your agency WhatsApp Business API and Instagram Graph API to start receiving and sending client messages seamlessly.
          </Text>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
            <View style={{ flex: 1 }}>
              <AppButton
                title={isWhatsAppConnected ? 'Reconnect WhatsApp' : 'Connect WhatsApp'}
                variant={isWhatsAppConnected ? 'secondary' : 'primary'}
                loading={connectingWhatsApp}
                onPress={handleConnectWhatsApp}
              />
            </View>
            <View style={{ flex: 1 }}>
              <AppButton
                title={isInstagramConnected ? 'Reconnect Instagram' : 'Connect Instagram'}
                variant={isInstagramConnected ? 'secondary' : 'primary'}
                loading={connectingInstagram}
                onPress={handleConnectInstagram}
              />
            </View>
          </View>
        </AppCard>
      ) : null}

      {whatsappQuery.error ? <Text style={styles.error}>WhatsApp: {whatsappQuery.error.message}</Text> : null}
      {channelsQuery.error ? <Text style={styles.error}>Channels: {channelsQuery.error.message}</Text> : null}
      {upiQuery.error ? <Text style={styles.error}>UPI: {upiQuery.error.message}</Text> : null}
      {youtubeQuery.error ? <Text style={styles.error}>YouTube: {youtubeQuery.error.message}</Text> : null}
      {pushQuery.error ? <Text style={styles.error}>Push: {pushQuery.error.message}</Text> : null}
      {pushDebugQuery.error ? <Text style={styles.error}>Push debug: {pushDebugQuery.error.message}</Text> : null}

      <View style={styles.grid}>
        <StatusCard
          icon="message-circle"
          label="WhatsApp Business Cloud API"
          primary={isWhatsAppConnected ? 'Connected & Ready' : whatsappQuery.isEnabled ? 'Not connected' : 'Restricted'}
          secondary={
            isWhatsAppConnected
              ? (text(whatsappFromQuery, ['phoneNumber', 'phoneNumberId', 'displayName']) || 'Live client messages synced')
              : 'Direct Meta Cloud API integration for client chat conversations'
          }
          tone={isWhatsAppConnected ? 'accent' : 'neutral'}
          actionLabel={isAgencyRole ? (isWhatsAppConnected ? 'Reconnect WhatsApp' : 'Connect WhatsApp API') : undefined}
          onAction={handleConnectWhatsApp}
          loadingAction={connectingWhatsApp}
        />

        <StatusCard
          icon="instagram"
          label="Instagram Graph API"
          primary={isInstagramConnected ? 'Connected & Ready' : isAgencyRole ? 'Not connected' : 'Restricted'}
          secondary={
            isInstagramConnected
              ? (instagramConnection?.status || 'Direct DMs & Comments synced')
              : 'Direct Meta Graph API integration for Instagram Direct Messages'
          }
          tone={isInstagramConnected ? 'accent' : 'neutral'}
          actionLabel={isAgencyRole ? (isInstagramConnected ? 'Reconnect Instagram' : 'Connect Instagram API') : undefined}
          onAction={handleConnectInstagram}
          loadingAction={connectingInstagram}
        />

        <StatusCard
          icon="credit-card"
          label="UPI payments"
          primary={upiQuery.isEnabled ? text(upi, ['enabled'], 'Not configured') : 'Restricted'}
          secondary={upiQuery.isEnabled ? text(upi, ['upiId', 'payeeName'], 'No UPI ID saved') : 'Admin access required'}
          tone={upi.enabled ? 'accent' : 'neutral'}
        />

        <StatusCard
          icon="youtube"
          label="YouTube"
          primary={text(youtube, ['status', 'channelTitle', 'channelName'], 'Not connected')}
          secondary={`${uploads.length} recent publish jobs from backend`}
          tone={uploads.length ? 'accent' : 'neutral'}
        />

        <StatusCard
          icon="smartphone"
          label="Push runtime"
          primary={text(pushConfig, ['projectId', 'appId'], 'Firebase config pending')}
          secondary={`${pushDebugQuery.data?.push?.activeTokenCount ?? 0} active token(s), ${pushQuery.data?.vapidKey ? 'VAPID ready' : 'VAPID pending'}`}
          tone={pushDebugQuery.data?.push?.activeTokenCount ? 'accent' : 'warning'}
        />
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
  grid: {
    gap: theme.spacing.md,
  },
  card: {
    gap: theme.spacing.sm,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
  },
  cardIcon: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 21,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    backgroundColor: theme.colors.surfaceSoft,
  },
  cardIconAccent: {
    borderColor: theme.colors.accentBorder,
    backgroundColor: theme.colors.accentSoft,
  },
  cardIconWarning: {
    borderColor: 'rgba(245, 158, 11, 0.28)',
  },
  cardCopy: {
    flex: 1,
    gap: 4,
  },
  cardLabel: {
    color: theme.colors.mutedText,
    fontSize: theme.typography.caption,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  cardPrimary: {
    color: theme.colors.text,
    fontSize: theme.typography.body,
    fontWeight: '900',
  },
  cardSecondary: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.small,
    lineHeight: 18,
  },
  cardActionRow: {
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
  },
  cardActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  cardActionBtnPrimary: {
    backgroundColor: theme.colors.accent,
  },
  cardActionBtnSecondary: {
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.35)',
  },
  cardActionBtnPrimaryText: {
    color: '#000000',
    fontSize: theme.typography.small,
    fontWeight: '800',
  },
  cardActionBtnSecondaryText: {
    color: theme.colors.accentStrong,
    fontSize: theme.typography.small,
    fontWeight: '700',
  },
  cardActionBtnDisabled: {
    opacity: 0.6,
  },
  pressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
});
