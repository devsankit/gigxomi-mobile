import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/src/components/AppButton';
import { BrandedRefreshControl } from '@/src/components/BrandedRefreshControl';
import { AppCard } from '@/src/components/AppCard';
import { GigxomiHeader } from '@/src/components/GigxomiHeader';
import { Screen } from '@/src/components/Screen';
import { theme } from '@/src/constants/theme';
import { ApiError } from '@/src/lib/api';
import { usePackages, useSubscribePackage } from '@/src/hooks/usePackages';
import { useRefreshOnFocus } from '@/src/hooks/useRefreshOnFocus';
import { useSubscriptionStatus } from '@/src/hooks/useSubscriptionStatus';
import { useAuth } from '@/src/hooks/useAuth';
import { openWhatsAppChat } from '@/src/lib/whatsappLauncher';
import type { MobileRegistrationPackage } from '@/src/types';

const OFFICIAL_BILLING_WHATSAPP = '919993328124';

export default function PackageScreen() {
  const auth = useAuth();
  const authoritativeAudience =
    auth.session?.packageAudience ??
    (auth.session?.role === 'ADMIN' || auth.session?.role === 'MANAGER'
      ? 'AGENCY'
      : auth.session?.role === 'FREELANCER'
      ? 'FREELANCER'
      : null);
  const packagesQuery = usePackages(auth.session?.userId, authoritativeAudience);
  const subscriptionQuery = useSubscriptionStatus(auth.session?.userId, authoritativeAudience);
  const subscribeMutation = useSubscribePackage();

  const [billingCycle, setBillingCycle] = useState<'MONTHLY' | 'YEARLY'>('MONTHLY');
  const [upgradingToFreemium, setUpgradingToFreemium] = useState(false);

  const isCurrentlyPremium = Boolean(
    subscriptionQuery.data?.active &&
      subscriptionQuery.data?.entitlementState === 'PREMIUM_ACTIVE' &&
      !auth.session?.packageId?.toLowerCase().includes('freemium'),
  );

  const allPackages = packagesQuery.data?.packages ?? [];

  const agencyPremiumPkg = useMemo(
    () => allPackages.find((pkg) => pkg.audience === 'AGENCY' && !pkg.isFree && pkg.slug?.includes('premium')) ?? null,
    [allPackages],
  );

  const agencyFreemiumPkg = useMemo(
    () =>
      allPackages.find(
        (pkg) => pkg.audience === 'AGENCY' && (pkg.isFree || pkg.slug?.toLowerCase().includes('freemium')),
      ) ?? null,
    [allPackages],
  );

  const isSuperAdminBypass = subscriptionQuery.data?.reason === 'SUPER_ADMIN_BYPASS';
  const refreshing = packagesQuery.isFetching || subscriptionQuery.isFetching;

  const yearlySaving = useMemo(() => {
    if (agencyPremiumPkg?.priceMonthly && agencyPremiumPkg?.priceYearly) {
      return Math.max(0, agencyPremiumPkg.priceMonthly * 12 - agencyPremiumPkg.priceYearly);
    }
    return 6300;
  }, [agencyPremiumPkg]);

  const premiumPriceLabel =
    billingCycle === 'YEARLY'
      ? agencyPremiumPkg?.priceYearly
        ? `₹${agencyPremiumPkg.priceYearly.toLocaleString('en-IN')}/year`
        : '₹17,700/year'
      : agencyPremiumPkg?.priceMonthly
      ? `₹${agencyPremiumPkg.priceMonthly.toLocaleString('en-IN')}/month`
      : '₹2,000/month';

  useRefreshOnFocus(packagesQuery.refetch);
  useRefreshOnFocus(subscriptionQuery.refetch, true);

  useEffect(() => {
    if (!auth.sessionExpired) return;
    void auth.logout().finally(() => router.replace('/login'));
  }, [auth.sessionExpired]);

  async function handleContinueFreelancer() {
    router.replace('/(tabs)/dashboard');
  }

  async function handleUpgradeToFreemium() {
    setUpgradingToFreemium(true);
    try {
      const targetPkg = agencyFreemiumPkg?.id || 'pkg-agency-freemium';
      await subscribeMutation.mutateAsync({
        packageId: targetPkg,
        billingCycle: 'MONTHLY',
        distributionChannel: 'DIRECT',
      });
      router.replace('/(tabs)/dashboard');
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await auth.logout();
        router.replace('/login');
      }
    } finally {
      setUpgradingToFreemium(false);
    }
  }

  async function handleConnectWhatsAppPremium(customPrefix?: string) {
    const cycleLabel = billingCycle === 'YEARLY' ? 'Yearly' : 'Monthly';
    const prefix = customPrefix || `Hi Gigxomi Team, I would like to activate Agency Premium (${cycleLabel} - ${premiumPriceLabel}) for my workspace.`;
    const message = `${prefix} Please assist with payment and instant activation.`;
    await openWhatsAppChat(OFFICIAL_BILLING_WHATSAPP, message, 'chooser');
  }

  return (
    <Screen
      refreshControl={
        <BrandedRefreshControl
          tintColor={theme.colors.accent}
          refreshing={refreshing}
          onRefresh={() => {
            void packagesQuery.refetch();
            void subscriptionQuery.refetch();
          }}
        />
      }
    >
      <GigxomiHeader />

      {/* FREELANCER VIEW */}
      {authoritativeAudience === 'FREELANCER' ? (
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.eyebrow}>Setup 3 of 4 · Plan</Text>
            <Text style={styles.title}>Freelancer access is free</Text>
            <Text style={styles.copy}>
              Show clients what you do best. Complete your profile, add your portfolio, and take your skills assessment.
            </Text>
          </View>

          {/* Active Freelancer Plan Card */}
          <AppCard style={[styles.packageCard, styles.packageCardSelected]}>
            <View style={styles.packageTop}>
              <View style={styles.packageTitleBlock}>
                <Text style={styles.audience}>FREELANCER</Text>
                <Text style={styles.packageName}>Freelancer Starter</Text>
                <Text style={styles.packageSubtitle}>0% Commission · Free Forever</Text>
              </View>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>Active Plan</Text>
              </View>
            </View>

            <View style={styles.priceRow}>
              <Text style={styles.price}>Free</Text>
              <Text style={styles.billing}>0% commission on earnings</Text>
            </View>

            <View style={styles.featureRow}>
              <Feather name="check" size={15} color={theme.colors.accent} />
              <Text style={styles.featureText}>Skills Assessment & Verified Trust Score</Text>
            </View>
            <View style={styles.featureRow}>
              <Feather name="check" size={15} color={theme.colors.accent} />
              <Text style={styles.featureText}>Direct client messaging & delivery tracking</Text>
            </View>
            <View style={styles.featureRow}>
              <Feather name="check" size={15} color={theme.colors.accent} />
              <Text style={styles.featureText}>Discover client projects & apply with portfolio</Text>
            </View>

            <View style={{ marginTop: theme.spacing.sm }}>
              <AppButton
                title="Continue with Free Freelancer Plan →"
                onPress={handleContinueFreelancer}
              />
            </View>
          </AppCard>

          {/* Agency Upgrade Section */}
          <View style={styles.agencyUpgradeHeader}>
            <Text style={styles.sectionTitle}>Want to scale as an Agency?</Text>
            <Text style={styles.copy}>
              You can upgrade from Freelancer to Agency plan for Free, or get Agency Premium for full team scaling.
            </Text>
          </View>

          {/* Card A: Upgrade to Agency Freemium for Free */}
          <AppCard style={styles.packageCard}>
            <View style={styles.packageTop}>
              <View style={styles.packageTitleBlock}>
                <Text style={styles.audience}>AGENCY UPGRADE</Text>
                <Text style={styles.packageName}>Agency Freemium</Text>
                <Text style={styles.packageSubtitle}>Free upgrade · 30 days trial</Text>
              </View>
              <View style={[styles.badge, { backgroundColor: 'rgba(255,255,255,0.08)', borderColor: theme.colors.border }]}>
                <Text style={[styles.badgeText, { color: theme.colors.textSecondary }]}>Free Upgrade</Text>
              </View>
            </View>

            <View style={styles.priceRow}>
              <Text style={styles.price}>₹0</Text>
              <Text style={styles.billing}>Free upgrade for Freelancers</Text>
            </View>

            <View style={styles.limitRow}>
              <Feather name="users" size={15} color={theme.colors.accent} />
              <Text style={styles.limitText}>Assign chats to up to 2 editors</Text>
            </View>

            <View style={styles.featureRow}>
              <Feather name="check" size={15} color={theme.colors.accent} />
              <Text style={styles.featureText}>Video editor directory & discovery</Text>
            </View>
            <View style={styles.featureRow}>
              <Feather name="check" size={15} color={theme.colors.accent} />
              <Text style={styles.featureText}>Agency workspace & team delivery tools</Text>
            </View>

            <View style={{ marginTop: theme.spacing.sm }}>
              <AppButton
                title="Upgrade to Agency Freemium (Free) →"
                variant="secondary"
                loading={upgradingToFreemium}
                onPress={handleUpgradeToFreemium}
              />
            </View>
          </AppCard>

          {/* Card B: Upgrade to Agency Premium */}
          <AppCard style={styles.packageCard}>
            <View style={styles.packageTop}>
              <View style={styles.packageTitleBlock}>
                <Text style={styles.audience}>AGENCY SCALE</Text>
                <Text style={styles.packageName}>Agency Premium</Text>
                <Text style={styles.packageSubtitle}>Unlimited assignments & managers</Text>
              </View>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>Full Power</Text>
              </View>
            </View>

            {/* Monthly / Yearly Switch */}
            <View style={styles.cycleSwitch}>
              <Pressable onPress={() => setBillingCycle('MONTHLY')} style={[styles.cycleButton, billingCycle === 'MONTHLY' && styles.cycleButtonActive]}>
                <Text style={[styles.cycleButtonText, billingCycle === 'MONTHLY' && styles.cycleButtonTextActive]}>Monthly</Text>
              </Pressable>
              <Pressable onPress={() => setBillingCycle('YEARLY')} style={[styles.cycleButton, billingCycle === 'YEARLY' && styles.cycleButtonActive]}>
                <Text style={[styles.cycleButtonText, billingCycle === 'YEARLY' && styles.cycleButtonTextActive]}>
                  Yearly · Save ₹{yearlySaving.toLocaleString('en-IN')}
                </Text>
              </Pressable>
            </View>

            <View style={styles.priceRow}>
              <Text style={styles.price}>{billingCycle === 'YEARLY' ? '₹17,700' : '₹2,000'}</Text>
              <Text style={styles.billing}>{billingCycle === 'YEARLY' ? 'per year' : 'per month'}</Text>
            </View>

            <View style={[styles.limitRow, styles.premiumHighlightRow]}>
              <Feather name="shield" size={16} color={theme.colors.accent} />
              <Text style={[styles.limitText, { color: theme.colors.accent, fontWeight: '900' }]}>
                Includes Operations Managers & Unlimited Assignments
              </Text>
            </View>

            <View style={styles.featureRow}>
              <Feather name="check" size={15} color={theme.colors.accent} />
              <Text style={styles.featureText}>Unlimited active editor assignments across all projects</Text>
            </View>
            <View style={styles.featureRow}>
              <Feather name="check" size={15} color={theme.colors.accent} />
              <Text style={[styles.featureText, { color: theme.colors.accent, fontWeight: '800' }]}>
                Provision Operations & Dispatch Manager accounts
              </Text>
            </View>
            <View style={styles.featureRow}>
              <Feather name="check" size={15} color={theme.colors.accent} />
              <Text style={styles.featureText}>Multi-editor WhatsApp & Instagram chat routing</Text>
            </View>
            <View style={styles.featureRow}>
              <Feather name="check" size={15} color={theme.colors.accent} />
              <Text style={styles.featureText}>Automation, analytics, and priority agency support</Text>
            </View>

            <View style={{ marginTop: theme.spacing.sm }}>
              <AppButton
                title={`Upgrade to Agency Premium (${premiumPriceLabel}) →`}
                variant="primary"
                onPress={() => handleConnectWhatsAppPremium('Hi Gigxomi Team, I am a Freelancer and would like to upgrade to Agency Premium.')}
              />
              <Text style={styles.footerNote}>
                Tap above to connect with our official agency billing team on WhatsApp (+91 9993328124) for instant activation.
              </Text>
            </View>
          </AppCard>
        </View>
      ) : (
        /* AGENCY VIEW */
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.eyebrow}>Setup 3 of 4 · Plan</Text>
            <Text style={styles.title}>Choose your Agency plan</Text>
            <Text style={styles.copy}>
              Scale your creative agency desk, add operations managers, and unlock editor assignments.
            </Text>
          </View>

          {isCurrentlyPremium ? (
            <AppCard style={styles.statusCard}>
              <Text style={styles.statusTitle}>Active Package</Text>
              <Text style={styles.statusCopy}>
                {isSuperAdminBypass
                  ? 'Super admin access is active without package payment.'
                  : 'Agency Premium is active on your workspace.'}
              </Text>
              <AppButton title="Continue to dashboard" variant="secondary" onPress={() => router.replace('/')} />
            </AppCard>
          ) : null}

          {/* Card 1: Agency Freemium */}
          <AppCard style={styles.packageCard}>
            <View style={styles.packageTop}>
              <View style={styles.packageTitleBlock}>
                <Text style={styles.audience}>AGENCY STARTER</Text>
                <Text style={styles.packageName}>Agency Freemium</Text>
                <Text style={styles.packageSubtitle}>Start free · 30 days trial</Text>
              </View>
              <View style={[styles.badge, { backgroundColor: 'rgba(255,255,255,0.08)', borderColor: theme.colors.border }]}>
                <Text style={[styles.badgeText, { color: theme.colors.textSecondary }]}>30 days free</Text>
              </View>
            </View>

            <View style={styles.priceRow}>
              <Text style={styles.price}>₹0</Text>
              <Text style={styles.billing}>30 days trial access</Text>
            </View>

            <View style={styles.limitRow}>
              <Feather name="users" size={15} color={theme.colors.accent} />
              <Text style={styles.limitText}>Assign chats to up to 2 editors</Text>
            </View>

            <View style={styles.featureRow}>
              <Feather name="check" size={15} color={theme.colors.accent} />
              <Text style={styles.featureText}>Access to video editor directory & discovery</Text>
            </View>
            <View style={styles.featureRow}>
              <Feather name="check" size={15} color={theme.colors.accent} />
              <Text style={styles.featureText}>Standard agency workspace & delivery desk</Text>
            </View>

            <View style={{ marginTop: theme.spacing.sm }}>
              <AppButton
                title="Start with Agency Freemium (Free) →"
                variant="secondary"
                loading={upgradingToFreemium}
                onPress={handleUpgradeToFreemium}
              />
            </View>
          </AppCard>

          {/* Card 2: Agency Premium */}
          <AppCard style={[styles.packageCard, styles.packageCardSelected]}>
            <View style={styles.packageTop}>
              <View style={styles.packageTitleBlock}>
                <Text style={styles.audience}>AGENCY SCALE</Text>
                <Text style={styles.packageName}>Agency Premium</Text>
                <Text style={styles.packageSubtitle}>Unlimited assignments & managers</Text>
              </View>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>Recommended</Text>
              </View>
            </View>

            {/* Monthly / Yearly Switch */}
            <View style={styles.cycleSwitch}>
              <Pressable onPress={() => setBillingCycle('MONTHLY')} style={[styles.cycleButton, billingCycle === 'MONTHLY' && styles.cycleButtonActive]}>
                <Text style={[styles.cycleButtonText, billingCycle === 'MONTHLY' && styles.cycleButtonTextActive]}>Monthly</Text>
              </Pressable>
              <Pressable onPress={() => setBillingCycle('YEARLY')} style={[styles.cycleButton, billingCycle === 'YEARLY' && styles.cycleButtonActive]}>
                <Text style={[styles.cycleButtonText, billingCycle === 'YEARLY' && styles.cycleButtonTextActive]}>
                  Yearly · Save ₹{yearlySaving.toLocaleString('en-IN')}
                </Text>
              </Pressable>
            </View>

            <View style={styles.priceRow}>
              <Text style={styles.price}>{billingCycle === 'YEARLY' ? '₹17,700' : '₹2,000'}</Text>
              <Text style={styles.billing}>{billingCycle === 'YEARLY' ? 'per year' : 'per month'}</Text>
            </View>

            <View style={[styles.limitRow, styles.premiumHighlightRow]}>
              <Feather name="shield" size={16} color={theme.colors.accent} />
              <Text style={[styles.limitText, { color: theme.colors.accent, fontWeight: '900' }]}>
                Includes Operations Managers & Unlimited Assignments
              </Text>
            </View>

            <View style={styles.featureRow}>
              <Feather name="check" size={15} color={theme.colors.accent} />
              <Text style={styles.featureText}>Unlimited active editor assignments across all projects</Text>
            </View>
            <View style={styles.featureRow}>
              <Feather name="check" size={15} color={theme.colors.accent} />
              <Text style={[styles.featureText, { color: theme.colors.accent, fontWeight: '800' }]}>
                Provision Operations & Dispatch Manager accounts
              </Text>
            </View>
            <View style={styles.featureRow}>
              <Feather name="check" size={15} color={theme.colors.accent} />
              <Text style={styles.featureText}>Multi-editor WhatsApp & Instagram chat routing</Text>
            </View>
            <View style={styles.featureRow}>
              <Feather name="check" size={15} color={theme.colors.accent} />
              <Text style={styles.featureText}>Automation, analytics, and priority agency support</Text>
            </View>

            <View style={{ marginTop: theme.spacing.sm }}>
              <AppButton
                title={`Upgrade to Agency Premium (${premiumPriceLabel}) →`}
                variant="primary"
                onPress={() => handleConnectWhatsAppPremium()}
              />
              <Text style={styles.footerNote}>
                Tap above to connect with our official agency billing team on WhatsApp (+91 9993328124) for instant activation.
              </Text>
            </View>
          </AppCard>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: theme.spacing.md,
    paddingBottom: 60,
  },
  agencyUpgradeHeader: {
    gap: 4,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.xs,
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: '900',
  },
  header: {
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.lg,
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
    color: theme.colors.mutedText,
    fontSize: theme.typography.small,
    lineHeight: 19,
  },
  statusCard: {
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.md,
  },
  statusTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.body,
    fontWeight: '900',
  },
  statusCopy: {
    color: theme.colors.mutedText,
    fontSize: theme.typography.small,
    lineHeight: 19,
  },
  notice: {
    color: theme.colors.mutedText,
    fontSize: theme.typography.small,
    marginBottom: theme.spacing.md,
  },
  error: {
    color: theme.colors.danger,
    fontSize: theme.typography.small,
    lineHeight: 19,
    marginTop: theme.spacing.sm,
  },
  packageList: {
    gap: theme.spacing.md,
  },
  cycleSwitch: {
    alignSelf: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    padding: 4,
    marginBottom: 4,
  },
  cycleButton: {
    borderRadius: 999,
    minWidth: 112,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 10,
  },
  cycleButtonActive: {
    backgroundColor: theme.colors.accent,
  },
  cycleButtonText: {
    color: theme.colors.mutedText,
    fontSize: theme.typography.small,
    fontWeight: '800',
    textAlign: 'center',
  },
  cycleButtonTextActive: {
    color: theme.colors.background,
    fontWeight: '900',
  },
  packageCard: {
    gap: theme.spacing.md,
    borderWidth: 1.5,
  },
  packageCardSelected: {
    borderColor: theme.colors.accentBorder,
    backgroundColor: theme.colors.accentSoft,
  },
  packageTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  packageTitleBlock: {
    flex: 1,
    gap: 4,
  },
  audience: {
    color: theme.colors.accent,
    fontSize: theme.typography.caption,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  packageName: {
    color: theme.colors.text,
    fontSize: theme.typography.title,
    fontWeight: '900',
  },
  packageSubtitle: {
    color: theme.colors.mutedText,
    fontSize: theme.typography.small,
    lineHeight: 18,
  },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.accentBorder,
    backgroundColor: theme.colors.accentSoft,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 5,
  },
  badgeText: {
    color: theme.colors.accent,
    fontSize: theme.typography.caption,
    fontWeight: '900',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: theme.spacing.sm,
  },
  price: {
    color: theme.colors.text,
    fontSize: 28,
    fontWeight: '900',
  },
  billing: {
    color: theme.colors.mutedText,
    fontSize: theme.typography.caption,
    paddingBottom: 4,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
  },
  limitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceSoft,
    padding: theme.spacing.sm,
  },
  premiumHighlightRow: {
    backgroundColor: 'rgba(185, 247, 25, 0.12)',
    borderColor: theme.colors.accentBorder,
    borderWidth: 1,
  },
  limitText: {
    flex: 1,
    color: theme.colors.text,
    fontSize: theme.typography.small,
    fontWeight: '800',
  },
  featureText: {
    flex: 1,
    color: theme.colors.text,
    fontSize: theme.typography.small,
    lineHeight: 18,
  },
  actions: {
    gap: theme.spacing.sm,
    marginTop: theme.spacing.lg,
    paddingBottom: 60,
  },
  footerNote: {
    color: theme.colors.mutedText,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 17,
    marginTop: 4,
  },
});
