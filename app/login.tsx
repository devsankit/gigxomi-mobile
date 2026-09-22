import { Feather, FontAwesome5 } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { AppButton } from '@/src/components/AppButton';
import { AppInput } from '@/src/components/AppInput';
import { Screen } from '@/src/components/Screen';
import { DEFAULT_PUBLIC_AUTH_WHATSAPP_HREF } from '@/src/constants/mobileConfig';
import { theme } from '@/src/constants/theme';
import { useAutoAuthPoller, useOtpChannel, useRequestOtp, useVerifyOtp } from '@/src/hooks/useAuth';
import { openWhatsAppForOtp, type WhatsAppTarget } from '@/src/lib/whatsappLauncher';
import type { MobileOtpRequestResponse, MobileSession } from '@/src/types';

type LoginOtpRequest = Pick<MobileOtpRequestResponse, 'challengeId' | 'intentId' | 'deliveryMode' | 'message'>;

export default function LoginScreen() {
  const [phone, setPhone] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [whatsappHref, setWhatsappHref] = useState<string | null>(null);
  const [otpRequestState, setOtpRequestState] = useState<LoginOtpRequest | null>(null);
  const otpRequestRef = useRef<LoginOtpRequest | null>(null);
  const [error, setError] = useState('');
  const otpChannel = useOtpChannel();
  const requestOtp = useRequestOtp();
  const verifyOtp = useVerifyOtp();

  function goNext(session: MobileSession) {
    const hasWorkspaceAccess = session.packageStatus === 'ACTIVE' || session.role === 'SUPER_ADMIN' || session.role === 'ADMIN' || session.role === 'MANAGER';
    router.replace(hasWorkspaceAccess ? '/' : '/package');
  }

  async function handleRequestOtp(target: WhatsAppTarget = 'default') {
    setError('');
    setOtpRequestState(null);
    otpRequestRef.current = null;

    if (!phone.trim()) {
      setError('WhatsApp phone number is required.');
      return;
    }

    try {
      const response = await requestOtp.mutateAsync({ phone: phone.trim() });
      const nextRequest: LoginOtpRequest = {
        challengeId: response.challengeId ?? '',
        intentId: response.intentId ?? '',
        deliveryMode: response.deliveryMode,
        message: response.message,
      };
      otpRequestRef.current = nextRequest;
      setOtpRequestState(nextRequest);
      const href = response.whatsappHref ?? otpChannel.data?.whatsappHref ?? DEFAULT_PUBLIC_AUTH_WHATSAPP_HREF;
      setWhatsappHref(href);
      setOtpCode('');
      if (response.deliveryMode !== 'preconfigured-code') {
        await openWhatsAppForOtp(target, href);
      }
    } catch (otpError) {
      setError(otpError instanceof Error ? otpError.message : 'Could not prepare WhatsApp OTP login.');
    }
  }

  async function handleVerifyOtp() {
    setError('');

    const currentRequest = otpRequestRef.current ?? otpRequestState ?? (requestOtp.data
      ? {
          challengeId: requestOtp.data.challengeId ?? '',
          intentId: requestOtp.data.intentId ?? '',
          deliveryMode: requestOtp.data.deliveryMode,
          message: requestOtp.data.message,
        }
      : null);
    const challengeId = currentRequest?.challengeId ?? '';
    const intentId = currentRequest?.intentId ?? '';

    if ((!challengeId && !intentId && !phone.trim()) || !otpCode.trim()) {
      setError('Request OTP first, then enter the 6-digit code.');
      return;
    }

    try {
      const response = await verifyOtp.mutateAsync({
        challengeId: challengeId || undefined,
        intentId: intentId || undefined,
        phone: phone.trim() || undefined,
        code: otpCode.trim(),
      });
      goNext(response.session);
    } catch (otpError) {
      setError(otpError instanceof Error ? otpError.message : 'OTP verification failed.');
    }
  }

  const deliveryMode = otpRequestState?.deliveryMode ?? requestOtp.data?.deliveryMode ?? '';
  const otpMessage = otpRequestState?.message ?? requestOtp.data?.message ?? '';
  const intentReady = Boolean(
    otpRequestRef.current?.challengeId
      || otpRequestRef.current?.intentId
      || otpRequestState?.challengeId
      || otpRequestState?.intentId
      || requestOtp.data?.challengeId
      || requestOtp.data?.intentId,
  );

  const currentIntentId = otpRequestRef.current?.intentId || otpRequestState?.intentId || requestOtp.data?.intentId || '';

  useAutoAuthPoller({
    intentId: currentIntentId,
    phone: phone.trim(),
    enabled: intentReady && deliveryMode !== 'preconfigured-code',
    onVerified: (res) => {
      if (res.session) {
        goNext(res.session);
      }
    },
  });

  return (
    <Screen>
      <View style={styles.header}>
        <View style={styles.topBarRow}>
          <Text style={styles.eyebrow}>Gigxomi</Text>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => router.replace('/register')}
            style={styles.headerRegisterBadge}
          >
            <Text style={styles.headerRegisterBadgeText}>Sign Up ↗</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.title}>Login with WhatsApp OTP</Text>
        <Text style={styles.copy}>No password needed. Choose your WhatsApp app, send the command, then return here to sign in.</Text>
      </View>

      <View style={styles.form}>
        {!intentReady ? (
          <View style={styles.stepCard}>
            <View style={styles.stepNumber}><Text style={styles.stepNumberText}>1</Text></View>
            <View style={styles.stepBody}>
              <Text style={styles.stepTitle}>Enter your WhatsApp number</Text>
              <Text style={styles.stepCopy}>Use the same number registered with Gigxomi.</Text>
              <AppInput label="WhatsApp number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+91 98765 43210" />
              <AppButton
                title="Get OTP"
                loading={requestOtp.isPending}
                icon={<FontAwesome5 name="whatsapp" size={18} color="#05070A" />}
                onPress={() => void handleRequestOtp('chooser')}
              />
            </View>
          </View>
        ) : (
          <>
            <View style={styles.frozenCard}>
              <View style={styles.frozenTopRow}>
                <View style={styles.frozenBadgeRow}>
                  <Feather name="lock" size={12} color="#34C759" />
                  <Text style={styles.frozenBadgeText}>Screen Held &amp; Frozen</Text>
                </View>
                <TouchableOpacity
                  onPress={() => {
                    setOtpRequestState(null);
                    otpRequestRef.current = null;
                  }}
                  style={styles.changePhoneBtn}
                >
                  <Feather name="edit-2" size={12} color={theme.colors.accent} />
                  <Text style={styles.changePhoneText}>Change number</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.frozenPhoneText}>
                OTP requested for <Text style={{ color: theme.colors.text, fontWeight: '800' }}>{phone}</Text>
              </Text>
              {deliveryMode !== 'preconfigured-code' ? (
                <View style={styles.autoVerifyListeningRow}>
                  <ActivityIndicator size="small" color="#34C759" />
                  <Text style={styles.autoVerifyListeningText}>
                    Send "Get OTP" in WhatsApp and you'll log in automatically!
                  </Text>
                </View>
              ) : null}
            </View>

            <View style={styles.stepCard}>
              <View style={styles.stepNumber}><Text style={styles.stepNumberText}>2</Text></View>
              <View style={styles.stepBody}>
                <Text style={styles.stepTitle}>Return and enter the code</Text>
                <Text style={styles.stepCopy}>Enter the six-digit OTP you received. It expires shortly.</Text>
                <AppInput
                  label={deliveryMode === 'preconfigured-code' ? 'Agency access code' : '6-digit OTP'}
                  value={otpCode}
                  onChangeText={setOtpCode}
                  keyboardType="number-pad"
                  placeholder="000000"
                />
                <AppButton
                  title="Verify and login"
                  loading={verifyOtp.isPending}
                  icon={<Feather name="check" size={17} color={theme.colors.background} />}
                  onPress={handleVerifyOtp}
                />
                <TouchableOpacity
                  style={styles.resendChooserBtn}
                  activeOpacity={0.8}
                  onPress={() => void openWhatsAppForOtp('chooser', whatsappHref)}
                >
                  <FontAwesome5 name="whatsapp" size={15} color={theme.colors.accent} />
                  <Text style={styles.resendChooserText}>Resend or select WhatsApp</Text>
                  <Feather name="share-2" size={14} color={theme.colors.accent} />
                </TouchableOpacity>

                <View style={styles.directOptionsRow}>
                  <TouchableOpacity
                    style={styles.directAppPill}
                    activeOpacity={0.8}
                    onPress={() => void openWhatsAppForOtp('personal', whatsappHref)}
                  >
                    <FontAwesome5 name="whatsapp" size={13} color="#25D366" />
                    <Text style={styles.directAppPillText}>WhatsApp</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.directAppPill}
                    activeOpacity={0.8}
                    onPress={() => void openWhatsAppForOtp('business', whatsappHref)}
                  >
                    <FontAwesome5 name="whatsapp" size={13} color="#128C7E" />
                    <Text style={styles.directAppPillText}>WA Business</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </>
        )}

        {otpMessage ? <Text style={styles.success}>{otpMessage}</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {/* Clean, nicely spaced Signup Footer */}
        <View style={styles.signupFooter}>
          <Text style={styles.signupFooterPrompt}>Don’t have a Gigxomi account?</Text>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => router.replace('/register')}
            style={styles.signupFooterButton}
          >
            <Text style={styles.signupFooterButtonText}>Create New Account</Text>
            <Feather name="arrow-right" size={15} color={theme.colors.accent} />
          </TouchableOpacity>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.lg,
  },
  topBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  headerRegisterBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: theme.colors.accentSoft,
    borderColor: theme.colors.accentBorder,
    borderWidth: 1,
    borderRadius: theme.radius.pill,
  },
  headerRegisterBadgeText: {
    color: theme.colors.accent,
    fontSize: 12,
    fontWeight: '800',
  },
  eyebrow: {
    color: theme.colors.accent,
    fontSize: theme.typography.caption,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  title: {
    color: theme.colors.text,
    fontSize: theme.typography.hero,
    fontWeight: '900',
  },
  copy: {
    color: theme.colors.mutedText,
    fontSize: theme.typography.body,
    lineHeight: 20,
  },
  form: {
    gap: theme.spacing.md,
  },
  chooseSection: {
    gap: 8,
  },
  chooseLabel: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  launchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceRaised,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 12,
    borderWidth: 1.5,
    gap: theme.spacing.md,
  },
  launchBtnPersonal: {
    borderColor: '#25D366',
    backgroundColor: 'rgba(37, 211, 102, 0.08)',
  },
  launchBtnBusiness: {
    borderColor: '#128C7E',
    backgroundColor: 'rgba(18, 140, 126, 0.08)',
  },
  launchBtnChooser: {
    borderColor: theme.colors.accentBorder,
    backgroundColor: theme.colors.accentSoft,
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(37, 211, 102, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  businessCircle: {
    backgroundColor: 'rgba(18, 140, 126, 0.15)',
  },
  chooserCircle: {
    backgroundColor: 'rgba(218, 255, 1, 0.15)',
  },
  btnTextCol: {
    flex: 1,
    gap: 2,
  },
  btnMainTitle: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  btnSubTitle: {
    color: theme.colors.mutedText,
    fontSize: 11,
    fontWeight: '600',
  },
  frozenCard: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    padding: 14,
    gap: 8,
  },
  frozenTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  frozenBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(52, 199, 89, 0.12)',
    borderColor: 'rgba(52, 199, 89, 0.28)',
    borderWidth: 1,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  frozenBadgeText: {
    color: '#34C759',
    fontSize: 11,
    fontWeight: '800',
  },
  changePhoneBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  changePhoneText: {
    color: theme.colors.accent,
    fontSize: 12,
    fontWeight: '700',
  },
  frozenPhoneText: {
    color: theme.colors.mutedText,
    fontSize: 13,
  },
  autoVerifyListeningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(52, 199, 89, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 10,
  },
  autoVerifyListeningText: {
    color: '#34C759',
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
  },
  stepCard: {
    alignItems: 'flex-start',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.md,
    padding: theme.spacing.lg,
  },
  stepNumber: {
    alignItems: 'center',
    backgroundColor: theme.colors.accent,
    borderRadius: 14,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  stepNumberText: {
    color: theme.colors.background,
    fontSize: theme.typography.caption,
    fontWeight: '900',
  },
  stepBody: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  stepTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.body,
    fontWeight: '900',
  },
  stepCopy: {
    color: theme.colors.mutedText,
    fontSize: theme.typography.caption,
    lineHeight: 18,
    marginBottom: theme.spacing.xs,
  },
  resendChooserBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    marginTop: 6,
  },
  resendChooserText: {
    color: theme.colors.accent,
    fontSize: 13,
    fontWeight: '700',
  },
  directOptionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginTop: 2,
    marginBottom: 4,
  },
  directAppPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surfaceRaised,
    borderColor: theme.colors.borderSubtle,
    borderWidth: 1,
  },
  directAppPillText: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  success: {
    color: theme.colors.success,
    fontSize: theme.typography.small,
  },
  error: {
    color: theme.colors.danger,
    fontSize: theme.typography.small,
  },
  signupFooter: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.xl,
    paddingBottom: 40,
  },
  signupFooterPrompt: {
    color: theme.colors.mutedText,
    fontSize: 13,
    fontWeight: '600',
  },
  signupFooterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surfaceRaised,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  signupFooterButtonText: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
});
