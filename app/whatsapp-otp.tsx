import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/src/components/AppButton';
import { AppCard } from '@/src/components/AppCard';
import { GigxomiHeader } from '@/src/components/GigxomiHeader';
import { Screen } from '@/src/components/Screen';
import { theme } from '@/src/constants/theme';
import { useAuth } from '@/src/hooks/useAuth';

function FlowRow({ index, title, copy }: { index: string; title: string; copy: string }) {
  return (
    <View style={styles.flowRow}>
      <View style={styles.flowIndex}>
        <Text style={styles.flowIndexText}>{index}</Text>
      </View>
      <View style={styles.flowCopy}>
        <Text style={styles.flowTitle}>{title}</Text>
        <Text style={styles.flowText}>{copy}</Text>
      </View>
    </View>
  );
}

export default function WhatsAppOtpScreen() {
  const auth = useAuth();
  const session = auth.session;

  return (
    <Screen>
      <GigxomiHeader
        rightSlot={
          <Pressable style={styles.iconButton} onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}>
            <Feather name="x" size={19} color={theme.colors.textSecondary} />
          </Pressable>
        }
      />

      <View style={styles.header}>
        <Text style={styles.eyebrow}>Authentication</Text>
        <Text style={styles.title}>WhatsApp OTP</Text>
        <Text style={styles.copy}>Login uses the same backend auth challenge flow as the website.</Text>
      </View>

      <AppCard style={styles.card}>
        <Text style={styles.cardTitle}>Current session</Text>
        <Text style={styles.cardCopy}>
          {session ? `${session.displayName} - ${session.phone} - ${session.role}` : 'No active mobile session.'}
        </Text>
      </AppCard>

      <AppCard style={styles.card}>
        <Text style={styles.cardTitle}>OTP flow</Text>
        <FlowRow index="1" title="Enter WhatsApp number" copy="The app calls the backend OTP request API and creates an auth challenge." />
        <FlowRow index="2" title="Receive or use test code" copy="Configured WhatsApp delivery is reused. Test codes are returned only when backend allows local test mode." />
        <FlowRow index="3" title="Verify and route" copy="After verification, the backend session decides package gate and role-aware dashboard routing." />
      </AppCard>

      <View style={styles.actions}>
        <AppButton title="Open login OTP" onPress={() => router.push('/login')} />
        <AppButton title="Create account" variant="secondary" onPress={() => router.push('/register')} />
        <AppButton title="Profile" variant="secondary" onPress={() => router.push('/profile')} />
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
  card: {
    gap: theme.spacing.md,
    marginBottom: theme.spacing.md,
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
  flowRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderSubtle,
    paddingTop: theme.spacing.sm,
  },
  flowIndex: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    borderWidth: 1,
    borderColor: theme.colors.accentBorder,
    backgroundColor: theme.colors.accentSoft,
  },
  flowIndexText: {
    color: theme.colors.accent,
    fontSize: theme.typography.caption,
    fontWeight: '900',
  },
  flowCopy: {
    flex: 1,
    gap: 2,
  },
  flowTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.body,
    fontWeight: '900',
  },
  flowText: {
    color: theme.colors.mutedText,
    fontSize: theme.typography.caption,
    lineHeight: 17,
  },
  actions: {
    gap: theme.spacing.sm,
  },
});
