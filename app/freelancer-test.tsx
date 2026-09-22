import { Feather } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { AppButton } from '@/src/components/AppButton';
import { AppCard } from '@/src/components/AppCard';
import { Screen } from '@/src/components/Screen';
import { theme } from '@/src/constants/theme';
import { useAuth } from '@/src/hooks/useAuth';
import { queryKeys } from '@/src/hooks/queryKeys';
import { apiRequest } from '@/src/lib/api';
import { freelancerSetupStep } from '@/src/lib/freelancer-setup';
import type { MobileFreelancerOnboardingResponse } from '@/src/types';

export default function FreelancerTestScreen() {
  const auth = useAuth();
  const freelancer = auth.session?.role === 'FREELANCER';
  const query = useQuery({
    queryKey: [...queryKeys.freelancerQualification, auth.session?.userId ?? 'anonymous'],
    enabled: Boolean(auth.token && freelancer), retry: false,
    queryFn: () => apiRequest<MobileFreelancerOnboardingResponse>('/freelancer/onboarding', { token: auth.token }),
  });
  const state = query.data?.onboarding;
  const step = state ? freelancerSetupStep(state) : null;
  const submitted = state?.assessment?.submitted === true;
  const ready = step === 'assessment';
  return <Screen>
    <AppButton title="Back" variant="secondary" onPress={() => router.canGoBack() ? router.back() : router.replace(auth.token ? '/' : '/register')} />
    <View style={styles.hero}>
      <Feather name="award" color={theme.colors.accent} size={36} />
      <Text style={styles.eyebrow}>FREELANCER SKILLS TEST</Text>
      <Text style={styles.title}>Let your skills earn their trust.</Text>
      <Text style={styles.copy}>Answer questions matched to your editing category. Your results contribute to the Trust Score agencies see on your profile.</Text>
    </View>
    <AppCard style={styles.card}>
      <Text style={styles.heading}>{submitted ? 'Assessment submitted' : ready ? 'Your skills test is ready' : 'Your path to a trusted profile'}</Text>
      {submitted && state ? <><Text style={styles.score}>{state.trust.score}/100</Text><Text style={styles.copy}>{state.trust.provisional ? 'Provisional Trust Score' : 'Trust Score'} · Your assessment is one part of this score. Portfolio approval and your work history also contribute.</Text></> : <>
        {['Complete your professional profile', 'Submit your portfolio and editing category', 'Take your skills test', 'See your Trust Score and review status'].map((label, index) => <View key={label} style={styles.step}><Text style={styles.number}>{index + 1}</Text><Text style={styles.stepText}>{label}</Text></View>)}
        <Text style={styles.copy}>{ready ? 'Your questions are saved to your account. Answer every question, then submit to update your Trust Score.' : 'The test unlocks after your profile and portfolio are submitted. No payment is needed for Freelancer access.'}</Text>
      </>}
      {!auth.token ? <AppButton title="Continue registration" onPress={() => router.canGoBack() ? router.back() : router.replace('/register')} /> : !freelancer ? <Text style={styles.copy}>This assessment is for Freelancer accounts. Your Agency account does not need to take it.</Text> : query.isPending ? <ActivityIndicator color={theme.colors.accent} /> : query.isError ? <><Text accessibilityRole="alert" style={styles.error}>We couldn’t load your test status. Please retry; your progress is saved.</Text><AppButton title="Retry test status" onPress={() => void query.refetch()} /></> : <AppButton title={submitted ? 'View result & review status' : ready ? 'Start skills test' : step === 'portfolio' ? 'Submit portfolio to unlock test' : 'Complete profile to unlock test'} onPress={() => router.push('/connected-onboarding')} />}
    </AppCard>
  </Screen>;
}

const styles = StyleSheet.create({
  hero: { gap: 12, marginVertical: 24 }, eyebrow: { color: theme.colors.accent, fontSize: 12, fontWeight: '800' },
  title: { color: theme.colors.text, fontSize: 30, fontWeight: '900', lineHeight: 36 }, copy: { color: theme.colors.textSecondary, fontSize: 14, lineHeight: 22 },
  card: { gap: 18 }, heading: { color: theme.colors.text, fontSize: 20, fontWeight: '800' },
  step: { flexDirection: 'row', alignItems: 'center', gap: 12 }, number: { color: theme.colors.accent, fontWeight: '900', fontSize: 16, width: 24 }, stepText: { color: theme.colors.text, fontSize: 14, lineHeight: 21, flex: 1 },
  score: { color: theme.colors.accent, fontSize: 44, fontWeight: '900' }, error: { color: theme.colors.danger, fontSize: 14, lineHeight: 21 },
});
