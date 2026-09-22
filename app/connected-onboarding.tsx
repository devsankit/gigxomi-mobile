import { Feather } from '@expo/vector-icons';
import { journey } from '@/src/lib/journey-runtime';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/src/components/AppButton';
import { AppCard } from '@/src/components/AppCard';
import { AppInput } from '@/src/components/AppInput';
import { GigxomiHeader } from '@/src/components/GigxomiHeader';
import { Screen } from '@/src/components/Screen';
import { theme } from '@/src/constants/theme';
import { useAuth } from '@/src/hooks/useAuth';
import { useRefreshOnFocus } from '@/src/hooks/useRefreshOnFocus';
import { queryKeys } from '@/src/hooks/queryKeys';
import { ApiError, apiRequest, getApiBaseUrl } from '@/src/lib/api';
import { queryClient } from '@/src/lib/queryClient';
import { assessmentAnswersComplete, freelancerSetupStep as stageFor, portfolioDraftForSave, type FreelancerSetupStep } from '@/src/lib/freelancer-setup';
import { SetupLaterButton } from '@/src/components/SetupLaterButton';
import { useOnboardingDeferral } from '@/src/hooks/useOnboardingDeferral';
import type {
  MobileFreelancerAssessmentResponse,
  MobileFreelancerOnboardingResponse,
  MobileFreelancerOnboardingState,
} from '@/src/types';

type Connection = { provider: 'INSTAGRAM' | 'WHATSAPP'; status: string; displayName?: string | null; lastError?: string | null };
type AgencyOnboarding = { profileDoneAt?: string | null; payload?: Record<string, unknown> | null } | null;
type FreelancerStage = FreelancerSetupStep;

type ProfileDraft = {
  fullName: string;
  displayName: string;
  profileImageUrl: string;
  bio: string;
  experience: string;
  languages: string;
  location: string;
  timezone: string;
  availability: string;
  profession: string;
};

type PortfolioDraft = {
  title: string;
  summary: string;
  description: string;
  targetAudience: string;
  deliveryTime: string;
  revisions: string;
  basePrice: string;
  tags: string;
  deliverables: string;
  sampleVideoUrl: string;
  primaryCategory: string;
  secondaryCategories: string[];
};

const emptyProfile: ProfileDraft = {
  fullName: '',
  displayName: '',
  profileImageUrl: '',
  bio: '',
  experience: '',
  languages: '',
  location: '',
  timezone: 'Asia/Kolkata',
  availability: '',
  profession: '',
};

const emptyPortfolio: PortfolioDraft = {
  title: '',
  summary: '',
  description: '',
  targetAudience: '',
  deliveryTime: '',
  revisions: '',
  basePrice: '',
  tags: '',
  deliverables: '',
  sampleVideoUrl: '',
  primaryCategory: '',
  secondaryCategories: [],
};

