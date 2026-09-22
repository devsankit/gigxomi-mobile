import { router } from 'expo-router';
import { View } from 'react-native';
import { AppButton } from '@/src/components/AppButton';
import { useAuth } from '@/src/hooks/useAuth';
import { useOnboardingDeferral } from '@/src/hooks/useOnboardingDeferral';

export function SetupLaterButton({ disabled = false, beforeLeave }: { disabled?: boolean; beforeLeave?: () => Promise<boolean> }) {
  const auth = useAuth();
  const { defer } = useOnboardingDeferral(auth.session?.userId);
  if (!auth.session?.userId) return null;
  return (
    <View style={{ marginVertical: 12 }}>
      <AppButton
        title="Go to dashboard"
        variant="secondary"
        disabled={disabled}
        onPress={() => {
          void (async () => {
            if (beforeLeave && !(await beforeLeave())) return;
            defer();
            router.replace('/(tabs)/dashboard');
          })();
        }}
      />
    </View>
  );
}
