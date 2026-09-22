import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';

import { AppButton } from '@/src/components/AppButton';
import { BrandedRefreshControl } from '@/src/components/BrandedRefreshControl';
import { Screen } from '@/src/components/Screen';
import { theme } from '@/src/constants/theme';
import { useAuth } from '@/src/hooks/useAuth';
import { useFreelancerReferral } from '@/src/hooks/useReferral';
import { useRefreshOnFocus } from '@/src/hooks/useRefreshOnFocus';

function formatCurrency(value?: number | null) {
  return `₹${Math.round(value || 0).toLocaleString('en-IN')}`;
}

function formatDate(value?: string | null) {
  if (!value) return 'Recently';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recently';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function ReferralScreen() {
  const router = useRouter();
  const auth = useAuth();
  const isFreelancer = auth.session?.role === 'FREELANCER' || auth.session?.role === 'SUPER_ADMIN';
  const referralQuery = useFreelancerReferral(isFreelancer);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  useRefreshOnFocus(referralQuery.refetch, isFreelancer);

  const data = referralQuery.data;
  const metrics = data?.metrics;
  const playStoreUrl =
    data?.playStoreUrl ||
    `https://play.google.com/store/apps/details?id=com.gigxomi.app&referrer=ref%3D${encodeURIComponent(data?.referralCode || '')}`;

  const handleCopyLink = async () => {
    await Clipboard.setStringAsync(playStoreUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleCopyCode = async () => {
    if (data?.referralCode) {
      await Clipboard.setStringAsync(data.referralCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2500);
    }
  };

  const handleShare = async () => {
    try {
      await Share.share({
        title: 'Join Gigxomi for Agency Video Production',
        message: `Join Gigxomi — the dedicated platform for video production agencies and high-trust editors. Install the app: ${playStoreUrl} or use referral code: ${data?.referralCode || ''}`,
      });
    } catch {
      // User cancelled share
    }
  };

  return (
    <Screen
      scroll
      contentStyle={styles.container}
      refreshControl={
        <BrandedRefreshControl
          refreshing={referralQuery.isFetching}
          onRefresh={() => void referralQuery.refetch()}
          tintColor={theme.colors.accentStrong}
        />
      }
    >
      {/* Navigation Header */}
      <View style={styles.navHeader}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
        >
          <Feather name="arrow-left" size={20} color={theme.colors.text} />
        </Pressable>
        <View style={styles.navTitleWrap}>
          <Text style={styles.navTitle}>Refer & Earn</Text>
          <Text style={styles.navSubtitle}>Agency Partner Program</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {referralQuery.isLoading && !data ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.accentStrong} />
          <Text style={styles.loadingText}>Loading referral program details...</Text>
        </View>
      ) : (
        <>
          {/* Hero Commission Highlight Card */}
          <View style={styles.heroCard}>
            <View style={styles.heroBadge}>
              <Feather name="gift" size={14} color="#000" />
              <Text style={styles.heroBadgeText}>10% RECURRING COMMISSION</Text>
            </View>
            <Text style={styles.heroTitle}>Invite Agencies & Earn 10%</Text>
            <Text style={styles.heroDescription}>
              Earn flat 10% recurring commission on every Monthly or Yearly Agency Premium Plan purchased by agencies you refer.
              Commissions are credited directly to your Gigxomi wallet!
            </Text>
            <View style={styles.heroHighlightRow}>
              <View style={styles.highlightPill}>
                <Feather name="check-circle" size={14} color={theme.colors.success} />
                <Text style={styles.highlightPillText}>Monthly & Yearly Plans</Text>
              </View>
              <View style={styles.highlightPill}>
                <Feather name="check-circle" size={14} color={theme.colors.success} />
                <Text style={styles.highlightPillText}>Direct Wallet Credit</Text>
              </View>
            </View>
          </View>

          {/* Share Box & Actions */}
          <View style={styles.shareCard}>
            <Text style={styles.sectionTitle}>Your Referral Links</Text>

            {/* Referral Code Row */}
            <View style={styles.codeRow}>
              <View style={styles.codeWrap}>
                <Text style={styles.codeLabel}>Referral Code</Text>
                <Text style={styles.codeValue}>{data?.referralCode || 'GXEDITOR'}</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={handleCopyCode}
                style={({ pressed }) => [styles.copySmallButton, pressed && styles.pressed]}
              >
                <Feather name={copiedCode ? 'check' : 'copy'} size={15} color={theme.colors.accentStrong} />
                <Text style={styles.copySmallText}>{copiedCode ? 'Copied' : 'Copy Code'}</Text>
              </Pressable>
            </View>

            {/* Play Store Link Row */}
            <View style={styles.linkContainer}>
              <View style={styles.linkLabelRow}>
                <Feather name="play" size={14} color={theme.colors.accentStrong} />
                <Text style={styles.linkLabel}>Google Play Store Download Link</Text>
              </View>
              <Text numberOfLines={2} style={styles.linkText}>
                {playStoreUrl}
              </Text>
            </View>

            {/* Buttons */}
            <View style={styles.buttonRow}>
              <View style={{ flex: 1 }}>
                <AppButton
                  title={copiedLink ? 'Link Copied!' : 'Copy Play Store Link'}
                  icon={<Feather name={copiedLink ? 'check' : 'copy'} size={16} color={theme.colors.background} />}
                  variant="primary"
                  onPress={() => void handleCopyLink()}
                />
              </View>
              <View style={{ minWidth: 100 }}>
                <AppButton
                  title="Share"
                  icon={<Feather name="share-2" size={16} color={theme.colors.text} />}
                  variant="secondary"
                  onPress={() => void handleShare()}
                />
              </View>
            </View>
          </View>

          {/* Metrics 2x2 Grid */}
          <View style={styles.metricsGrid}>
            <View style={styles.metricCard}>
              <View style={styles.metricIconWrap}>
                <Feather name="dollar-sign" size={18} color={theme.colors.success} />
              </View>
              <Text style={styles.metricValue}>
                {formatCurrency(metrics?.totalCommissionEarned)}
              </Text>
              <Text style={styles.metricLabel}>Total Commission Earned</Text>
            </View>

            <View style={styles.metricCard}>
              <View style={styles.metricIconWrap}>
                <Feather name="shield" size={18} color={theme.colors.accentStrong} />
              </View>
              <Text style={styles.metricValue}>
                {metrics?.activeSubscribers ?? 0}
              </Text>
              <Text style={styles.metricLabel}>Active Subscribers</Text>
            </View>

            <View style={styles.metricCard}>
              <View style={styles.metricIconWrap}>
                <Feather name="users" size={18} color={theme.colors.text} />
              </View>
              <Text style={styles.metricValue}>
                {metrics?.registeredAgencies ?? 0}
              </Text>
              <Text style={styles.metricLabel}>Agencies Registered</Text>
            </View>

            <View style={styles.metricCard}>
              <View style={styles.metricIconWrap}>
                <Feather name="mouse-pointer" size={18} color={theme.colors.mutedText} />
              </View>
              <Text style={styles.metricValue}>
                {metrics?.clicks ?? 0}
              </Text>
              <Text style={styles.metricLabel}>Link Clicks</Text>
            </View>
          </View>

          {/* Sales Partner Attribution (if applicable) */}
          {data?.salesAttribution ? (
            <View style={styles.salesAttributionCard}>
              <Feather name="link-2" size={18} color={theme.colors.accentStrong} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.salesAttributionTitle}>Connected Sales Partner Active</Text>
                <Text style={styles.salesAttributionSubtitle}>
                  Referred by {data.salesAttribution.referredBySalesAgent} · 10% Multi-tier Commission enabled
                </Text>
              </View>
            </View>
          ) : null}

          {/* How It Works Section */}
          <View style={styles.howItWorksCard}>
            <Text style={styles.sectionTitle}>How It Works</Text>
            <View style={styles.stepRow}>
              <View style={styles.stepBadge}><Text style={styles.stepBadgeText}>1</Text></View>
              <View style={styles.stepContent}>
                <Text style={styles.stepHeading}>Share your Google Play link</Text>
                <Text style={styles.stepBody}>Send your link to agency owners, creative directors, and video producers.</Text>
              </View>
            </View>
            <View style={styles.stepDivider} />
            <View style={styles.stepRow}>
              <View style={styles.stepBadge}><Text style={styles.stepBadgeText}>2</Text></View>
              <View style={styles.stepContent}>
                <Text style={styles.stepHeading}>Agency registers on Gigxomi</Text>
                <Text style={styles.stepBody}>When they download and register with your link, they are linked to your profile forever.</Text>
              </View>
            </View>
            <View style={styles.stepDivider} />
            <View style={styles.stepRow}>
              <View style={styles.stepBadge}><Text style={styles.stepBadgeText}>3</Text></View>
              <View style={styles.stepContent}>
                <Text style={styles.stepHeading}>Earn 10% Commission</Text>
                <Text style={styles.stepBody}>Every time the agency buys or renews Agency Premium (monthly or yearly), you receive 10% instantly in your wallet.</Text>
              </View>
            </View>
          </View>

          {/* Referred Agencies List */}
          <View style={styles.listCard}>
            <View style={styles.listHeaderRow}>
              <Text style={styles.sectionTitle}>Referred Agencies</Text>
              <Text style={styles.listCountText}>{data?.referredAgencies?.length || 0} Total</Text>
            </View>

            {data?.referredAgencies && data.referredAgencies.length > 0 ? (
              data.referredAgencies.map((agency) => (
                <View key={agency.id} style={styles.agencyRow}>
                  <View style={styles.agencyAvatar}>
                    <Text style={styles.agencyAvatarText}>
                      {(agency.agencyName || 'AG').slice(0, 2).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.agencyDetails}>
                    <Text numberOfLines={1} style={styles.agencyName}>
                      {agency.agencyName}
                    </Text>
                    <Text style={styles.agencyMeta}>
                      Joined {formatDate(agency.registeredAt)}
                      {agency.packageName ? ` · ${agency.packageName}` : ''}
                    </Text>
                  </View>
                  <View style={styles.agencyStatusWrap}>
                    <View
                      style={[
                        styles.statusPill,
                        agency.hasSubscribed ? styles.statusPillActive : styles.statusPillMuted,
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusPillText,
                          agency.hasSubscribed && styles.statusPillTextActive,
                        ]}
                      >
                        {agency.status}
                      </Text>
                    </View>
                    {agency.commissionEarned > 0 ? (
                      <Text style={styles.agencyCommissionText}>
                        +{formatCurrency(agency.commissionEarned)}
                      </Text>
                    ) : null}
                  </View>
                </View>
              ))
            ) : (
              <View style={styles.emptyWrap}>
                <Feather name="users" size={32} color={theme.colors.mutedText} />
                <Text style={styles.emptyTitle}>No agencies referred yet</Text>
                <Text style={styles.emptySubtitle}>
                  Share your Google Play Store referral link above. When agencies sign up and buy a Premium Plan, your earnings will appear here!
                </Text>
              </View>
            )}
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingBottom: 48,
    gap: 16,
  },
  navHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
  navTitleWrap: {
    alignItems: 'center',
  },
  navTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
  },
  navSubtitle: {
    fontSize: 12,
    color: theme.colors.mutedText,
    marginTop: 2,
  },
  loadingContainer: {
    paddingVertical: 60,
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    color: theme.colors.mutedText,
    fontSize: 14,
  },
  heroCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 20,
    gap: 12,
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.accent,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  heroBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#000',
    letterSpacing: 0.5,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: theme.colors.text,
    lineHeight: 28,
  },
  heroDescription: {
    fontSize: 14,
    lineHeight: 20,
    color: theme.colors.mutedText,
  },
  heroHighlightRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 4,
  },
  highlightPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  highlightPillText: {
    fontSize: 12,
    color: theme.colors.text,
    fontWeight: '500',
  },
  shareCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 18,
    gap: 14,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text,
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  codeWrap: {
    gap: 2,
  },
  codeLabel: {
    fontSize: 11,
    color: theme.colors.mutedText,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  codeValue: {
    fontSize: 18,
    fontWeight: '800',
    color: theme.colors.accentStrong,
    letterSpacing: 1,
  },
  copySmallButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  copySmallText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.accentStrong,
  },
  linkContainer: {
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 6,
  },
  linkLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  linkLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.text,
  },
  linkText: {
    fontSize: 12,
    color: theme.colors.mutedText,
    fontFamily: 'monospace',
    lineHeight: 16,
  },
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metricCard: {
    flex: 1,
    minWidth: '46%',
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 14,
    gap: 6,
  },
  metricIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricValue: {
    fontSize: 20,
    fontWeight: '800',
    color: theme.colors.text,
  },
  metricLabel: {
    fontSize: 12,
    color: theme.colors.mutedText,
    lineHeight: 16,
  },
  salesAttributionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 14,
  },
  salesAttributionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.text,
  },
  salesAttributionSubtitle: {
    fontSize: 12,
    color: theme.colors.mutedText,
  },
  howItWorksCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 18,
    gap: 12,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  stepBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: theme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  stepBadgeText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#000',
  },
  stepContent: {
    flex: 1,
    gap: 2,
  },
  stepHeading: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.text,
  },
  stepBody: {
    fontSize: 12,
    lineHeight: 17,
    color: theme.colors.mutedText,
  },
  stepDivider: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginVertical: 4,
  },
  listCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 18,
    gap: 14,
  },
  listHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  listCountText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.mutedText,
  },
  agencyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  agencyAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  agencyAvatarText: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.text,
  },
  agencyDetails: {
    flex: 1,
    gap: 2,
  },
  agencyName: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
  },
  agencyMeta: {
    fontSize: 12,
    color: theme.colors.mutedText,
  },
  agencyStatusWrap: {
    alignItems: 'flex-end',
    gap: 4,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  statusPillActive: {
    backgroundColor: 'rgba(34,197,94,0.15)',
  },
  statusPillMuted: {
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.colors.mutedText,
  },
  statusPillTextActive: {
    color: theme.colors.success,
  },
  agencyCommissionText: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.success,
  },
  emptyWrap: {
    paddingVertical: 24,
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.text,
  },
  emptySubtitle: {
    fontSize: 12,
    lineHeight: 18,
    color: theme.colors.mutedText,
    textAlign: 'center',
    paddingHorizontal: 12,
  },
});
