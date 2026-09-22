import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useEffect } from 'react';

import { AppButton } from '@/src/components/AppButton';
import { Screen } from '@/src/components/Screen';
import { theme } from '@/src/constants/theme';
import { useSubscriptionStatus } from '@/src/hooks/useSubscriptionStatus';

export default function SubscriptionSuccessScreen() {
  const status = useSubscriptionStatus();

  useEffect(() => {
    void status.refetch();
  }, []);

  return (
    <Screen contentStyle={styles.screen}>
      <View style={styles.card}>
        <View style={styles.iconCircle}>
          <Feather name="check" size={40} color="#0a0d14" />
        </View>

        <Text style={styles.badge}>PAYMENT VERIFIED</Text>
        <Text style={styles.title}>Agency Premium Activated!</Text>
        <Text style={styles.copy}>
          Your payment was successful. All Agency Premium features including unlimited editor assignments, operations manager routing, and multi-channel chat are now unlocked.
        </Text>

        <View style={styles.actions}>
          <AppButton
            title="Go to Dashboard →"
            variant="primary"
            onPress={() => {
              void status.refetch();
              router.replace('/(tabs)/dashboard');
            }}
          />
          <AppButton
            title="Manage Team"
            variant="secondary"
            onPress={() => {
              void status.refetch();
              router.replace('/(tabs)/team');
            }}
          />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    alignItems: 'center',
    flexGrow: 1,
    justifyContent: 'center',
    padding: theme.spacing.lg,
  },
  card: {
    alignItems: 'center',
    backgroundColor: '#0e131d',
    borderColor: '#222d3d',
    borderRadius: 24,
    borderWidth: 1,
    padding: theme.spacing.xl,
    width: '100%',
  },
  iconCircle: {
    alignItems: 'center',
    backgroundColor: theme.colors.accent,
    borderRadius: 36,
    height: 72,
    justifyContent: 'center',
    marginBottom: theme.spacing.md,
    width: 72,
  },
  badge: {
    color: theme.colors.accent,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: theme.spacing.xs,
  },
  title: {
    color: theme.colors.text,
    fontSize: 22,
    fontWeight: '900',
    marginBottom: theme.spacing.sm,
    textAlign: 'center',
  },
  copy: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 22,
    marginBottom: theme.spacing.xl,
    textAlign: 'center',
  },
  actions: {
    gap: theme.spacing.sm,
    width: '100%',
  },
});
