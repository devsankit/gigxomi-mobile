import { router } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/src/components/Screen';
import { theme } from '@/src/constants/theme';
import { useAuth } from '@/src/hooks/useAuth';

export default function IndexScreen() {
  const auth = useAuth();

  useEffect(() => {
    let active = true;

    async function routeInitialSession() {
      if (auth.tokenQuery.isLoading) {
        return;
      }

      if (!auth.token) {
        if (active) {
          router.replace('/login');
        }
        return;
      }

      if (auth.sessionExpired) {
        await auth.logout();
        if (active) router.replace('/login');
        return;
      }

      // Wait for session query to resolve
      if (auth.sessionQuery.isLoading) {
        return;
      }

      const session = auth.session;
      const role = session?.role;
      const userId = session?.userId;

      // Authenticated users proceed straight to their dashboard.
      // Setup/onboarding steps (channel connection, qualification) are accessible
      // voluntarily via dashboard banners and settings.
      if (active) {
        router.replace('/(tabs)/dashboard');
      }
    }

    void routeInitialSession();

    return () => {
      active = false;
    };
  }, [
    auth.session,
    auth.sessionExpired,
    auth.sessionQuery.isLoading,
    auth.token,
    auth.tokenQuery.isLoading,
    auth.logout,
  ]);

  return (
    <Screen contentStyle={styles.screen}>
      <View style={styles.logoMark}>
        <Text style={styles.logo}>GIGXOMI</Text>
      </View>
      <ActivityIndicator color={theme.colors.accent} />
      <Text style={styles.copy}>Opening your Gigxomi workspace…</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.md,
  },
  logoMark: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  logo: {
    color: theme.colors.accent,
    fontSize: theme.typography.small,
    fontWeight: '900',
    letterSpacing: 0,
  },
  copy: {
    color: theme.colors.mutedText,
    fontSize: theme.typography.small,
  },
  actions: {
    width: '100%',
    gap: theme.spacing.md,
    marginTop: theme.spacing.lg,
  },
  error: {
    color: theme.colors.danger,
    fontSize: theme.typography.small,
    textAlign: 'center',
  },
});
