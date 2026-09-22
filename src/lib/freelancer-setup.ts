import type { MobileFreelancerOnboardingState } from '@/src/types';

export type FreelancerSetupStep = 'profile' | 'portfolio' | 'assessment' | 'review';

export function freelancerProfileComplete(profile: MobileFreelancerOnboardingState['profile']) {
  return ['fullName', 'displayName', 'profileImageUrl', 'bio', 'experience', 'location', 'timezone', 'availability', 'profession']
    .every((key) => typeof profile[key as keyof typeof profile] === 'string' && String(profile[key as keyof typeof profile]).trim()) &&
    Array.isArray(profile.languages) && profile.languages.length > 0;
}

export function freelancerPortfolioSubmitted(state: MobileFreelancerOnboardingState) {
  // API step 2 means portfolio is still required; step 3 means it was submitted.
  return state.currentStep >= 3 || ['PENDING REVIEW', 'APPROVED', 'REJECTED'].includes(String(state.service?.status ?? '').toUpperCase());
}

export function freelancerSetupStep(state: MobileFreelancerOnboardingState): FreelancerSetupStep {
  if (state.status === 'DISABLED' && state.completed) return 'review';
  if (!freelancerProfileComplete(state.profile) || (!state.identity.verified && !state.identity.skipped)) return 'profile';
  if (String(state.service?.status ?? '').toUpperCase() === 'REJECTED') return 'portfolio';
  if (!freelancerPortfolioSubmitted(state)) return 'portfolio';
  return state.assessment.submitted ? 'review' : 'assessment';
}

export function assessmentAnswersComplete(questions: MobileFreelancerOnboardingState['assessment']['questions'], answers: Record<string, string>) {
  return questions.length > 0 && questions.every((question) => question.options.some((option) => option.id === answers[question.id]));
}

export function portfolioDraftForSave<T extends { tags: string; deliverables: string; primaryCategory: string; secondaryCategories: string[] }>(draft: T) {
  return {
    ...draft,
    tags: draft.tags.split(',').map((value) => value.trim()).filter(Boolean),
    deliverables: draft.deliverables.split('\n').map((value) => value.trim()).filter(Boolean),
    primaryEditorCategory: draft.primaryCategory,
    secondaryEditorCategories: draft.secondaryCategories,
  };
}
