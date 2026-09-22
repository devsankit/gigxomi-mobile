import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/src/components/AppButton';
import { BrandedRefreshControl } from '@/src/components/BrandedRefreshControl';
import { AppCard } from '@/src/components/AppCard';
import { GigxomiHeader } from '@/src/components/GigxomiHeader';
import { Screen } from '@/src/components/Screen';
import { theme } from '@/src/constants/theme';
import { useOnboardingProgress, useUpdateOnboardingProgress } from '@/src/hooks/useOnboarding';
import { useRefreshOnFocus } from '@/src/hooks/useRefreshOnFocus';
import type { MobileOnboardingStep } from '@/src/types';

function routeToMobilePath(step: MobileOnboardingStep) {
  const route = step.route.toLowerCase();

  if (route.includes('package') || route.includes('subscription')) return '/package';
  if (route.includes('profile') || route.includes('branding')) return '/profile';
  if (route.includes('service') || route.includes('add-service')) return '/service';
  if (route.includes('payout') || route.includes('earning')) return '/earnings';
  if (route.includes('payment') || route.includes('billing')) return '/money';
  if (route.includes('manager') || route.includes('freelancer') || route.includes('team') || route.includes('contact')) return '/team';
  if (route.includes('whatsapp') || route.includes('youtube') || route.includes('integration')) return '/integrations';
  if (route.includes('chat')) return '/chats';
  if (route.includes('assignment') || route.includes('delivery') || route.includes('task') || route.includes('work')) return '/projects';

  return '/dashboard';
}

export default function OnboardingScreen() {
  const onboardingQuery = useOnboardingProgress();
  const updateProgress = useUpdateOnboardingProgress();
  const checklist = onboardingQuery.data?.checklist;
  const progress = onboardingQuery.data?.progress;
  const completedSteps = progress?.completedSteps ?? [];
  const skippedSteps = progress?.skippedSteps ?? [];
  const totalSteps = checklist?.steps.length ?? 0;
  const doneCount = completedSteps.length;

  useRefreshOnFocus(onboardingQuery.refetch);

  async function markComplete(stepId: string) {
    if (!checklist || !progress) {
      return;
    }

    const nextCompleted = [...new Set([...completedSteps, stepId])];
    await updateProgress.mutateAsync({
      completedSteps: nextCompleted,
      skippedSteps,
      completedAt: nextCompleted.length >= checklist.steps.length ? new Date().toISOString() : progress.completedAt,
      lastSeenStep: stepId,
    });
  }

  async function skipStep(stepId: string) {
    if (!progress) {
      return;
    }

    await updateProgress.mutateAsync({
      completedSteps,
      skippedSteps: [...new Set([...skippedSteps, stepId])],
      lastSeenStep: stepId,
    });
  }

  return (
    <Screen
      refreshControl={
        <BrandedRefreshControl
          tintColor={theme.colors.accent}
          refreshing={onboardingQuery.isFetching}
          onRefresh={() => {
            void onboardingQuery.refetch();
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
        <Text style={styles.eyebrow}>Setup</Text>
        <Text style={styles.title}>{checklist?.title ?? 'Onboarding'}</Text>
        <Text style={styles.copy}>{doneCount}/{totalSteps} steps completed from the backend checklist.</Text>
      </View>

      {onboardingQuery.error ? <Text style={styles.error}>{onboardingQuery.error.message}</Text> : null}
      {updateProgress.error ? <Text style={styles.error}>{updateProgress.error.message}</Text> : null}

      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: totalSteps ? `${Math.min(100, (doneCount / totalSteps) * 100)}%` : '0%' }]} />
      </View>

      <View style={styles.steps}>
        {(checklist?.steps ?? []).map((step, index) => {
          const completed = completedSteps.includes(step.id);
          const skipped = skippedSteps.includes(step.id);

          return (
            <AppCard key={step.id} style={[styles.stepCard, completed && styles.stepDone]}>
              <View style={styles.stepTop}>
                <View style={[styles.stepIndex, completed && styles.stepIndexDone]}>
                  <Text style={styles.stepIndexText}>{completed ? 'OK' : index + 1}</Text>
                </View>
                <View style={styles.stepCopy}>
                  <Text style={styles.stepTitle}>{step.title}</Text>
                  <Text style={styles.stepDescription}>{step.description}</Text>
                  {skipped ? <Text style={styles.skipped}>Skipped</Text> : null}
                </View>
              </View>
              <View style={styles.stepActions}>
                <AppButton title={step.ctaLabel || 'Open'} variant="secondary" onPress={() => router.push(routeToMobilePath(step))} />
                {completed ? null : <AppButton title="Done" loading={updateProgress.isPending} onPress={() => void markComplete(step.id)} />}
                {!completed && step.manualCompleteAllowed ? (
                  <AppButton title="Skip" variant="secondary" loading={updateProgress.isPending} onPress={() => void skipStep(step.id)} />
                ) : null}
              </View>
            </AppCard>
          );
        })}
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
    marginBottom: theme.spacing.md,
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
  progressTrack: {
    height: 8,
    overflow: 'hidden',
    borderRadius: 999,
    backgroundColor: theme.colors.surfaceRaised,
    marginBottom: theme.spacing.lg,
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: theme.colors.accentMuted,
  },
  steps: {
    gap: theme.spacing.md,
  },
  stepCard: {
    gap: theme.spacing.md,
  },
  stepDone: {
    borderColor: theme.colors.accentBorder,
    backgroundColor: theme.colors.accentSoft,
  },
  stepTop: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  stepIndex: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: theme.colors.surfaceRaised,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  stepIndexDone: {
    borderColor: theme.colors.accentBorder,
  },
  stepIndexText: {
    color: theme.colors.accent,
    fontSize: theme.typography.small,
    fontWeight: '900',
  },
  stepCopy: {
    flex: 1,
    gap: 4,
  },
  stepTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.body,
    fontWeight: '900',
  },
  stepDescription: {
    color: theme.colors.mutedText,
    fontSize: theme.typography.small,
    lineHeight: 18,
  },
  skipped: {
    color: theme.colors.warning,
    fontSize: theme.typography.caption,
    fontWeight: '900',
  },
  stepActions: {
    gap: theme.spacing.sm,
  },
});