function text(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function onboardingErrorMessage(cause: unknown, action: string) {
  if (cause instanceof ApiError) {
    if (cause.status === 401) return 'Your session has expired. Sign in again to continue setup.';
    if (cause.status === 404) return 'This setup step is not available on the server yet. Please update the app or try again shortly.';
    if (cause.status >= 500) return `Gigxomi could not ${action} right now. Your progress is safe—please retry in a moment.`;
  }
  return cause instanceof Error ? cause.message : `Unable to ${action}.`;
}

async function uploadOnboardingImage({
  endpoint,
  fieldName,
  fileUri,
  mimeType,
  token,
}: {
  endpoint: string;
  fieldName: string;
  fileUri: string;
  mimeType: string;
  token: string;
}) {
  const baseUrl = getApiBaseUrl().replace(/\/$/, '');
  const result = await FileSystem.uploadAsync(`${baseUrl}/${endpoint.replace(/^\//, '')}`, fileUri, {
    fieldName,
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    httpMethod: 'POST',
    mimeType,
    sessionType: FileSystem.FileSystemSessionType.FOREGROUND,
    uploadType: FileSystem.FileSystemUploadType.MULTIPART,
  });
  let payload: Record<string, unknown> | null = null;
  try {
    payload = JSON.parse(result.body) as Record<string, unknown>;
  } catch {
    throw new Error('Gigxomi could not read the upload response. Please retry.');
  }
  if (result.status < 200 || result.status >= 300) {
    const detail = typeof payload.error === 'string' ? payload.error : `Upload failed with status ${result.status}.`;
    throw new ApiError(detail, result.status, payload);
  }
  return payload;
}

function list(value: unknown) {
  return Array.isArray(value) ? value.map(text).filter(Boolean) : [];
}

function profileFromState(state: MobileFreelancerOnboardingState): ProfileDraft {
  const draft = state.drafts?.profile ?? {};
  const profile = { ...state.profile, ...draft };
  return {
    fullName: text(profile.fullName),
    displayName: text(profile.displayName),
    profileImageUrl: text(profile.profileImageUrl),
    bio: text(profile.bio),
    experience: text(profile.experience),
    languages: list(profile.languages).join(', '),
    location: text(profile.location),
    timezone: text(profile.timezone) || 'Asia/Kolkata',
    availability: text(profile.availability),
    profession: text(profile.profession) || state.selectedCategories?.primary || '',
  };
}

function portfolioFromState(state: MobileFreelancerOnboardingState): PortfolioDraft {
  const draft = state.drafts?.service ?? {};
  const service = { ...(state.service ?? {}), ...draft };
  return {
    title: text(service.title),
    summary: text(service.summary),
    description: text(service.description),
    targetAudience: text(service.targetAudience),
    deliveryTime: text(service.deliveryTime),
    revisions: text(service.revisions),
    basePrice: service.basePrice ? String(service.basePrice) : '',
    tags: list(service.tags).join(', '),
    deliverables: list(service.deliverables).join('\n'),
    sampleVideoUrl: text(service.sampleVideoUrl) || text(service.sampleVideoEmbedUrl),
    primaryCategory: text(service.primaryEditorCategory) || text(service.specialty) || state.selectedCategories?.primary || text(state.profile.profession),
    secondaryCategories: list(service.secondaryEditorCategories).length
      ? list(service.secondaryEditorCategories)
      : state.selectedCategories?.secondary ?? [],
  };
}

export default function ConnectedOnboarding() {
  const auth = useAuth();
  const agency = auth.session?.role === 'ADMIN';

  if (auth.isLoading) return <Screen><ActivityIndicator color={theme.colors.accent} /><Text style={styles.copy}>Restoring your saved setup…</Text></Screen>;
  if (!auth.token || !auth.session) return <Screen><GigxomiHeader /><Text style={styles.sectionTitle}>Sign in to continue setup</Text><Text style={styles.copy}>Your completed steps are saved to your account.</Text><AppButton title="Sign in" onPress={() => router.replace('/login')} /></Screen>;
  if (!agency && auth.session.role !== 'FREELANCER') return <Screen><GigxomiHeader /><Text style={styles.copy}>This setup is for Agency owners and Freelancers.</Text><AppButton title="Open dashboard" onPress={() => router.replace('/dashboard')} /></Screen>;

  if (agency) {
    return <AgencyConnectedOnboarding key={auth.session.userId} token={auth.token} />;
  }

  return <FreelancerQualificationOnboarding key={auth.session.userId} token={auth.token} />;
}

function FreelancerQualificationOnboarding({ token }: { token: string | null }) {
  const auth = useAuth();
  const { defer } = useOnboardingDeferral(auth.session?.userId);
  const [state, setState] = useState<MobileFreelancerOnboardingState | null>(null);
  const [stage, setStage] = useState<FreelancerStage>('profile');
  useEffect(() => { void journey.track('onboarding.step_viewed', { step: stage }); }, [stage]);
  const [profile, setProfile] = useState<ProfileDraft>(emptyProfile);
  const [portfolio, setPortfolio] = useState<PortfolioDraft>(emptyPortfolio);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async (hydrate = false) => {
    if (!token) return null;
    const response = await apiRequest<MobileFreelancerOnboardingResponse>('/freelancer/onboarding', { token });
    const next = response.onboarding;
    setState(next);
    setStage(stageFor(next));
    if (next.status === 'DISABLED') return next;
    if (hydrate) {
      setProfile(profileFromState(next));
      setPortfolio(portfolioFromState(next));
      setAnswers(next.drafts?.answers ?? {});
    }
    await queryClient.invalidateQueries({ queryKey: queryKeys.freelancerQualification });
    await queryClient.invalidateQueries({ queryKey: queryKeys.onboardingGate('FREELANCER') });
    return next;
  }, [token]);

  useEffect(() => {
    if (auth.session && auth.session.role !== 'FREELANCER' && auth.session.role !== 'SUPER_ADMIN') {
      router.replace('/(tabs)/dashboard');
      return;
    }
    setLoading(true);
    void load(true)
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Unable to load freelancer onboarding.'))
      .finally(() => setLoading(false));
  }, [auth.session, load]);

  function updateProfile(key: keyof ProfileDraft, value: string) {
    setProfile((current) => ({ ...current, [key]: value }));
  }

  function updatePortfolio(key: keyof Omit<PortfolioDraft, 'secondaryCategories'>, value: string) {
    setPortfolio((current) => ({ ...current, [key]: value }));
  }

  function chooseSecondary(category: string) {
    setPortfolio((current) => {
      const selected = current.secondaryCategories.includes(category);
      return {
        ...current,
        secondaryCategories: selected
          ? current.secondaryCategories.filter((item) => item !== category)
          : current.secondaryCategories.length < 2
            ? [...current.secondaryCategories, category]
            : current.secondaryCategories,
      };
    });
  }

  async function uploadProfilePhoto() {
    if (!token) return;
    setError('');
    const result = await DocumentPicker.getDocumentAsync({
      type: ['image/jpeg', 'image/png', 'image/webp'],
      multiple: false,
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setUploading(true);
    try {
      const response = await uploadOnboardingImage({
        endpoint: '/freelancer/onboarding/avatar',
        fieldName: 'avatar',
        fileUri: asset.uri,
        mimeType: asset.mimeType || 'image/jpeg',
        token,
      });
      updateProfile('profileImageUrl', text(response.profileImageUrl));
      setMessage('Profile photo uploaded.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to upload profile photo.');
    } finally {
      setUploading(false);
    }
  }

  async function saveProfile() {
    if (!token) return;
    setSaving(true); setError(''); setMessage('');
    try {
      await apiRequest('/freelancer/onboarding/profile', {
        method: 'POST',
        token,
        body: {
          ...profile,
          languages: profile.languages.split(',').map((item) => item.trim()).filter(Boolean),
        },
      });
      if (!state?.identity.verified && !state?.identity.skipped) {
        await apiRequest('/freelancer/onboarding/identity/skip', { method: 'POST', token, body: {} });
      }
      const next = await load(false);
      if (next) {
        setPortfolio((current) => ({ ...current, primaryCategory: current.primaryCategory || profile.profession }));
        setStage('portfolio');
      }
      setMessage('Profile complete. Add one focused portfolio service next.');
      void journey.track('onboarding.step_saved', { step: 'profile' });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save your profile.');
    } finally {
      setSaving(false);
    }
  }

  async function skipPortfolio() {
    if (!token) return;
    setSaving(true); setError(''); setMessage('');
    try {
      await apiRequest('/freelancer/onboarding', {
        method: 'PATCH',
        token,
        body: { stage: 'service', draft: portfolioDraftForSave(portfolio) },
      }).catch(() => {});
      const assessment = await apiRequest<MobileFreelancerAssessmentResponse>('/freelancer/onboarding/assessment', { token });
      setState((current) => current ? { ...current, assessment: assessment.assessment, currentStep: Math.max(3, current.currentStep) } : current);
      setAnswers({});
      setStage(assessment.assessment.submitted ? 'review' : 'assessment');
      setMessage('Portfolio skipped for now. You can finish your skills test or update your portfolio later.');
      void journey.track('onboarding.step_saved', { step: 'portfolio' });
    } catch {
      setStage('assessment');
      setMessage('Portfolio skipped for now.');
    } finally {
      setSaving(false);
    }
  }

  async function submitPortfolio() {
    if (!token) return;
    setSaving(true); setError(''); setMessage('');
    try {
      await apiRequest('/freelancer/onboarding/service', {
        method: 'POST',
        token,
        body: portfolio,
      });
      const assessment = await apiRequest<MobileFreelancerAssessmentResponse>('/freelancer/onboarding/assessment', { token });
      setState((current) => current ? { ...current, assessment: assessment.assessment, currentStep: Math.max(3, current.currentStep) } : current);
      setAnswers({});
      setStage(assessment.assessment.submitted ? 'review' : 'assessment');
      setMessage('Portfolio submitted privately for review. Complete your dynamic qualification questions.');
      void journey.track('onboarding.step_saved', { step: 'portfolio' });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to submit your portfolio.');
    } finally {
      setSaving(false);
    }
  }

  async function submitAssessment() {
    if (!token || !state) return;
    if (!assessmentAnswersComplete(state.assessment.questions, answers)) {
      setError(state.assessment.questions.length ? `Answer all ${state.assessment.questions.length} questions before submitting.` : 'Your questions haven’t loaded yet. Tap Reload questions to try again.');
      return;
    }
    setSaving(true); setError(''); setMessage('');
    try {
      await apiRequest('/freelancer/onboarding/assessment', { method: 'POST', token, body: { answers } });
      await load(false);
      setStage('review');
      setMessage('Qualification submitted. Your Trust Score is generated and your portfolio is awaiting Gigxomi review.');
      void journey.track('onboarding.step_saved', { step: 'assessment' });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to submit your qualification.');
    } finally {
      setSaving(false);
    }
  }

  async function saveDraftAndLeave() {
    if (!token || stage === 'review') return true;
    setSaving(true);
    try {
      const draft = stage === 'profile' ? { ...profile, languages: profile.languages.split(',').map((value) => value.trim()).filter(Boolean) } : stage === 'portfolio' ? portfolioDraftForSave(portfolio) : answers;
      await apiRequest('/freelancer/onboarding', { method: 'PATCH', token, body: { stage: stage === 'portfolio' ? 'service' : stage, draft } });
      return true;
    } catch {
      return await new Promise<boolean>((resolve) => Alert.alert('Leave setup for now?', 'Your completed steps are saved, but we couldn’t save these latest edits. You can retry or leave without them.', [
        { text: 'Stay & retry', onPress: () => resolve(false), style: 'cancel' },
        { text: 'Go to dashboard', onPress: () => resolve(true) },
      ], { cancelable: false }));
    } finally { setSaving(false); }
  }

  function retrySetup() {
    setLoading(true); setError('');
    void load(true).catch((cause) => setError(onboardingErrorMessage(cause, 'load your setup'))).finally(() => setLoading(false));
  }

  if (loading || !state) {
    return (
      <Screen contentStyle={styles.loadingScreen}>
        <GigxomiHeader />
        {loading ? <ActivityIndicator color={theme.colors.accent} /> : null}
        <Text style={styles.copy}>{loading ? 'Loading qualification steps…' : 'Freelancer qualification'}</Text>
        {error ? (
          <View style={{ width: '100%', gap: 12, marginTop: 16 }}>
            <Text style={styles.error}>{error}</Text>
            <AppButton title="Go to dashboard" onPress={() => router.replace('/(tabs)/dashboard')} />
            <AppButton title="Retry" variant="secondary" onPress={retrySetup} />
          </View>
        ) : null}
      </Screen>
    );
  }

  if (state.status === 'DISABLED') return <Screen><GigxomiHeader /><Text style={styles.copy}>Freelancer qualification is not required right now.</Text><AppButton title="Open dashboard" onPress={() => router.replace('/dashboard')} /></Screen>;

  const questions = state.assessment.questions;
  const reviewStatus = text(state.service?.status) || 'Pending Review';
  const approved = reviewStatus.toUpperCase() === 'APPROVED';
  const stageIndex = stage === 'profile' ? 0 : stage === 'portfolio' ? 1 : stage === 'assessment' ? 2 : 3;

  return (
    <Screen>
      <GigxomiHeader />
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Freelancer qualification</Text>
        <Text style={styles.title}>{stage === 'profile' ? 'Complete your professional profile' : stage === 'portfolio' ? 'Submit your strongest portfolio' : stage === 'assessment' ? 'Build your starting Trust Score' : approved ? 'You are marketplace ready' : 'Portfolio review pending'}</Text>
        <Text style={styles.copy}>Profile → portfolio → skills test → Trust Score → Gigxomi review. Explore your dashboard anytime; finish setup to become ready for approval.</Text>
      </View>
      <View style={styles.progressRow}>
        {['Profile', 'Portfolio', 'Skills test', 'Review'].map((label, index) => (
          <View key={label} style={styles.progressItem}><View style={[styles.progressDot, index <= stageIndex && styles.progressDotActive]}><Text style={[styles.progressNumber, index <= stageIndex && styles.progressNumberActive]}>{index + 1}</Text></View><Text style={[styles.progressLabel, index <= stageIndex && styles.progressLabelActive]}>{label}</Text></View>
        ))}
      </View>

      {stage !== 'review' ? <SetupLaterButton disabled={saving || uploading} beforeLeave={saveDraftAndLeave} /> : null}
      {stage !== 'assessment' ? <AppButton title="Skills test & Trust Score" variant="secondary" onPress={() => router.push('/freelancer-test')} /> : null}

      {stage === 'profile' ? <AppCard style={styles.card}>
        <Text style={styles.sectionTitle}>1. Professional profile</Text>
        <Text style={styles.copy}>Agencies see this identity only after your portfolio is approved.</Text>
        <AppInput label="Proper full name" onChangeText={(value) => updateProfile('fullName', value)} placeholder="As shown on your ID" value={profile.fullName} />
        <AppInput label="Public display name" onChangeText={(value) => updateProfile('displayName', value)} placeholder="Name agencies will see" value={profile.displayName} />
        <Text style={styles.fieldLabel}>Primary editor category</Text>
        <View style={styles.chips}>{state.categories.map((category) => <ChoiceChip key={category} label={category} selected={profile.profession === category} onPress={() => updateProfile('profession', category)} />)}</View>
        <AppInput inputStyle={styles.multiline} label="Professional bio" multiline onChangeText={(value) => updateProfile('bio', value)} placeholder="Your strongest work, process, and client experience" value={profile.bio} />
        <AppInput inputStyle={styles.multiline} label="Experience" multiline onChangeText={(value) => updateProfile('experience', value)} placeholder="Years, formats, channels, and agency work" value={profile.experience} />
        <AppInput label="Languages" onChangeText={(value) => updateProfile('languages', value)} placeholder="English, Hindi" value={profile.languages} />
        <AppInput label="Location" onChangeText={(value) => updateProfile('location', value)} placeholder="Indore, India" value={profile.location} />
        <AppInput label="Timezone" onChangeText={(value) => updateProfile('timezone', value)} placeholder="Asia/Kolkata" value={profile.timezone} />
        <AppInput label="Availability" onChangeText={(value) => updateProfile('availability', value)} placeholder="30 hours/week · weekdays" value={profile.availability} />
        <View style={styles.uploadRow}><View style={styles.grow}><Text style={styles.fieldLabel}>Profile photo</Text><Text numberOfLines={1} style={styles.copy}>{profile.profileImageUrl || 'JPG, PNG, or WebP · max 5 MB'}</Text></View><AppButton loading={uploading} onPress={() => void uploadProfilePhoto()} title={profile.profileImageUrl ? 'Replace' : 'Upload'} variant="secondary" /></View>
        <Text style={styles.helper}>DigiLocker identity verification is optional and can be completed later from your profile.</Text>
        <AppButton loading={saving} onPress={() => void saveProfile()} title="Save profile & continue" />
        <View style={{ marginTop: 8 }}><AppButton disabled={saving} onPress={() => { setStage('portfolio'); setMessage('Profile skipped for now. You can finish it later from your profile.'); }} title="Skip profile for now" variant="secondary" /></View>
      </AppCard> : null}

      {stage === 'portfolio' ? <AppCard style={styles.card}>
        <Text style={styles.sectionTitle}>2. Portfolio and service</Text>
        <Text style={styles.copy}>This stays private until Gigxomi approves it.</Text>
        <AppInput label="Service title" onChangeText={(value) => updatePortfolio('title', value)} placeholder="I will edit retention-focused YouTube videos" value={portfolio.title} />
        <Text style={styles.fieldLabel}>Primary editor category</Text>
        <View style={styles.chips}>{state.categories.map((category) => <ChoiceChip key={category} label={category} selected={portfolio.primaryCategory === category} onPress={() => setPortfolio((current) => ({ ...current, primaryCategory: category, secondaryCategories: current.secondaryCategories.filter((item) => item !== category) }))} />)}</View>
        <Text style={styles.fieldLabel}>Secondary categories · up to two</Text>
        <View style={styles.chips}>{state.categories.filter((category) => category !== portfolio.primaryCategory).map((category) => <ChoiceChip key={category} label={category} selected={portfolio.secondaryCategories.includes(category)} onPress={() => chooseSecondary(category)} />)}</View>
        <AppInput label="One-line summary" onChangeText={(value) => updatePortfolio('summary', value)} placeholder="Clean story edits for creator-led channels" value={portfolio.summary} />
        <AppInput inputStyle={styles.multiline} label="Service description" multiline onChangeText={(value) => updatePortfolio('description', value)} placeholder="Describe your workflow and outcome" value={portfolio.description} />
        <AppInput label="Best for" onChangeText={(value) => updatePortfolio('targetAudience', value)} placeholder="YouTube agencies and creator teams" value={portfolio.targetAudience} />
        <AppInput autoCapitalize="none" label="Portfolio video URL" onChangeText={(value) => updatePortfolio('sampleVideoUrl', value)} placeholder="YouTube, Instagram, or Google Drive" value={portfolio.sampleVideoUrl} />
        <AppInput label="Delivery time" onChangeText={(value) => updatePortfolio('deliveryTime', value)} placeholder="3 business days" value={portfolio.deliveryTime} />
        <AppInput label="Revisions" onChangeText={(value) => updatePortfolio('revisions', value)} placeholder="2 revisions included" value={portfolio.revisions} />
        <AppInput keyboardType="numeric" label="Starting price (INR)" onChangeText={(value) => updatePortfolio('basePrice', value)} placeholder="2500" value={portfolio.basePrice} />
        <AppInput label="Search tags" onChangeText={(value) => updatePortfolio('tags', value)} placeholder="youtube, retention, b-roll" value={portfolio.tags} />
        <AppInput inputStyle={styles.multiline} label="Deliverables" multiline onChangeText={(value) => updatePortfolio('deliverables', value)} placeholder={'Final master\nProject archive\nTwo revisions'} value={portfolio.deliverables} />
        <AppButton loading={saving} onPress={() => void submitPortfolio()} title="Submit portfolio & continue" />
        <View style={{ marginTop: 8 }}><AppButton disabled={saving} onPress={() => void skipPortfolio()} title="Skip portfolio for now" variant="secondary" /></View>
      </AppCard> : null}

      {stage === 'assessment' ? <View style={styles.questionList}>
        <AppCard style={styles.card}><Text style={styles.sectionTitle}>3. Skills test</Text><Text style={styles.copy}>These questions come from Gigxomi’s assessment API and match your editing category. Your answers contribute to your Trust Score.</Text><Text style={styles.helper}>{questions.filter((question) => question.options.some((option) => option.id === answers[question.id])).length} of {questions.length} answered</Text>{!questions.length ? <><Text style={styles.error}>Your questions haven’t loaded yet. You can retry or come back later.</Text><AppButton title="Reload questions" onPress={retrySetup} /></> : null}</AppCard>
        {questions.map((question, index) => (
          <AppCard key={question.id} style={styles.questionCard}>
            <Text style={styles.questionCount}>
              {String(index + 1).padStart(2, '0')} · {question.competency}
            </Text>
            <Text style={styles.questionPrompt}>{question.prompt}</Text>
            {question.options.map((option) => (
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ checked: answers[question.id] === option.id }}
                key={option.id}
                onPress={() => setAnswers((current) => ({ ...current, [question.id]: option.id }))}
                style={[styles.option, answers[question.id] === option.id && styles.optionSelected]}
              >
                <View style={[styles.radio, answers[question.id] === option.id && styles.radioSelected]} />
                <Text style={[styles.optionText, answers[question.id] === option.id && styles.optionTextSelected]}>
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </AppCard>
        ))}
        <AppButton disabled={!assessmentAnswersComplete(questions, answers)} loading={saving} onPress={() => void submitAssessment()} title="Submit answers & generate Trust Score" />
        <View style={{ marginTop: 8 }}><AppButton disabled={saving} onPress={() => { defer(); router.replace('/dashboard'); }} title="Complete test later · Explore dashboard" variant="secondary" /></View>
      </View> : null}

      {stage === 'review' ? <AppCard style={styles.reviewCard}>
        <View style={[styles.reviewIcon, approved && styles.reviewIconApproved]}><Feather color={approved ? theme.colors.background : theme.colors.accent} name={approved ? 'check' : 'clock'} size={26} /></View>
        <Text style={styles.sectionTitle}>{approved ? 'Portfolio approved' : reviewStatus}</Text>
        <Text style={styles.trustScore}>{state.trust.score}/100</Text>
        <Text style={styles.trustLabel}>{state.trust.provisional ? 'Provisional Trust Score' : 'Trust Score'}</Text>
        <Text style={styles.copy}>{approved ? 'Your approved portfolio can now appear in Gigxomi marketplace and General editor search.' : 'Your profile and Trust Score are ready, but you remain hidden from marketplace and General editor search until Gigxomi approves the portfolio.'}</Text>
        <AppButton onPress={() => router.replace('/dashboard')} title="Open freelancer workspace" />
        <AppButton onPress={() => void load(false)} title="Refresh review status" variant="secondary" />
      </AppCard> : null}

      {message ? <Text style={styles.message}>{message}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </Screen>
  );
}

function AgencyConnectedOnboarding({ token }: { token: string | null }) {
  const auth = useAuth();
  const { defer } = useOnboardingDeferral(auth.session?.userId);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [organizationName, setOrganizationName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [policyAccepted, setPolicyAccepted] = useState(true);
  const [showBranding, setShowBranding] = useState(true);
  const [autosaveStatus, setAutosaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedNameRef = useRef<string>('');
  const lastSavedLogoRef = useRef<string>('');
  const isHydratedRef = useRef(false);

  useEffect(() => {
    void journey.track('onboarding.step_viewed', { step: 'channels' });
  }, []);

  const loadConnections = useCallback(async () => {
    if (!token) return;
    setRefreshing(true);
    try {
      const result = await apiRequest<{ connections: Connection[]; onboarding: AgencyOnboarding }>('/mobile/v2/integrations', { token });
      setConnections(result.connections || []);
      if (result.onboarding?.profileDoneAt) {
        const payload = result.onboarding.payload ?? {};
        if (typeof payload.organizationName === 'string') {
          setOrganizationName(payload.organizationName);
          lastSavedNameRef.current = payload.organizationName.trim();
        }
        if (typeof payload.logoUrl === 'string') {
          setLogoUrl(payload.logoUrl);
          lastSavedLogoRef.current = payload.logoUrl;
        }
      }
      isHydratedRef.current = true;
      setError('');
    } catch (cause) {
      setError(onboardingErrorMessage(cause, 'load your channel connections'));
    } finally {
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    void loadConnections();
  }, [loadConnections]);

  useRefreshOnFocus(loadConnections, Boolean(token));

  const saveProfile = useCallback(async (nameOverride?: string, logoOverride?: string, isAuto = false) => {
    if (!token) return;
    const nameToSave = (typeof nameOverride === 'string' ? nameOverride : organizationName).trim();
    const logoToSave = typeof logoOverride === 'string' ? logoOverride : logoUrl;
    if (!nameToSave && !logoToSave) return;

    if (!isAuto) {
      setLoading(true);
      setMessage('');
      setError('');
    } else {
      setAutosaveStatus('saving');
    }

    try {
      await apiRequest('/mobile/v2/onboarding/profile', {
        method: 'POST',
        token,
        body: { organizationName: nameToSave, logoUrl: logoToSave },
      });
      lastSavedNameRef.current = nameToSave;
      lastSavedLogoRef.current = logoToSave;
      await queryClient.invalidateQueries({ queryKey: queryKeys.onboardingGate('ADMIN') });
      await queryClient.invalidateQueries({ queryKey: queryKeys.session });

      if (isAuto) {
        setAutosaveStatus('saved');
        setTimeout(() => {
          setAutosaveStatus((curr) => (curr === 'saved' ? 'idle' : curr));
        }, 2500);
      } else {
        setMessage('Agency details saved.');
      }
    } catch (cause) {
      if (isAuto) {
        setAutosaveStatus('error');
      } else {
        setError(onboardingErrorMessage(cause, 'save your agency details'));
      }
    } finally {
      if (!isAuto) {
        setLoading(false);
      }
    }
  }, [logoUrl, organizationName, token]);

  useEffect(() => {
    if (!isHydratedRef.current || !token) return;
    const trimmed = organizationName.trim();
    if (trimmed === lastSavedNameRef.current) return;

    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
    }

    setAutosaveStatus('saving');
    autosaveTimerRef.current = setTimeout(() => {
      void saveProfile(trimmed, logoUrl, true);
    }, 650);

    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }
    };
  }, [organizationName, logoUrl, saveProfile, token]);

  async function connectInstagram() {
    if (!token) return;
    if (!policyAccepted) {
      setError('Please accept the Meta channel policy before connecting.');
      return;
    }
    setError('');
    try {
      const result = await apiRequest<{ authorizeUrl: string }>('/mobile/v2/integrations/instagram/connect', {
        method: 'POST',
        token,
        body: { policyAccepted: true },
      });
      await Linking.openURL(result.authorizeUrl);
    } catch (cause) {
      setError(onboardingErrorMessage(cause, 'start Instagram setup'));
    }
  }

  async function connectWhatsApp() {
    if (!token) return;
    if (!policyAccepted) {
      setError('Please accept the Meta channel policy before connecting.');
      return;
    }
    setError('');
    try {
      const result = await apiRequest<{ connection?: { onboardingUrl?: string } | null }>('/admin/whatsapp?ensureDraft=1', { token });
      const authorizeUrl = result.connection?.onboardingUrl?.trim();
      if (!authorizeUrl) throw new Error('WhatsApp setup is temporarily unavailable. Please try again in a moment.');
      await Linking.openURL(authorizeUrl);
    } catch (cause) {
      setError(onboardingErrorMessage(cause, 'start WhatsApp setup'));
    }
  }

  async function uploadLogo() {
    if (!token) return;
    const result = await DocumentPicker.getDocumentAsync({
      type: ['image/jpeg', 'image/png', 'image/webp'],
      multiple: false,
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setUploadingLogo(true);
    setMessage('');
    setError('');
    try {
      const response = await uploadOnboardingImage({
        endpoint: '/mobile/v2/onboarding/agency-logo',
        fieldName: 'logo',
        fileUri: asset.uri,
        mimeType: asset.mimeType || 'image/png',
        token,
      });
      const newLogoUrl = text(response.logoUrl);
      setLogoUrl(newLogoUrl);
      setMessage('Logo uploaded and saved.');
      void saveProfile(organizationName, newLogoUrl, true);
    } catch (cause) {
      setError(onboardingErrorMessage(cause, 'upload your agency logo'));
    } finally {
      setUploadingLogo(false);
    }
  }

  const instagram = connections.find((item) => item.provider === 'INSTAGRAM');
  const whatsapp = connections.find((item) => item.provider === 'WHATSAPP');

  const isInstagramConnected = instagram?.status === 'CONNECTED' || instagram?.status === 'Ready for webhook';
  const isWhatsAppConnected = whatsapp?.status === 'CONNECTED' || whatsapp?.status === 'Ready for webhook';
  const hasAnyChannel = isInstagramConnected || isWhatsAppConnected;

  return (
    <Screen>
      <GigxomiHeader
        rightSlot={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close to dashboard"
            style={styles.closeBtn}
            onPress={() => {
              defer();
              router.replace('/(tabs)/dashboard');
            }}
          >
            <Feather name="x" size={19} color={theme.colors.textSecondary} />
          </Pressable>
        }
      />

      <View style={styles.header}>
        <Text style={styles.eyebrow}>Agency Channels</Text>
        <Text style={styles.title}>Connect WhatsApp & Instagram</Text>
        <Text style={styles.copy}>
          Connect your official WhatsApp Business and Instagram accounts to start receiving client inquiries into your unified inbox.
        </Text>
      </View>

      <AppCard style={styles.card}>
        <Text style={styles.sectionTitle}>Client Communication Channels</Text>
        <Text style={styles.copy}>
          Gigxomi connects securely to Meta Cloud APIs. Complete both connections below to enable client messaging.
        </Text>

        {/* WhatsApp Business API Card */}
        <View style={[styles.channelBox, isWhatsAppConnected && styles.channelBoxConnected]}>
          <View style={styles.channelHeader}>
            <View style={[styles.channelIconCircle, isWhatsAppConnected && styles.channelIconConnected]}>
              <Feather name="message-circle" size={22} color={isWhatsAppConnected ? theme.colors.accentStrong : theme.colors.text} />
            </View>
            <View style={styles.grow}>
              <View style={styles.channelTitleRow}>
                <Text style={styles.channelName}>WhatsApp Business API</Text>
                <View style={[styles.statusBadge, isWhatsAppConnected ? styles.statusBadgeConnected : styles.statusBadgePending]}>
                  <Text style={[styles.statusBadgeText, isWhatsAppConnected ? styles.statusBadgeTextConnected : styles.statusBadgeTextPending]}>
                    {isWhatsAppConnected ? 'Connected' : 'Not Connected'}
                  </Text>
                </View>
              </View>
              <Text style={styles.channelSub}>
                {isWhatsAppConnected
                  ? (whatsapp?.displayName ? `Account: ${whatsapp.displayName}` : 'Client messages live')
                  : 'Direct Meta Cloud API for client chat threads'}
              </Text>
            </View>
          </View>
          <AppButton
            title={isWhatsAppConnected ? 'Reconnect WhatsApp' : 'Connect WhatsApp Business API'}
            variant={isWhatsAppConnected ? 'secondary' : 'primary'}
            onPress={() => void connectWhatsApp()}
          />
        </View>

        {/* Instagram Graph API Card */}
        <View style={[styles.channelBox, isInstagramConnected && styles.channelBoxConnected]}>
          <View style={styles.channelHeader}>
            <View style={[styles.channelIconCircle, isInstagramConnected && styles.channelIconConnected]}>
              <Feather name="instagram" size={22} color={isInstagramConnected ? theme.colors.accentStrong : theme.colors.text} />
            </View>
            <View style={styles.grow}>
              <View style={styles.channelTitleRow}>
                <Text style={styles.channelName}>Instagram Graph API</Text>
                <View style={[styles.statusBadge, isInstagramConnected ? styles.statusBadgeConnected : styles.statusBadgePending]}>
                  <Text style={[styles.statusBadgeText, isInstagramConnected ? styles.statusBadgeTextConnected : styles.statusBadgeTextPending]}>
                    {isInstagramConnected ? 'Connected' : 'Not Connected'}
                  </Text>
                </View>
              </View>
              <Text style={styles.channelSub}>
                {isInstagramConnected
                  ? (instagram?.displayName ? `Account: ${instagram.displayName}` : 'DMs & Leads synced')
                  : 'Direct Meta Graph API for Instagram Direct Messages'}
              </Text>
            </View>
          </View>
          <AppButton
            title={isInstagramConnected ? 'Reconnect Instagram' : 'Connect Instagram Graph API'}
            variant={isInstagramConnected ? 'secondary' : 'primary'}
            onPress={() => void connectInstagram()}
          />
        </View>

        <AppButton
          title={refreshing ? 'Checking connection...' : 'Refresh Connection Health'}
          variant="secondary"
          loading={refreshing}
          onPress={() => void loadConnections()}
        />

        <AppButton
          title={hasAnyChannel ? 'Open Agency Inbox →' : 'Launch Agency Workspace'}
          onPress={() => router.replace('/(tabs)/dashboard')}
        />

        <View style={{ marginTop: 4 }}>
          <AppButton
            title="Explore Dashboard · Skip for now"
            variant="secondary"
            onPress={() => {
              defer();
              router.replace('/(tabs)/dashboard');
            }}
          />
        </View>
      </AppCard>

      {/* Optional Brand Workspace Section */}
      <AppCard style={styles.card}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Toggle agency details"
          style={styles.collapsibleHeader}
          onPress={() => setShowBranding((curr) => !curr)}
        >
          <View style={styles.grow}>
            <Text style={styles.sectionTitleSmall}>Agency Profile & Branding (Optional)</Text>
            <Text style={styles.helper}>Set your agency name and logo for client communications</Text>
          </View>
          <Feather name={showBranding ? 'chevron-up' : 'chevron-down'} size={18} color={theme.colors.textSecondary} />
        </Pressable>

        {showBranding ? (
          <View style={styles.brandingForm}>
            <View style={styles.autosaveRow}>
              <Text style={styles.autosaveBadgeLabel}>Brand details</Text>
              {autosaveStatus === 'saving' ? (
                <View style={styles.autosaveIndicator}>
                  <ActivityIndicator size="small" color={theme.colors.accent} />
                  <Text style={styles.autosaveSavingText}>Autosaving...</Text>
                </View>
              ) : autosaveStatus === 'saved' ? (
                <View style={styles.autosaveIndicator}>
                  <Feather name="check" size={13} color="#4ade80" />
                  <Text style={styles.autosaveSuccessText}>Saved automatically</Text>
                </View>
              ) : null}
            </View>
            <AppInput
              label="Agency or studio name"
              onChangeText={setOrganizationName}
              placeholder="e.g. PixelCraft Studio"
              value={organizationName}
            />
            <View style={styles.uploadRow}>
              <View style={styles.grow}>
                <Text style={styles.fieldLabel}>Agency logo</Text>
                <Text numberOfLines={1} style={styles.copy}>
                  {logoUrl || 'Choose a clear JPG, PNG, or WebP · max 5 MB'}
                </Text>
              </View>
              <AppButton
                loading={uploadingLogo}
                onPress={() => void uploadLogo()}
                title={logoUrl ? 'Replace logo' : 'Upload logo'}
                variant="secondary"
              />
            </View>
            <AppButton
              loading={loading}
              onPress={() => void saveProfile()}
              title={autosaveStatus === 'saved' ? 'Saved ✓' : 'Save Agency Details'}
            />
          </View>
        ) : null}
      </AppCard>

      {message ? <Text style={styles.message}>{message}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </Screen>
  );
}

function ChoiceChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={[styles.chip, selected && styles.chipSelected]}><Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  loadingScreen: { alignItems: 'center', gap: theme.spacing.md, justifyContent: 'center' },
  header: { gap: theme.spacing.xs, marginBottom: theme.spacing.lg },
  eyebrow: { color: theme.colors.accent, fontSize: theme.typography.caption, fontWeight: '900', textTransform: 'uppercase' },
  title: { color: theme.colors.text, fontSize: 29, fontWeight: '900' },
  copy: { color: theme.colors.textSecondary, fontSize: theme.typography.small, lineHeight: 20 },
  helper: { color: theme.colors.mutedText, fontSize: theme.typography.caption, lineHeight: 18 },
  card: { gap: theme.spacing.md },
  sectionTitle: { color: theme.colors.text, fontSize: theme.typography.section, fontWeight: '900', textAlign: 'center' },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: theme.spacing.lg },
  progressItem: { alignItems: 'center', flex: 1, gap: 5 },
  progressDot: { alignItems: 'center', backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.border, borderRadius: 999, borderWidth: 1, height: 30, justifyContent: 'center', width: 30 },
  progressDotActive: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
  progressNumber: { color: theme.colors.mutedText, fontSize: theme.typography.caption, fontWeight: '900' },
  progressNumberActive: { color: theme.colors.background },
  progressLabel: { color: theme.colors.mutedText, fontSize: 10, fontWeight: '700' },
  progressLabelActive: { color: theme.colors.accent },
  fieldLabel: { color: theme.colors.textSecondary, fontSize: theme.typography.small, fontWeight: '700' },
  multiline: { minHeight: 96, paddingTop: 14, textAlignVertical: 'top' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: { backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.borderSubtle, borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 9 },
  chipSelected: { backgroundColor: theme.colors.accentSoft, borderColor: theme.colors.accent },
  chipText: { color: theme.colors.textSecondary, fontSize: theme.typography.caption, fontWeight: '700' },
  chipTextSelected: { color: theme.colors.accent },
  uploadRow: { alignItems: 'center', flexDirection: 'row', gap: theme.spacing.sm },
  grow: { flex: 1 },
  questionList: { gap: theme.spacing.md },
  questionCard: { gap: theme.spacing.sm },
  questionCount: { color: theme.colors.accent, fontSize: theme.typography.caption, fontWeight: '900', textTransform: 'uppercase' },
  questionPrompt: { color: theme.colors.text, fontSize: theme.typography.body, fontWeight: '800', lineHeight: 23 },
  option: { alignItems: 'center', backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.borderSubtle, borderRadius: theme.radius.md, borderWidth: 1, flexDirection: 'row', gap: 10, padding: 13 },
  optionSelected: { backgroundColor: theme.colors.accentSoft, borderColor: theme.colors.accent },
  radio: { borderColor: theme.colors.mutedText, borderRadius: 999, borderWidth: 2, height: 18, width: 18 },
  radioSelected: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent, borderWidth: 5 },
  optionText: { color: theme.colors.textSecondary, flex: 1, fontSize: theme.typography.small, lineHeight: 20 },
  optionTextSelected: { color: theme.colors.text, fontWeight: '700' },
  reviewCard: { alignItems: 'center', gap: theme.spacing.md, paddingVertical: theme.spacing.xl },
  reviewIcon: { alignItems: 'center', backgroundColor: theme.colors.accentSoft, borderColor: theme.colors.accentBorder, borderRadius: 999, borderWidth: 1, height: 58, justifyContent: 'center', width: 58 },
  reviewIconApproved: { backgroundColor: theme.colors.accent },
  trustScore: { color: theme.colors.accent, fontSize: 44, fontWeight: '900' },
  trustLabel: { color: theme.colors.textSecondary, fontSize: theme.typography.small, fontWeight: '800' },
  connection: { alignItems: 'center', backgroundColor: theme.colors.surfaceRaised, borderRadius: theme.radius.md, flexDirection: 'row', gap: 10, padding: 12 },
  connectionTitle: { color: theme.colors.text, fontWeight: '900' },
  policyCard: { alignItems: 'flex-start', backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.borderSubtle, borderRadius: theme.radius.md, borderWidth: 1, flexDirection: 'row', gap: 11, padding: 13 },
  policyCardAccepted: { backgroundColor: theme.colors.accentSoft, borderColor: theme.colors.accentBorder },
  policyCheck: { alignItems: 'center', borderColor: theme.colors.mutedText, borderRadius: 6, borderWidth: 2, height: 22, justifyContent: 'center', marginTop: 1, width: 22 },
  policyCheckAccepted: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
  policyTitle: { color: theme.colors.text, fontSize: theme.typography.small, fontWeight: '900', marginBottom: 4 },
  closeBtn: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 19,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  channelBox: {
    backgroundColor: theme.colors.surfaceRaised,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    padding: 16,
    gap: 14,
  },
  channelBoxConnected: {
    borderColor: 'rgba(56, 189, 248, 0.4)',
    backgroundColor: 'rgba(56, 189, 248, 0.03)',
  },
  channelHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  channelIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  channelIconConnected: {
    borderColor: 'rgba(56, 189, 248, 0.45)',
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
  },
  channelTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  channelName: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusBadgeConnected: {
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.35)',
  },
  statusBadgePending: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  statusBadgeTextConnected: {
    color: '#4ade80',
  },
  statusBadgeTextPending: {
    color: theme.colors.mutedText,
  },
  channelSub: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 3,
  },
  collapsibleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitleSmall: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  brandingForm: {
    marginTop: 12,
    gap: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
  },
  autosaveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  autosaveBadgeLabel: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  autosaveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  autosaveSavingText: {
    color: theme.colors.accent,
    fontSize: 11,
    fontWeight: '700',
  },
  autosaveSuccessText: {
    color: '#4ade80',
    fontSize: 11,
    fontWeight: '700',
  },
  message: { color: theme.colors.accent, lineHeight: 20, marginTop: theme.spacing.md },
  error: { color: theme.colors.danger, lineHeight: 20, marginTop: theme.spacing.md },
});
