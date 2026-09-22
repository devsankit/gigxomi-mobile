import { Feather, FontAwesome5 } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/src/components/AppButton';
import { AppCard } from '@/src/components/AppCard';
import { AppInput } from '@/src/components/AppInput';
import { Screen } from '@/src/components/Screen';
import { openWhatsAppForOtp } from '@/src/lib/whatsappLauncher';
import { theme } from '@/src/constants/theme';
import { apiRequest } from '@/src/lib/api';
import { useAutoAuthPoller, useConnectedSignupActivate, useConnectedSignupStart, useConnectedSignupVerify } from '@/src/hooks/useAuth';
import type { MobilePackagesResponse, MobileRegistrationPackage } from '@/src/types';

type Role = 'AGENCY' | 'FREELANCER';
type Stage = 'identity' | 'otp' | 'package';
type FieldErrors = Partial<Record<'firstName' | 'lastName' | 'email' | 'phone' | 'otp', string>>;

export default function RegisterScreen() {
  const start = useConnectedSignupStart();
  const verify = useConnectedSignupVerify();
  const activate = useConnectedSignupActivate();
  const [stage, setStage] = useState<Stage>('identity');
  const [role, setRole] = useState<Role>('AGENCY');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [intentId, setIntentId] = useState('');
  const [otp, setOtp] = useState('');
  const [whatsappHref, setWhatsappHref] = useState<string | null>(null);
  const [packages, setPackages] = useState<MobileRegistrationPackage[]>([]);
  const [packageId, setPackageId] = useState('');
  const [verifiedToken, setVerifiedToken] = useState('');
  const [billingCycle, setBillingCycle] = useState<'MONTHLY' | 'YEARLY'>('MONTHLY');
  const [planPickerOpen, setPlanPickerOpen] = useState(false);
  const [couponCode, setCouponCode] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const distributionChannel = process.env.EXPO_PUBLIC_DISTRIBUTION_CHANNEL === 'PLAY_READER' ? 'PLAY_READER' : 'DIRECT';

  useEffect(() => {
    let isMounted = true;
    const targetAudience = role === 'AGENCY' ? 'AGENCY' : 'FREELANCER';
    apiRequest<MobilePackagesResponse>('/mobile/packages')
      .then((res) => {
        if (!isMounted || !res.packages || res.packages.length === 0) return;
        const filtered = res.packages.filter((pkg) => pkg.audience === targetAudience);
        const sorted = [...filtered].sort(
          (left, right) => Number(right.isFree) - Number(left.isFree) || (left.sortOrder ?? 0) - (right.sortOrder ?? 0)
        );
        setPackages((prev) => (prev.length > 0 ? prev : sorted));
        setPackageId((prev) => (prev ? prev : sorted[0]?.id || ''));
      })
      .catch(() => undefined);
    return () => {
      isMounted = false;
    };
  }, [role, stage]);

  async function requestOtp() {
    setError('');
    setNotice('');
    const normalizedPhone = phone.replace(/\D/g, '');
    const nextErrors: FieldErrors = {};
    if (!firstName.trim()) nextErrors.firstName = 'Enter your first name.';
    if (!lastName.trim()) nextErrors.lastName = 'Enter your last name.';
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) nextErrors.email = 'Enter a valid email address or leave this blank.';
    if (normalizedPhone.length < 10 || normalizedPhone.length > 15) nextErrors.phone = 'Enter a valid 10 to 15 digit WhatsApp number.';
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    try {
      const result = await start.mutateAsync({ role, firstName: firstName.trim(), lastName: lastName.trim(), email: email.trim(), phone: phone.trim() });
      if (result.packages && result.packages.length > 0) {
        const sorted = [...result.packages].sort(
          (left, right) => Number(right.isFree) - Number(left.isFree) || (left.sortOrder ?? 0) - (right.sortOrder ?? 0)
        );
        setPackages(sorted);
        setPackageId(sorted[0]?.id || '');
      }
      setIntentId(result.intentId);
      setWhatsappHref(result.whatsappHref || null);
      setOtp('');
      setStage('otp');
      setNotice(result.message || `OTP sent through ${result.otpChannelLabel || 'Gigxomi WhatsApp'}.`);
      await openWhatsAppForOtp('chooser', result.whatsappHref || null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to start registration.');
    }
  }

  async function verifyOtp() {
    setError('');
    if (!/^\d{6}$/.test(otp.trim())) {
      setFieldErrors((current) => ({ ...current, otp: 'Enter the complete 6-digit OTP.' }));
      return;
    }
    setFieldErrors((current) => ({ ...current, otp: undefined }));
    try {
      const result = await verify.mutateAsync({ intentId, phone: phone.trim() || undefined, code: otp.trim() });
      const sortedPackages = [...result.packages].sort((left, right) => Number(right.isFree) - Number(left.isFree) || (left.sortOrder ?? 0) - (right.sortOrder ?? 0));
      setPackages(sortedPackages);
      setPackageId(sortedPackages[0]?.id || '');
      setVerifiedToken(result.token);
      setStage('package');
      setPlanPickerOpen(role === 'AGENCY');
      setNotice(role === 'FREELANCER' ? 'OTP verified. Your Freelancer plan is Free with 0% Gigxomi commission.' : 'OTP verified. Choose your Agency package.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'OTP verification failed.');
    }
  }

  useAutoAuthPoller({
    intentId,
    phone: phone.trim(),
    enabled: stage === 'otp',
    onVerified: (result) => {
      if (result.packages && result.packages.length > 0) {
        const sortedPackages = [...result.packages].sort((left, right) => Number(right.isFree) - Number(left.isFree) || (left.sortOrder ?? 0) - (right.sortOrder ?? 0));
        setPackages(sortedPackages);
        setPackageId(sortedPackages[0]?.id || '');
      }
      if (result.token) {
        setVerifiedToken(result.token);
      }
      setStage('package');
      setPlanPickerOpen(role === 'AGENCY');
      setNotice(role === 'FREELANCER' ? 'WhatsApp verified! Your Freelancer plan is Free with 0% Gigxomi commission.' : 'WhatsApp verified! Choose your Agency package.');
    },
  });

  async function activatePackage() {
    setError('');
    if (distributionChannel === 'PLAY_READER' && !selectedIsFree) {
      setNotice('This edition recognizes existing subscriptions. Choose Agency Freemium to continue setup.');
      return;
    }
    try {
      const result = await activate.mutateAsync({ packageId, couponCode: couponCode.trim() || undefined, billingCycle, verifiedToken, distributionChannel });
      if (result.nextAction === 'payment' && result.paymentUrl) {
        router.replace('/package');
        if (distributionChannel !== 'PLAY_READER') await Linking.openURL(result.paymentUrl);
        return;
      }
      router.replace('/connected-onboarding');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to activate the package.');
    }
  }

  const selectedPackage = packages.find((pkg) => pkg.id === packageId) ?? null;
  const selectedIsFree = Boolean(selectedPackage?.isFree || selectedPackage?.billingType === 'FREE' || selectedPackage?.amount === 0);
  const selectedPrice = selectedPackage
    ? billingCycle === 'YEARLY'
      ? selectedPackage.priceYearly ?? selectedPackage.amount
      : selectedPackage.priceMonthly ?? selectedPackage.amount
    : 0;

  function renderPackage(pkg: MobileRegistrationPackage) {
    const isFree = pkg.isFree || pkg.billingType === 'FREE' || pkg.amount === 0;
    const cyclePrice = billingCycle === 'YEARLY' ? pkg.priceYearly : pkg.priceMonthly;
    const priceCopy = isFree
      ? 'Free · assign chats to up to 2 distinct editors'
      : `${pkg.currency === 'INR' ? '₹' : pkg.currency} ${cyclePrice ?? pkg.amount} / ${billingCycle === 'YEARLY' ? 'year' : 'month'}`;
    return (
      <Pressable key={pkg.id} onPress={() => setPackageId(pkg.id)} style={[styles.package, packageId === pkg.id && styles.packageSelected]}>
        <View style={styles.grow}>
          <View style={styles.packageHeading}><Text style={styles.packageName}>{pkg.name}</Text>{isFree ? <Text style={styles.freePill}>FREE</Text> : null}</View>
          <Text style={styles.copy}>{role === 'FREELANCER' ? 'Free · 0% Gigxomi commission' : priceCopy}</Text>
          {pkg.featureBullets.slice(0, 3).map((feature) => <Text key={feature} style={styles.feature}>✓ {feature}</Text>)}
        </View>
        {packageId === pkg.id ? <Feather color={theme.colors.accent} name="check-circle" size={20} /> : null}
      </Pressable>
    );
  }

  return (
    <Screen>
      <View style={styles.header}>
        <View style={styles.topBarRow}>
          <Text style={styles.eyebrow}>Start growing with Gigxomi</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Already registered? Log in"
            onPress={() => router.replace('/login')}
            style={styles.headerLoginBadge}
          >
            <Text style={styles.headerLoginBadgeText}>Log in ↗</Text>
          </Pressable>
        </View>
        <Text style={styles.title}>Turn conversations into paid work</Text>
        <Text style={styles.copy}>Create your account in a few minutes. We’ll verify your WhatsApp number, help you choose the right plan, and guide you through setup. Your progress is saved automatically.</Text>
      </View>
      <View style={styles.progress}>{(['Account', 'OTP', 'Plan', 'Setup'] as const).map((label, index) => <View key={label} style={styles.progressItem}><View style={[styles.progressStep, (stage === 'identity' ? 0 : stage === 'otp' ? 1 : 2) >= index && styles.progressStepActive]} /><Text style={styles.progressLabel}>{label}</Text></View>)}</View>

      {stage === 'identity' ? (
        <AppCard style={styles.card}>
          <Text style={styles.sectionTitle}>Tell us how you’ll use Gigxomi</Text>
          <View style={styles.segment}>{(['AGENCY', 'FREELANCER'] as Role[]).map((item) => <Pressable key={item} onPress={() => setRole(item)} style={[styles.segmentButton, role === item && styles.segmentButtonActive]}><Text style={[styles.segmentText, role === item && styles.segmentTextActive]}>{item === 'AGENCY' ? 'Agency' : 'Freelancer'}</Text></Pressable>)}</View>
          <Text style={styles.rolePromise}>{role === 'AGENCY' ? 'Bring client chats, your team, and project delivery into one organized agency workspace.' : 'Build a trusted portfolio, receive agency offers, and win projects that match your skills.'}</Text>
          {role === 'FREELANCER' ? <AppButton title="Skills test & Trust Score" variant="secondary" icon={<Feather name="award" size={18} color={theme.colors.accent} />} onPress={() => router.push('/freelancer-test')} /> : null}
          <AppInput error={fieldErrors.firstName} label="Your first name" onChangeText={(value) => { setFirstName(value); setFieldErrors((current) => ({ ...current, firstName: undefined })); }} placeholder="e.g. Ankit" value={firstName} />
          <AppInput error={fieldErrors.lastName} label="Your last name" onChangeText={(value) => { setLastName(value); setFieldErrors((current) => ({ ...current, lastName: undefined })); }} placeholder="e.g. Sharma" value={lastName} />
          <AppInput autoCapitalize="none" error={fieldErrors.email} keyboardType="email-address" label="Work email (optional)" onChangeText={(value) => { setEmail(value); setFieldErrors((current) => ({ ...current, email: undefined })); }} placeholder="you@company.com" value={email} />
          <AppInput error={fieldErrors.phone} keyboardType="phone-pad" label="WhatsApp number" onChangeText={(value) => { setPhone(value); setFieldErrors((current) => ({ ...current, phone: undefined })); }} placeholder="10-digit WhatsApp number" value={phone} />
          <AppButton loading={start.isPending} onPress={requestOtp} title="Send my WhatsApp OTP" />
          <Text style={styles.privacyCopy}>We use this number to verify your account and send important workspace updates. No password is required.</Text>
        </AppCard>
      ) : null}

      {stage === 'otp' ? (
        <AppCard style={styles.card}>
          <Text style={styles.sectionTitle}>2. Verify OTP</Text>
          <Text style={styles.copy}>Enter the six-digit code sent to {phone}.</Text>
          <View style={styles.autoVerifyListeningRow}>
            <ActivityIndicator size="small" color="#34C759" />
            <Text style={styles.autoVerifyListeningText}>
              Send "Get OTP" in WhatsApp and you'll continue automatically!
            </Text>
          </View>
          <AppInput error={fieldErrors.otp} keyboardType="number-pad" label="OTP code" maxLength={6} onChangeText={(value) => { setOtp(value); setFieldErrors((current) => ({ ...current, otp: undefined })); }} placeholder="6-digit code" value={otp} />
          <AppButton loading={verify.isPending} onPress={verifyOtp} title="Verify OTP" />
          <AppButton icon={<Feather color={theme.colors.accent} name="share-2" size={16} />} onPress={() => void openWhatsAppForOtp('chooser', whatsappHref)} title="Resend or select WhatsApp" variant="secondary" />
          <View style={styles.directOptionsRow}>
            <Pressable
              style={styles.directAppPill}
              onPress={() => void openWhatsAppForOtp('personal', whatsappHref)}
            >
              <FontAwesome5 name="whatsapp" size={13} color="#25D366" />
              <Text style={styles.directAppPillText}>WhatsApp</Text>
            </Pressable>
            <Pressable
              style={styles.directAppPill}
              onPress={() => void openWhatsAppForOtp('business', whatsappHref)}
            >
              <FontAwesome5 name="whatsapp" size={13} color="#128C7E" />
              <Text style={styles.directAppPillText}>WA Business</Text>
            </Pressable>
          </View>
          <AppButton onPress={() => setStage('identity')} title="Edit identity" variant="secondary" />
        </AppCard>
      ) : null}

      {stage === 'package' ? (
        <AppCard style={styles.card}>
          <Text style={styles.sectionTitle}>3. {role === 'FREELANCER' ? 'Free Freelancer access' : 'Agency package'}</Text>
          {role === 'FREELANCER' ? <View style={styles.freeBanner}><Text style={styles.freeTitle}>FREE · 0% COMMISSION</Text><Text style={styles.copy}>Gigxomi charges no Freelancer commission. Applicable gateway or tax charges may still apply.</Text></View> : null}
          {role === 'AGENCY' ? <AppButton onPress={() => setPlanPickerOpen(true)} title={selectedPackage ? `Selected: ${selectedPackage.name}` : 'Choose Agency plan'} variant="secondary" /> : packages.map(renderPackage)}
          {!selectedIsFree ? <AppInput autoCapitalize="characters" label="Coupon code (optional)" onChangeText={setCouponCode} placeholder="Referral coupon" value={couponCode} /> : null}
          {selectedPackage && !selectedIsFree ? <Text style={styles.priceSummary}>{selectedPackage.currency === 'INR' ? '₹' : selectedPackage.currency} {selectedPrice} / {billingCycle === 'YEARLY' ? 'year' : 'month'}</Text> : null}
          {role === 'FREELANCER' ? <Text style={styles.copy}>Next: complete your profile → submit your portfolio → take your skills test and generate your Trust Score.</Text> : null}
          <AppButton
            disabled={!packageId || (distributionChannel === 'PLAY_READER' && !selectedIsFree)}
            loading={activate.isPending}
            onPress={activatePackage}
            title={
              packages.length === 0
                ? 'Loading plans...'
                : selectedIsFree
                ? role === 'FREELANCER'
                  ? 'Set up profile & unlock skills test'
                  : 'Continue to required setup'
                : distributionChannel === 'PLAY_READER'
                ? 'Refresh after web purchase'
                : `Continue with PhonePe · ${selectedPackage?.currency === 'INR' ? '₹' : selectedPackage?.currency || ''}${Number(selectedPrice || 0).toLocaleString('en-IN')}/${billingCycle === 'YEARLY' ? 'year' : 'month'}`
            }
          />
          {distributionChannel === 'PLAY_READER' && !selectedIsFree ? <Text style={styles.copy}>This Play edition recognizes an existing Gigxomi subscription but does not sell or link to external purchases. You can start with Agency Freemium now.</Text> : null}
        </AppCard>
      ) : null}

      <Modal animationType="slide" onRequestClose={() => setPlanPickerOpen(false)} transparent visible={planPickerOpen}>
        <View style={styles.modalBackdrop}><View style={styles.modalSheet}>
          <View style={styles.modalHeader}><View style={styles.grow}><Text style={styles.sectionTitle}>Choose your Agency plan</Text><Text style={styles.copy}>Freemium has no payment. Premium unlocks all features.</Text></View><Pressable accessibilityLabel="Close plan picker" onPress={() => setPlanPickerOpen(false)}><Feather color={theme.colors.text} name="x" size={24} /></Pressable></View>
          <View style={styles.segment}>{(['MONTHLY', 'YEARLY'] as const).map((cycle) => <Pressable key={cycle} onPress={() => setBillingCycle(cycle)} style={[styles.segmentButton, billingCycle === cycle && styles.segmentButtonActive]}><Text style={[styles.segmentText, billingCycle === cycle && styles.segmentTextActive]}>{cycle === 'MONTHLY' ? 'Monthly' : `Yearly · Save ₹${Math.max(0, Number(packages.find((pkg) => !pkg.isFree)?.priceMonthly ?? 0) * 12 - Number(packages.find((pkg) => !pkg.isFree)?.priceYearly ?? 0)).toLocaleString('en-IN')}`}</Text></Pressable>)}</View>
          {packages.length === 0 ? (
            <View style={{ paddingVertical: 32, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator size="small" color={theme.colors.accent} />
              <Text style={[styles.copy, { marginTop: 10 }]}>Loading available plans...</Text>
            </View>
          ) : (
            packages.map(renderPackage)
          )}
          <AppButton disabled={!packageId} onPress={() => setPlanPickerOpen(false)} title={packages.length === 0 ? 'Loading plans...' : 'Use selected plan'} />
        </View></View>
      </Modal>

      {notice ? <Text style={styles.success}>{notice}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {/* Redesigned clean and properly spaced Login link */}
      <View style={styles.loginFooter}>
        <Text style={styles.loginFooterPrompt}>Already registered with Gigxomi?</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Log in to your existing account"
          onPress={() => router.replace('/login')}
          style={styles.loginFooterButton}
        >
          <Text style={styles.loginFooterButtonText}>Log In to Your Account</Text>
          <Feather name="arrow-right" size={15} color={theme.colors.accent} />
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: theme.spacing.xs, marginBottom: theme.spacing.md },
  topBarRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  headerLoginBadge: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: theme.colors.accentSoft, borderColor: theme.colors.accentBorder, borderWidth: 1, borderRadius: theme.radius.pill },
  headerLoginBadgeText: { color: theme.colors.accent, fontSize: 12, fontWeight: '800' },
  eyebrow: { color: theme.colors.accent, fontSize: theme.typography.caption, fontWeight: '900', textTransform: 'uppercase' },
  title: { color: theme.colors.text, fontSize: 29, fontWeight: '900' }, copy: { color: theme.colors.textSecondary, fontSize: theme.typography.small, lineHeight: 20 },
  progress: { flexDirection: 'row', gap: 6, marginBottom: theme.spacing.lg }, progressItem: { flex: 1, gap: 5 }, progressStep: { backgroundColor: theme.colors.surfaceRaised, borderRadius: 4, height: 6 }, progressStepActive: { backgroundColor: theme.colors.accent }, progressLabel: { color: theme.colors.mutedText, fontSize: 10, fontWeight: '700', textAlign: 'center' },
  card: { gap: theme.spacing.md }, sectionTitle: { color: theme.colors.text, fontSize: theme.typography.section, fontWeight: '900' }, segment: { flexDirection: 'row', gap: 8 },
  rolePromise: { backgroundColor: theme.colors.surfaceRaised, borderRadius: theme.radius.sm, color: theme.colors.textSecondary, fontSize: theme.typography.small, lineHeight: 20, padding: 12 }, privacyCopy: { color: theme.colors.mutedText, fontSize: theme.typography.caption, lineHeight: 18, textAlign: 'center' },
  segmentButton: { alignItems: 'center', backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.borderSubtle, borderRadius: theme.radius.md, borderWidth: 1, flex: 1, padding: 13 }, segmentButtonActive: { backgroundColor: theme.colors.accentSoft, borderColor: theme.colors.accentBorder },
  segmentText: { color: theme.colors.mutedText, fontWeight: '900' }, segmentTextActive: { color: theme.colors.accent }, freeBanner: { backgroundColor: theme.colors.accentSoft, borderColor: theme.colors.accentBorder, borderRadius: theme.radius.md, borderWidth: 1, gap: 5, padding: 14 }, freeTitle: { color: theme.colors.accent, fontSize: 17, fontWeight: '900' },
  package: { alignItems: 'center', backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.borderSubtle, borderRadius: theme.radius.md, borderWidth: 1, flexDirection: 'row', gap: 10, padding: 14 }, packageSelected: { borderColor: theme.colors.accent }, grow: { flex: 1 }, packageName: { color: theme.colors.text, fontWeight: '900' },
  packageHeading: { alignItems: 'center', flexDirection: 'row', gap: 8 }, freePill: { backgroundColor: theme.colors.accent, borderRadius: 999, color: theme.colors.background, fontSize: 10, fontWeight: '900', overflow: 'hidden', paddingHorizontal: 7, paddingVertical: 3 }, feature: { color: theme.colors.textSecondary, fontSize: theme.typography.caption, lineHeight: 18, marginTop: 4 }, priceSummary: { color: theme.colors.accent, fontSize: 18, fontWeight: '900', textAlign: 'center' },
  modalBackdrop: { backgroundColor: 'rgba(0,0,0,0.72)', flex: 1, justifyContent: 'flex-end' }, modalSheet: { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, gap: theme.spacing.md, maxHeight: '90%', padding: theme.spacing.lg }, modalHeader: { alignItems: 'flex-start', flexDirection: 'row', gap: 12 },
  loginFooter: { alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: theme.spacing.md, marginBottom: theme.spacing.xl, paddingBottom: 40 },
  loginFooterPrompt: { color: theme.colors.mutedText, fontSize: 13, fontWeight: '600' },
  loginFooterButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20, paddingVertical: 12, borderRadius: theme.radius.pill, backgroundColor: theme.colors.surfaceRaised, borderWidth: 1, borderColor: theme.colors.borderSubtle },
  loginFooterButtonText: { color: theme.colors.text, fontSize: 14, fontWeight: '800' },
  directOptionsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 4, marginBottom: 4 },
  directAppPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: theme.radius.pill, backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.borderSubtle, borderWidth: 1 },
  directAppPillText: { color: theme.colors.textSecondary, fontSize: 12, fontWeight: '700' },
  autoVerifyListeningRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(52, 199, 89, 0.12)', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, marginTop: 4, marginBottom: 4 },
  autoVerifyListeningText: { color: '#34C759', fontSize: 12, fontWeight: '700', flex: 1 },
  success: { color: theme.colors.success, fontSize: theme.typography.small, marginTop: theme.spacing.md }, error: { color: theme.colors.danger, fontSize: theme.typography.small, marginTop: theme.spacing.md },
});
