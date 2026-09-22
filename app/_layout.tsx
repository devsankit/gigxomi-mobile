import NetInfo from '@react-native-community/netinfo';
import { focusManager, onlineManager, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { PushNotificationProvider } from '@/src/components/PushNotificationProvider';
import { OfflineBanner } from '@/src/components/OfflineBanner';
import { EntitlementGate } from '@/src/components/EntitlementGate';
import { JourneyProvider } from '@/src/components/JourneyProvider';
import { theme } from '@/src/constants/theme';
import { queryClient } from '@/src/lib/queryClient';
import { resetOnboardingDeferral } from '@/src/lib/onboarding-deferral';

function onAppStateChange(status: AppStateStatus) {
  if (status === 'background') resetOnboardingDeferral();
  focusManager.setFocused(status === 'active');
}

export default function RootLayout() {
  useEffect(() => {
    const subscription = AppState.addEventListener('change', onAppStateChange);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    return onlineManager.setEventListener((setOnline) =>
      NetInfo.addEventListener((state) => {
        setOnline(Boolean(state.isConnected && state.isInternetReachable !== false));
      }),
    );
  }, []);

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <JourneyProvider>
          <PushNotificationProvider>
            <StatusBar style="light" />
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: theme.colors.background },
              }}
            />
            <EntitlementGate />
            <OfflineBanner />
          </PushNotificationProvider>
        </JourneyProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
