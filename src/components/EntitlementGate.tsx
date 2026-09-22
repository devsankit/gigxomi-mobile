import { Feather } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/src/constants/theme';
import { useAuth } from '@/src/hooks/useAuth';
import { useSubscriptionStatus } from '@/src/hooks/useSubscriptionStatus';

const unguardedRoutes = new Set(['/', '/login', '/register', '/package', '/connected-onboarding', '/mobile/billing-return']);

export function EntitlementGate() {
  const pathname = usePathname();
  const auth = useAuth();
  const subscription = useSubscriptionStatus();
  const state = subscription.data?.entitlementState;
  const agency = auth.session?.packageAudience === 'AGENCY' || auth.session?.role === 'ADMIN' || auth.session?.role === 'MANAGER';
  const expired = state === 'EXPIRED' || state === 'PAST_DUE' || state === 'CANCELLED' || state === 'NONE';
  const visible = Boolean(auth.token && agency && subscription.isSuccess && !subscription.data.active && expired && !unguardedRoutes.has(pathname));
  const title = state === 'PAST_DUE' ? 'Your payment needs attention' : 'Reactivate your Agency workspace';
  const copy = state === 'PAST_DUE'
    ? 'We could not confirm your latest renewal. Review your plan to restore team, chat, and project access.'
    : 'Your plan has ended. Your Agency identity and workspace data are safe—choose Freemium or renew Premium to continue.';

  return (
    <Modal animationType="fade" onRequestClose={() => router.replace('/package')} transparent visible={visible}>
      <View style={styles.backdrop}>
        <View accessibilityViewIsModal style={styles.sheet}>
          <View style={styles.icon}><Feather color={theme.colors.background} name="lock" size={24} /></View>
          <Text style={styles.eyebrow}>Plan activation required</Text>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.copy}>{copy}</Text>
          <Pressable accessibilityRole="button" onPress={() => router.replace('/package')} style={styles.primaryButton}>
            <Text style={styles.primaryText}>Review plans & reactivate</Text>
          </Pressable>
          <Text style={styles.helper}>Premium activates only after Gigxomi receives verified PhonePe confirmation. Returning from checkout is never enough.</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.82)', flex: 1, justifyContent: 'center', padding: theme.spacing.lg },
  sheet: { alignItems: 'center', backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: 24, borderWidth: 1, gap: theme.spacing.sm, maxWidth: 440, padding: theme.spacing.xl, width: '100%' },
  icon: { alignItems: 'center', backgroundColor: theme.colors.accent, borderRadius: 999, height: 52, justifyContent: 'center', marginBottom: theme.spacing.xs, width: 52 },
  eyebrow: { color: theme.colors.accent, fontSize: theme.typography.caption, fontWeight: '900', textTransform: 'uppercase' },
  title: { color: theme.colors.text, fontSize: 25, fontWeight: '900', textAlign: 'center' },
  copy: { color: theme.colors.textSecondary, fontSize: theme.typography.small, lineHeight: 21, textAlign: 'center' },
  primaryButton: { alignItems: 'center', alignSelf: 'stretch', backgroundColor: theme.colors.accent, borderRadius: theme.radius.md, marginTop: theme.spacing.sm, padding: 15 },
  primaryText: { color: theme.colors.background, fontSize: theme.typography.body, fontWeight: '900' },
  helper: { color: theme.colors.mutedText, fontSize: theme.typography.caption, lineHeight: 18, marginTop: theme.spacing.xs, textAlign: 'center' },
});
