import { router } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/src/components/AppButton';
import { Screen } from '@/src/components/Screen';
import { theme } from '@/src/constants/theme';
import { useSubscriptionStatus } from '@/src/hooks/useSubscriptionStatus';

export default function BillingReturnScreen() {
  const status = useSubscriptionStatus();

  useEffect(() => {
    if (!status.isSuccess) return;
    if (status.data.active) router.replace('/(tabs)/dashboard');
  }, [status.data?.active, status.isSuccess]);

  return (
    <Screen contentStyle={styles.screen}>
      <ActivityIndicator color={theme.colors.accent} size="large" />
      <Text style={styles.title}>Checking PhonePe AutoPay</Text>
      <Text style={styles.copy}>Returning to Gigxomi never activates Premium by itself. Access opens only after the server verifies the mandate.</Text>
      <View style={styles.actions}>
        <AppButton loading={status.isFetching} onPress={() => void status.refetch()} title="Refresh payment status" />
        <AppButton onPress={() => router.replace('/package')} title="Back to plans" variant="secondary" />
      </View>
      {status.error ? <Text style={styles.error}>{status.error.message}</Text> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { alignItems: 'center', flexGrow: 1, gap: theme.spacing.md, justifyContent: 'center' },
  title: { color: theme.colors.text, fontSize: theme.typography.title, fontWeight: '900', textAlign: 'center' },
  copy: { color: theme.colors.textSecondary, fontSize: theme.typography.small, lineHeight: 20, textAlign: 'center' },
  actions: { gap: theme.spacing.sm, marginTop: theme.spacing.md, width: '100%' },
  error: { color: theme.colors.danger, fontSize: theme.typography.small, textAlign: 'center' },
});
