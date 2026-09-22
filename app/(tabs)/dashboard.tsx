import type { ReactNode } from 'react';
import { useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Alert, Image, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { PortfolioCover } from '@/src/components/team/EditorCard';
import { EditorPortfolioPlayerModal } from '@/src/components/team/EditorProfile';
import { startInstagramSetup, startWhatsAppSetup, useAgencyChannelIntegrations, useWhatsAppIntegration } from '@/src/hooks/useIntegrations';
import { learningDestination, type LearningDestination } from '@/src/lib/learning-destination';

import { GigxomiHeader } from '@/src/components/GigxomiHeader';
import { BrandedRefreshControl } from '@/src/components/BrandedRefreshControl';
import { Screen } from '@/src/components/Screen';
import { theme } from '@/src/constants/theme';
import { useAssignments } from '@/src/hooks/useAssignments';
import { useAuth } from '@/src/hooks/useAuth';
import { AppButton } from '@/src/components/AppButton';
import { refreshEnabledQueries } from '@/src/lib/query-refresh';
import { QueryFeedback } from '@/src/components/work/WorkPrimitives';
import { useOnboardingGate } from '@/src/hooks/useOnboardingGate';
import { useOnboardingDeferral } from '@/src/hooks/useOnboardingDeferral';
import { resolveAudienceForRole, useChats } from '@/src/hooks/useChats';
import { useAccountingRequests, useFreelancerWallet } from '@/src/hooks/useMoney';
import { useNotifications } from '@/src/hooks/useNotifications';
import { useRefreshOnFocus } from '@/src/hooks/useRefreshOnFocus';
import { useLearningCatalog, type LearningCatalogSummary } from '@/src/hooks/useLearningCatalog';
import { useFreelancerAvailability, useRoleDashboard, useSetFreelancerAvailability } from '@/src/hooks/useRoleDashboard';
import { useServices } from '@/src/hooks/useServices';
import { useSubscriptionStatus } from '@/src/hooks/useSubscriptionStatus';
import { useAgencyDirectory, useContacts, useEditorDirectory, useManagers } from '@/src/hooks/useTeam';
import { useWorkMatching } from '@/src/hooks/useWorkMatching';
import * as Clipboard from 'expo-clipboard';
import { useFreelancerReferral } from '@/src/hooks/useReferral';
import { learningScope } from '@/src/lib/learning-progress';
import type { FreelancerServiceRecord, MobileAgencyDirectoryProfile, MobileAssignmentRecord, MobileConversation, MobileFreelancerDashboardResponse, MobileTeamEditor, MobileWorkPost } from '@/src/types';

type FeatherName = keyof typeof Feather.glyphMap;
type DashboardMode = 'agency' | 'freelancer' | 'manager' | 'superAdmin';
type KpiTone = 'accent' | 'neutral' | 'warning' | 'success';

type ListItem = {
  id: string;
  title: string;
  subtitle: string;
  status?: string;
  right?: string;
  icon?: FeatherName;
};

function formatCurrency(value?: number | null) {
  return `INR ${Math.round(value || 0).toLocaleString('en-IN')}`;
}

function formatCompactCurrency(value?: number | null) {
  const amount = Math.round(value || 0);
  if (amount >= 100000) {
    return `INR ${(amount / 100000).toFixed(amount % 100000 === 0 ? 0 : 1)}L`;
  }
  if (amount >= 1000) {
    return `INR ${(amount / 1000).toFixed(amount % 1000 === 0 ? 0 : 1)}K`;
  }
  return formatCurrency(amount);
}

function formatNumber(value?: number | null) {
  if (value === null || value === undefined) return '0';
  return Math.round(value).toLocaleString('en-IN');
}

function formatDate(value?: string | null) {
  if (!value) return 'No expiry';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No expiry';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function getDaysUntil(value?: string | null) {
  if (!value) return null;
  const expiry = new Date(value);
  if (Number.isNaN(expiry.getTime())) return null;
  const now = new Date();
  expiry.setHours(23, 59, 59, 999);
  now.setHours(0, 0, 0, 0);
  return Math.ceil((expiry.getTime() - now.getTime()) / 86400000);
}

function getPackageExpiryValue(active: boolean, expiresAt?: string | null, status?: string | null) {
  const normalizedStatus = String(status ?? '').toUpperCase();
  const daysLeft = getDaysUntil(expiresAt);

  if (normalizedStatus === 'EXPIRED' || (daysLeft !== null && daysLeft < 0)) return 'Expired';
  if (!active) return 'Inactive';
  if (daysLeft === null) return 'Active';
  if (daysLeft === 0) return 'Today';
  if (daysLeft === 1) return '1 day left';
  return `${daysLeft} days left`;
}

function getPackageExpiryHelper(packageName: string, active: boolean, expiresAt?: string | null, status?: string | null) {
  const normalizedStatus = String(status ?? '').toUpperCase();
  if (normalizedStatus === 'EXPIRED') return `${packageName} has expired. Renew to keep access stable.`;
  if (!active) return packageName === 'No active package' ? 'Choose a package to unlock the workspace.' : `${packageName} is not active.`;
  if (!expiresAt) return `${packageName} has no expiry date.`;
  return `${packageName} expires on ${formatDate(expiresAt)}.`;
}

function getDashboardMode(role?: string | null, workspaceMode?: string | null): DashboardMode {
  if (role === 'SUPER_ADMIN') return 'superAdmin';
  if (role === 'MANAGER') return 'manager';
  if (role === 'ADMIN' || workspaceMode === 'AGENCY') return 'agency';
  return 'freelancer';
}

function getDashboardLabel(mode: DashboardMode) {
  if (mode === 'superAdmin') return 'Platform Dashboard';
  if (mode === 'manager') return 'Manager Dashboard';
  if (mode === 'agency') return 'Agency Dashboard';
  return 'Freelancer Dashboard';
}

function getWelcomeCopy(mode: DashboardMode) {
  if (mode === 'superAdmin') return 'Revenue, agencies, supply, automation, and platform risk in one view.';
  if (mode === 'manager') return 'Assigned chats, delivery reviews, pending work, and operator actions.';
  if (mode === 'agency') return 'Keep clients moving. Find the talent to deliver.';
  return 'Your next project, stronger skills, and earnings—in one place.';
}

function FreelancerGrowthCard({
  online,
  portfolioVideoDone,
  profileDone,
  saving,
  trustScore,
  onToggle,
}: {
  online: boolean | null;
  portfolioVideoDone: boolean;
  profileDone: boolean;
  saving: boolean;
  trustScore: number | null;
  onToggle: () => void;
}) {
  const router = useRouter();
  return (
    <View style={styles.growthCard}>
      <View style={styles.growthTop}>
        <View style={styles.growthCopy}><Text style={styles.growthEyebrow}>Your growth setup</Text><Text style={styles.growthTitle}>Get discovered. Win better projects.</Text><Text style={styles.growthHelper}>Complete your proof, keep availability accurate, and give agencies a clear reason to send an offer.</Text></View>
        <Pressable accessibilityRole="switch" accessibilityLabel="Available for projects" accessibilityState={{ checked: online === true, disabled: saving || online === null }} disabled={saving || online === null} onPress={onToggle} style={[styles.presenceToggle, online && styles.presenceToggleOn]}><View style={[styles.presenceThumb, online && styles.presenceThumbOn]} /></Pressable>
      </View>
      <View style={styles.growthStatusRow}><View style={[styles.liveDot, online ? styles.liveDotOnline : styles.liveDotOffline]} /><Text style={styles.liveCopy}>{saving ? 'Updating availability…' : online === null ? 'Availability unavailable · refresh to check your status' : online ? 'Online · agencies can see you are ready for offers' : 'Offline · your profile stays visible, but availability is paused'}</Text></View>
      <View style={styles.completionTabs}>
        <Pressable onPress={() => router.push(profileDone ? '/profile' : '/connected-onboarding')} style={[styles.completionTab, profileDone && styles.completionTabDone]}><Feather color={profileDone ? theme.colors.background : theme.colors.accentStrong} name={profileDone ? 'check' : 'user'} size={18} /><Text style={[styles.completionTitle, profileDone && styles.completionTitleDone]}>Profile</Text><Text style={[styles.completionMeta, profileDone && styles.completionMetaDone]}>{profileDone ? 'Complete' : 'Finish setup'}</Text></Pressable>
        <Pressable onPress={() => router.push('/service')} style={[styles.completionTab, portfolioVideoDone && styles.completionTabDone]}><Feather color={portfolioVideoDone ? theme.colors.background : theme.colors.accentStrong} name={portfolioVideoDone ? 'check' : 'play-circle'} size={18} /><Text style={[styles.completionTitle, portfolioVideoDone && styles.completionTitleDone]}>Portfolio video</Text><Text style={[styles.completionMeta, portfolioVideoDone && styles.completionMetaDone]}>{portfolioVideoDone ? 'Published' : 'Add showreel'}</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Skills test and Trust Score" onPress={() => router.push('/freelancer-test')} style={styles.completionTab}><Feather color={theme.colors.accentStrong} name="award" size={18} /><Text style={styles.completionTitle}>Skills test</Text><Text style={styles.completionMeta}>{trustScore === null ? 'Score pending' : `Trust ${trustScore}/100`}</Text></Pressable>
      </View>
    </View>
  );
}

function FreelancerReferralCard({
  referralCode,
  playStoreUrl,
  commissionEarned,
  registeredAgencies,
  onPress,
}: {
  referralCode: string;
  playStoreUrl: string;
  commissionEarned: number;
  registeredAgencies: number;
  onPress: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await Clipboard.setStringAsync(playStoreUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Open referral and earn details"
      onPress={onPress}
      style={({ pressed }) => [styles.referralCard, pressed && styles.pressed]}
    >
      <View style={styles.referralTopRow}>
        <View style={styles.referralBadge}>
          <Feather name="gift" size={13} color="#000" />
          <Text style={styles.referralBadgeText}>10% COMMISSION</Text>
        </View>
        <Text style={styles.referralCodePill}>Code: {referralCode}</Text>
      </View>

      <Text style={styles.referralTitle}>Refer & Earn</Text>
      <Text style={styles.referralSubtitle}>
        Share Gigxomi with agencies. Earn flat 10% recurring commission on every Premium Plan purchase!
      </Text>

      <View style={styles.referralMetricsRow}>
        <View style={styles.referralMetricChip}>
          <Text style={styles.referralMetricChipValue}>
            {commissionEarned > 0 ? `₹${Math.round(commissionEarned).toLocaleString('en-IN')}` : '₹0'}
          </Text>
          <Text style={styles.referralMetricChipLabel}>Earned</Text>
        </View>
        <View style={styles.referralMetricChip}>
          <Text style={styles.referralMetricChipValue}>{registeredAgencies}</Text>
          <Text style={styles.referralMetricChipLabel}>Registered</Text>
        </View>
        <View style={styles.referralMetricChip}>
          <Text style={styles.referralMetricChipValue}>10%</Text>
          <Text style={styles.referralMetricChipLabel}>Rate</Text>
        </View>
      </View>

      <View style={styles.referralActionsRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Copy Google Play Store link"
          onPress={handleCopy}
          style={({ pressed }) => [styles.referralCopyBtn, pressed && styles.pressed]}
        >
          <Feather name={copied ? 'check' : 'copy'} size={14} color={theme.colors.accentStrong} />
          <Text style={styles.referralCopyBtnText}>
            {copied ? 'Play Store Link Copied!' : 'Copy Play Store Link'}
          </Text>
        </Pressable>

        <View style={styles.referralLinkArrow}>
          <Text style={styles.referralLinkText}>Details</Text>
          <Feather name="chevron-right" size={16} color={theme.colors.accentStrong} />
        </View>
      </View>
    </Pressable>
  );
}

function AgencyChannelsCard({
  token,
  role,
}: {
  token: string | null;
  role?: string | null;
}) {
  const router = useRouter();
  const channelsQuery = useAgencyChannelIntegrations(role === 'ADMIN' || role === 'SUPER_ADMIN');
  const whatsappQuery = useWhatsAppIntegration(role as any);
  const [connectingWhatsApp, setConnectingWhatsApp] = useState(false);
  const [connectingInstagram, setConnectingInstagram] = useState(false);

  const connections = channelsQuery.data?.connections ?? [];
  const instagram = connections.find((c) => c.provider === 'INSTAGRAM');
  const whatsappFromQuery = whatsappQuery.data?.connection as Record<string, unknown> | undefined;

  const isWhatsAppConnected =
    connections.some((c) => c.provider === 'WHATSAPP' && c.status === 'CONNECTED') ||
    whatsappFromQuery?.status === 'connected' ||
    Boolean(whatsappFromQuery?.pluginEnabled);

  const isInstagramConnected =
    instagram?.status === 'CONNECTED' ||
    instagram?.status === 'Ready for webhook';

  const handleConnectWhatsApp = async () => {
    if (!token) return;
    setConnectingWhatsApp(true);
    try {
      const url = await startWhatsAppSetup(token);
      await Linking.openURL(url);
    } catch (err) {
      Alert.alert('WhatsApp Business API', err instanceof Error ? err.message : 'Could not open WhatsApp setup. Open Integrations to configure.');
    } finally {
      setConnectingWhatsApp(false);
    }
  };

  const handleConnectInstagram = async () => {
    if (!token) return;
    setConnectingInstagram(true);
    try {
      const url = await startInstagramSetup(token);
      await Linking.openURL(url);
    } catch (err) {
      Alert.alert('Instagram Graph API', err instanceof Error ? err.message : 'Could not open Instagram setup. Open Integrations to configure.');
    } finally {
      setConnectingInstagram(false);
    }
  };

  return (
    <View style={styles.channelsCard}>
      <View style={styles.channelsHeader}>
        <View style={{ flex: 1, gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Feather name="message-square" size={15} color={theme.colors.accent} />
            <Text style={styles.channelsEyebrow}>CLIENT INBOUND CHANNELS</Text>
          </View>
          <Text style={styles.channelsTitle}>Connect WhatsApp & Instagram</Text>
        </View>
      </View>

      <Text style={styles.channelsDescription}>
        Connect your WhatsApp Cloud API and Instagram Direct Messages so client inquiries and briefs route directly into this application.
      </Text>

      {/* WhatsApp Business API */}
      <View style={styles.channelRow}>
        <View style={styles.channelInfo}>
          <View style={[styles.channelIconBadge, isWhatsAppConnected ? styles.channelIconActive : null]}>
            <Feather name="message-circle" size={18} color={isWhatsAppConnected ? '#25D366' : theme.colors.mutedText} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={styles.channelName}>WhatsApp Business API</Text>
              <View style={[styles.channelStatusPill, isWhatsAppConnected ? styles.channelStatusPillOnline : styles.channelStatusPillOffline]}>
                <Text style={[styles.channelStatusText, isWhatsAppConnected ? styles.channelStatusTextOnline : styles.channelStatusTextOffline]}>
                  {isWhatsAppConnected ? 'Connected' : 'Not connected'}
                </Text>
              </View>
            </View>
            <Text style={styles.channelMeta}>
              {isWhatsAppConnected ? 'Active · Inbound chats routing to agency inbox' : 'Zero-friction chat with encrypted phone numbers'}
            </Text>
          </View>
        </View>
        <Pressable
          style={[styles.channelActionButton, isWhatsAppConnected ? styles.channelActionButtonSecondary : styles.channelActionButtonPrimary]}
          onPress={handleConnectWhatsApp}
          disabled={connectingWhatsApp}
        >
          {connectingWhatsApp ? (
            <ActivityIndicator size="small" color={isWhatsAppConnected ? theme.colors.text : theme.colors.background} />
          ) : (
            <Text style={[styles.channelActionText, isWhatsAppConnected ? styles.channelActionTextSecondary : styles.channelActionTextPrimary]}>
              {isWhatsAppConnected ? 'Reconnect' : 'Connect'}
            </Text>
          )}
        </Pressable>
      </View>

      {/* Instagram Graph API */}
      <View style={styles.channelRow}>
        <View style={styles.channelInfo}>
          <View style={[styles.channelIconBadge, isInstagramConnected ? styles.channelIconActive : null]}>
            <Feather name="instagram" size={18} color={isInstagramConnected ? '#E1306C' : theme.colors.mutedText} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={styles.channelName}>Instagram Graph API</Text>
              <View style={[styles.channelStatusPill, isInstagramConnected ? styles.channelStatusPillOnline : styles.channelStatusPillOffline]}>
                <Text style={[styles.channelStatusText, isInstagramConnected ? styles.channelStatusTextOnline : styles.channelStatusTextOffline]}>
                  {isInstagramConnected ? 'Connected' : 'Not connected'}
                </Text>
              </View>
            </View>
            <Text style={styles.channelMeta}>
              {isInstagramConnected ? 'Active · Direct Messages synced to inbox' : 'Direct Message intake and lead qualification'}
            </Text>
          </View>
        </View>
        <Pressable
          style={[styles.channelActionButton, isInstagramConnected ? styles.channelActionButtonSecondary : styles.channelActionButtonPrimary]}
          onPress={handleConnectInstagram}
          disabled={connectingInstagram}
        >
          {connectingInstagram ? (
            <ActivityIndicator size="small" color={isInstagramConnected ? theme.colors.text : theme.colors.background} />
          ) : (
            <Text style={[styles.channelActionText, isInstagramConnected ? styles.channelActionTextSecondary : styles.channelActionTextPrimary]}>
              {isInstagramConnected ? 'Reconnect' : 'Connect'}
            </Text>
          )}
        </Pressable>
      </View>

      {/* Manage all channels */}
      <Pressable
        style={styles.channelsFooter}
        onPress={() => router.push('/integrations')}
      >
        <Text style={styles.channelsFooterText}>Manage all channel integrations, webhooks & UPI</Text>
        <Feather name="arrow-right" size={14} color={theme.colors.accent} />
      </Pressable>
    </View>
  );
}

function DiscoveryCarousel({
  agencies,
  editors,
  failed,
  isAgency,
  loading,
  onOpenDirectory,
  onOpenEditor,
  onPortfolio,
  onRetry,
}: {
  agencies: MobileAgencyDirectoryProfile[];
  editors: MobileTeamEditor[];
  failed: boolean;
  isAgency: boolean;
  loading: boolean;
  onOpenDirectory: () => void;
  onOpenEditor: (editorId: string) => void;
  onPortfolio: (editor: MobileTeamEditor) => void;
  onRetry: () => void;
}) {
  const count = isAgency ? editors.length : agencies.length;
  return (
    <View style={styles.discoverySection}>
      <View style={styles.sectionHeadingRow}>
        <View style={styles.sectionHeadingCopy}>
          <Text style={styles.learningEyebrow}>{isAgency ? 'Editor discovery' : 'Agency network'}</Text>
          <Text style={styles.learningHeading}>{isAgency ? 'Talent ready for your next brief' : 'Teams you can grow with'}</Text>
          <Text style={styles.learningDescription}>{isAgency ? 'Compare real Trust Scores, availability, workload, and pricing.' : 'Review real agency profiles, open opportunities, and reputation.'}</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={onOpenDirectory} style={styles.sectionArrow}><Feather color={theme.colors.accentStrong} name="arrow-right" size={20} /></Pressable>
      </View>
      {loading ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.slideRail}>{[0, 1].map((item) => <View accessibilityLabel="Loading discovery" key={item} style={[styles.discoverySlide, styles.slideSkeleton]}><View style={styles.learningSkeletonWide} /><View style={styles.learningSkeletonShort} /></View>)}</ScrollView> : failed ? <View style={styles.learningError}><Text style={styles.learningTitle}>Discovery could not refresh</Text><Text style={styles.learningMeta}>Your dashboard is still available. Retry the directory when your connection is stable.</Text><Pressable accessibilityRole="button" onPress={onRetry} style={styles.learningLinkButton}><Text style={styles.learningLink}>Retry discovery →</Text></Pressable></View> : count ? <ScrollView horizontal decelerationRate="fast" showsHorizontalScrollIndicator={false} snapToInterval={250} contentContainerStyle={styles.slideRail}>
        {isAgency ? editors.slice(0, 8).map((editor) => <View key={editor.id} style={styles.discoverySlide}>
          <PortfolioCover editor={editor} wide onPress={() => onPortfolio(editor)} />
          <View style={styles.discoveryTop}><Text style={styles.discoveryMeta}>{editor.isOnline === true ? '● Online now' : editor.isOnline === false ? '● Offline' : 'Presence unavailable'}</Text></View>
          <Text numberOfLines={1} style={styles.discoveryName}>{editor.name}</Text><Text numberOfLines={1} style={styles.discoveryRole}>{editor.title || editor.category || 'Video editor'}</Text>
          <View style={styles.discoveryDivider} /><Text style={styles.discoveryProof}>{editor.trustScore == null ? 'Trust assessment pending' : `Trust ${editor.trustScore}/100${editor.trustProvisional ? ' · Provisional' : ''}`}</Text><Text style={styles.discoveryMeta}>{editor.workload ? `${editor.workload.activeProjects ?? 0} projects · ${editor.workload.activeChats ?? 0} chats active` : 'Workload unavailable'}</Text><Text style={styles.discoveryPrice}>{editor.startingPrice != null ? `From ₹${Math.round(editor.startingPrice).toLocaleString('en-IN')}` : 'Price on profile'}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={`View editor ${editor.name}`} onPress={() => onOpenEditor(editor.id)} style={styles.learningLinkButton}><Text style={styles.learningLink}>View profile →</Text></Pressable>
        </View>) : agencies.slice(0, 8).map((agency) => <Pressable accessibilityRole="button" accessibilityLabel={`Explore agency ${agency.publicName}`} key={agency.id} onPress={onOpenDirectory} style={({ pressed }) => [styles.discoverySlide, pressed && styles.pressed]}>
          <View style={styles.discoveryTop}><View style={styles.discoveryAvatar}><Text style={styles.discoveryAvatarText}>{(agency.publicName || 'AG').slice(0, 2).toUpperCase()}</Text></View><View style={styles.presencePill}><Text style={styles.presencePillText}>{agency.hiringStatus || 'Open'}</Text></View></View>
          <Text numberOfLines={1} style={styles.discoveryName}>{agency.publicName}</Text><Text numberOfLines={2} style={styles.discoveryRole}>{agency.tagline || agency.niche || 'Creative agency'}</Text><View style={styles.discoveryDivider} /><Text style={styles.discoveryProof}>Agency Trust {agency.reputation?.score ?? 100}/100</Text><Text style={styles.discoveryMeta}>{agency.stats?.openOpportunities ?? 0} open roles · {agency.stats?.activeEditors ?? 0} editors</Text><Text style={styles.discoveryPrice}>{agency.office?.city || agency.office?.country || 'Remote team'}</Text><Text style={styles.learningLink}>Explore agency →</Text>
        </Pressable>)}
      </ScrollView> : <View style={styles.learningError}><Text style={styles.learningTitle}>{isAgency ? 'No active editor profiles yet' : 'No agency profiles yet'}</Text><Text style={styles.learningMeta}>{isAgency ? 'Approved, active freelancers will appear here automatically.' : 'Published agencies will appear here as the network grows.'}</Text><Pressable accessibilityRole="button" onPress={onOpenDirectory} style={styles.learningLinkButton}><Text style={styles.learningLink}>Open directory →</Text></Pressable></View>}
    </View>
  );
}

function LearningDashboardCard({
  catalog,
  isAgency,
  loading,
  failed,
  onOpen,
  onRetry,
}: {
  catalog?: LearningCatalogSummary;
  isAgency: boolean;
  loading: boolean;
  failed: boolean;
  onOpen: (destination?: LearningDestination) => void;
  onRetry: () => void;
}) {
  const allLessons = catalog?.playlists.flatMap((playlist) =>
    playlist.chapters.flatMap((chapter) => chapter.lessons),
  ) ?? [];
  const completedLessons = allLessons.filter((lesson) => lesson.progress?.status === 'COMPLETED').length;
  const watchedSeconds = allLessons.reduce((total, lesson) => total + Math.max(0, lesson.progress?.watchedSeconds ?? 0), 0);
  const target = catalog?.continueLearning;
  const hasCatalog = Boolean(catalog?.playlists.length);

  return (
    <View style={styles.learningCard}>
      <View style={styles.learningHeader}>
        <View style={styles.learningHeaderCopy}>
          <Text style={styles.learningEyebrow}>{isAgency ? 'Agency Learning' : 'Your Learning'}</Text>
          <Text style={styles.learningHeading}>{target ? 'Continue where you stopped' : completedLessons ? 'Your learning report' : 'Build your next advantage'}</Text>
          <Text style={styles.learningDescription}>{isAgency ? 'Practical training for stronger client service and smoother delivery.' : 'Improve your craft, strengthen your profile, and win better projects.'}</Text>
        </View>
        <Feather color={theme.colors.accentStrong} name="book-open" size={24} />
      </View>

      {loading ? (
        <View accessibilityLabel="Loading learning progress" style={styles.learningLoading}>
          <View style={styles.learningSkeletonWide} />
          <View style={styles.learningSkeletonShort} />
        </View>
      ) : failed ? (
        <View style={styles.learningError}>
          <Text style={styles.learningTitle}>Learning progress is temporarily unavailable</Text>
          <Text style={styles.learningMeta}>Your saved watch history is safe. Retry when you are online.</Text>
          <Pressable accessibilityRole="button" onPress={onRetry} style={styles.learningLinkButton}>
            <Text style={styles.learningLink}>Retry report →</Text>
          </Pressable>
        </View>
      ) : hasCatalog ? (
        <View style={styles.learningCatalog}>
          <View style={styles.learningReportRow}>
            <View style={styles.learningReportItem}><Text style={styles.learningReportValue}>{Math.round(watchedSeconds / 60)}</Text><Text style={styles.learningReportLabel}>Min watched</Text></View>
            <View style={styles.learningReportItem}><Text style={styles.learningReportValue}>{completedLessons}/{allLessons.length}</Text><Text style={styles.learningReportLabel}>Lessons done</Text></View>
            <View style={styles.learningReportItem}><Text style={styles.learningReportValue}>{catalog?.playlists.length ?? 0}</Text><Text style={styles.learningReportLabel}>Playlists</Text></View>
          </View>
          <ScrollView horizontal decelerationRate="fast" showsHorizontalScrollIndicator={false} snapToInterval={270} contentContainerStyle={styles.courseRail}>
            {catalog?.playlists.slice(0, 8).map((playlist) => {
              const playlistTarget = target?.playlistId === playlist.id;
              const chapter = playlistTarget ? playlist.chapters.find((item) => item.id === target?.chapterId) : playlist.chapters[0];
              const lesson = playlistTarget ? chapter?.lessons.find((item) => item.id === target?.lessonId) : chapter?.lessons[0];
              const lessonVideoId = lesson?.youtubeVideoId;
              const playlistThumbnail = chapter?.thumbnailUrl || playlist.thumbnailUrl || (lessonVideoId && /^[a-zA-Z0-9_-]{11}$/.test(lessonVideoId) ? `https://i.ytimg.com/vi/${lessonVideoId}/hqdefault.jpg` : null);
              const courseAction = playlistTarget ? 'Resume course' : playlist.completionPercent >= 100 ? 'View report' : playlist.completionPercent > 0 ? 'Continue course' : 'Start course';
              return <Pressable accessibilityRole="button" accessibilityLabel={`${courseAction}: ${playlist.title}`} key={playlist.id} onPress={() => onOpen(learningDestination(playlist, target))} style={({ pressed }) => [styles.courseSlide, pressed && styles.pressed]}>
                <View style={styles.coursePoster}>{playlistThumbnail ? <Image alt="" accessible={false} accessibilityIgnoresInvertColors source={{ uri: playlistThumbnail }} style={styles.learningPosterImage} /> : <View style={styles.learningPosterFallback}><Feather color={theme.colors.accentStrong} name="play-circle" size={34} /></View>}<View style={styles.learningPlay}><Feather color={theme.colors.background} name="play" size={18} /></View></View>
                <View style={styles.courseBody}><Text numberOfLines={1} style={styles.learningPlaylist}>{playlistTarget ? 'Continue watching' : `${playlist.lessonCount} lessons`}</Text><Text numberOfLines={2} style={styles.learningTitle}>{playlist.title}</Text><View style={styles.learningProgressTrack}><View style={[styles.learningProgressFill, { width: `${Math.max(0, Math.min(100, playlist.completionPercent))}%` }]} /></View><Text style={styles.learningMeta}>{Math.round(playlist.completionPercent)}% complete</Text><Text style={styles.learningLink}>{courseAction} →</Text></View>
              </Pressable>;
            })}
          </ScrollView>
          <Pressable accessibilityRole="button" accessibilityLabel="Open full Learning library" onPress={() => onOpen()} style={styles.learningLinkButton}><Text style={styles.learningLink}>Open full Learning library →</Text></Pressable>
        </View>
      ) : (
        <View style={styles.learningError}>
          <Text style={styles.learningTitle}>New lessons are being prepared</Text>
          <Text style={styles.learningMeta}>Published playlists for your role will appear here automatically.</Text>
          <Pressable accessibilityRole="button" onPress={() => onOpen()} style={styles.learningLinkButton}><Text style={styles.learningLink}>Open Learning →</Text></Pressable>
        </View>
      )}
    </View>
  );
}

function getMetricValue(payload: unknown, keys: string[]): number | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const record = payload as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number') return value;
    if (value && typeof value === 'object') {
      const nested = value as Record<string, unknown>;
      for (const nestedKey of ['count', 'total', 'value', 'amount']) {
        const nestedValue = nested[nestedKey];
        if (typeof nestedValue === 'number') return nestedValue;
      }
    }
  }
  return undefined;
}

function safeStatus(value?: string | null) {
  if (!value) return 'Open';
  return value
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}


function getRecordString(record: Record<string, unknown>, key: string, fallback = '') {
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function getRecordArrayCount(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return Array.isArray(value) ? value.filter(Boolean).length : 0;
}

function getWorkPostBudget(post: MobileWorkPost) {
  const budget = post.budgetMax ?? post.budgetMin;
  return budget ? formatCompactCurrency(budget) : undefined;
}


function IconButton({ icon, label, onPress }: { icon: FeatherName; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
      <Feather name={icon} size={21} color={theme.colors.accentStrong} />
    </Pressable>
  );
}

function SearchPill({ mode, onPress }: { mode: DashboardMode; onPress: () => void }) {
  const placeholder =
    mode === 'freelancer'
      ? 'Search work, services, chats...'
      : mode === 'manager'
        ? 'Search chats, tasks, reviews...'
        : mode === 'superAdmin'
          ? 'Search agencies, editors, revenue...'
          : 'Search chats, projects, editors...';

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.searchPill, pressed && styles.pressed]}>
      <Feather name="search" size={20} color={theme.colors.mutedText} />
      <Text numberOfLines={1} style={styles.searchText}>
        {placeholder}
      </Text>
      <View style={styles.searchTune}>
        <Feather name="sliders" size={16} color={theme.colors.text} />
      </View>
    </Pressable>
  );
}

type SearchResult = {
  id: string;
  title: string;
  subtitle: string;
  icon: FeatherName;
  route: string;
};

function DashboardSearchModal({
  assignments,
  conversations,
  onClose,
  onSelect,
  services,
  visible,
  workPosts,
}: {
  assignments: MobileAssignmentRecord[];
  conversations: MobileConversation[];
  onClose: () => void;
  onSelect: (route: string) => void;
  services: FreelancerServiceRecord[];
  visible: boolean;
  workPosts: MobileWorkPost[];
}) {
  const [query, setQuery] = useState('');
  const term = query.trim().toLowerCase();
  const results: SearchResult[] = [
    ...conversations.map((conversation) => ({
      id: `chat-${conversation.id}`,
      title: conversation.customerDisplayName || 'Client chat',
      subtitle: conversation.serviceTitle || conversation.summary || 'Chat',
      icon: 'message-circle' as FeatherName,
      route: `/chat/${encodeURIComponent(conversation.id)}`,
    })),
    ...assignments.map((assignment) => ({
      id: `assignment-${assignment.id}`,
      title: assignment.title,
      subtitle: `${assignment.category || 'Work'} - ${safeStatus(assignment.status)}`,
      icon: 'briefcase' as FeatherName,
      route: assignment.chatThreadId ? `/chat/${encodeURIComponent(assignment.chatThreadId)}` : `/assignment/${encodeURIComponent(assignment.id)}`,
    })),
    ...workPosts.map((post) => ({
      id: `work-${post.id}`,
      title: post.title,
      subtitle: `${post.category || 'Open work'}${post.status ? ` - ${safeStatus(post.status)}` : ''}`,
      icon: 'target' as FeatherName,
      route: '/projects',
    })),
    ...services.map((service) => ({
      id: `service-${service.id}`,
      title: service.title,
      subtitle: `${service.category || 'Service'}${service.status ? ` - ${safeStatus(service.status)}` : ''}`,
      icon: 'plus-square' as FeatherName,
      route: '/service',
    })),
  ]
    .filter((item) => {
      if (!term) return true;
      return `${item.title} ${item.subtitle}`.toLowerCase().includes(term);
    })
    .slice(0, 18);

  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.searchModalBackdrop}>
        <Pressable style={styles.searchModalScrim} onPress={onClose} />
        <View style={styles.searchModal}>
          <View style={styles.searchModalInputRow}>
            <Feather name="search" size={18} color={theme.colors.mutedText} />
            <TextInput
              autoFocus
              placeholder="Search chats, work, clients, services"
              placeholderTextColor={theme.colors.mutedText}
              value={query}
              onChangeText={setQuery}
              selectionColor={theme.colors.accent}
              style={styles.searchModalInput}
            />
            <Pressable onPress={onClose} style={styles.searchModalClose}>
              <Feather name="x" size={17} color={theme.colors.text} />
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {results.map((item) => (
              <Pressable key={item.id} style={({ pressed }) => [styles.searchResultRow, pressed && styles.pressed]} onPress={() => onSelect(item.route)}>
                <View style={styles.searchResultIcon}>
                  <Feather name={item.icon} size={17} color={theme.colors.accentStrong} />
                </View>
                <View style={styles.searchResultCopy}>
                  <Text numberOfLines={1} style={styles.searchResultTitle}>{item.title}</Text>
                  <Text numberOfLines={1} style={styles.searchResultSubtitle}>{item.subtitle}</Text>
                </View>
              </Pressable>
            ))}
            {!results.length ? <Text style={styles.searchEmpty}>No matching work, chats, clients, or services.</Text> : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function KpiCard({
  title,
  value,
  helper,
  icon,
  tone = 'neutral',
  actionLabel,
  onPress,
}: {
  title: string;
  value: string;
  helper: string;
  icon: FeatherName;
  tone?: KpiTone;
  actionLabel?: string;
  onPress?: () => void;
}) {
  const { width, fontScale } = useWindowDimensions();
  const singleColumn = width < 350 || fontScale > 1.2;
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [styles.kpiCard, singleColumn && { flexBasis: '100%', maxWidth: '100%' }, pressed && styles.pressed]}>
      <View style={styles.kpiHeader}>
        <View style={[styles.kpiIcon, tone === 'warning' && styles.kpiIconWarning, tone === 'success' && styles.kpiIconSuccess]}>
          <Feather name={icon} size={21} color={theme.colors.accentStrong} />
        </View>
        {actionLabel ? <Text style={styles.kpiAction}>{actionLabel}</Text> : null}
      </View>
      <Text style={styles.kpiTitle}>{title}</Text>
      <Text numberOfLines={1} style={styles.kpiValue}>
        {value}
      </Text>
      <Text numberOfLines={2} style={styles.kpiHelper}>
        {helper}
      </Text>
    </Pressable>
  );
}

function SectionPanel({
  title,
  icon,
  action,
  onAction,
  children,
}: {
  title: string;
  icon: FeatherName;
  action?: string;
  onAction?: () => void;
  children: ReactNode;
}) {
  return (
    <View style={styles.panel}>
      <View style={styles.panelHeader}>
        <View style={styles.panelTitleWrap}>
          <View style={styles.panelIcon}>
            <Feather name={icon} size={18} color={theme.colors.accentStrong} />
          </View>
          <Text style={styles.panelTitle}>{title}</Text>
        </View>
        {action ? (
          <Pressable disabled={!onAction} hitSlop={10} onPress={onAction} style={({ pressed }) => pressed && styles.pressed}>
            <Text style={styles.panelAction}>{action}</Text>
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

function RevenueCard({ onViewAll, total, paid, pending }: { onViewAll: () => void; total: number; paid: number; pending: number }) {
  return <SectionPanel title="Money Overview" icon="trending-up" action="View all" onAction={onViewAll}>
    <Text style={styles.largeValue}>{formatCompactCurrency(total)}</Text>
    <Text style={styles.panelMuted}>Paid / available {formatCompactCurrency(paid)} · Pending {formatCompactCurrency(pending)}</Text>
    <Text style={styles.panelMuted}>Current account totals. Open the ledger for individual transactions.</Text>
  </SectionPanel>;
}

function PipelineCard({ active, review, completed }: { active: number; review: number; completed: number }) {
  const router = useRouter();
  return <View style={styles.pipelineSummary}>
    <View style={styles.sectionHeadingRow}><View style={styles.sectionHeadingCopy}><Text style={styles.learningEyebrow}>Workspace snapshot</Text><Text style={styles.learningHeading}>Your work, at a glance</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Open work report" onPress={() => router.push('/projects')} style={styles.sectionArrow}><Feather color={theme.colors.accentStrong} name="arrow-right" size={20} /></Pressable></View>
    <View style={styles.learningReportRow}>{[{label:'In progress',value:active},{label:'In review',value:review},{label:'Completed',value:completed}].map(item => <View key={item.label} style={styles.learningReportItem}><Text style={styles.learningReportValue}>{item.value}</Text><Text style={styles.learningReportLabel}>{item.label}</Text></View>)}</View>
  </View>;
}

function PackageStatusCard({
  active,
  expiresAt,
  packageName,
  status,
}: {
  active: boolean;
  expiresAt?: string | null;
  packageName: string;
  status?: string | null;
}) {
  const { width, fontScale } = useWindowDimensions();
  const singleColumn = width < 350 || fontScale > 1.2;
  const value = getPackageExpiryValue(active, expiresAt, status);
  const helper = getPackageExpiryHelper(packageName, active, expiresAt, status);
  const isHealthy = active && value !== 'Expired';

  return (
    <View style={[styles.packageCard, singleColumn && { flexBasis: '100%', maxWidth: '100%' }]}>
      <View style={styles.packageHeader}>
        <View style={[styles.kpiIcon, !isHealthy && styles.kpiIconWarning]}>
          <Feather name="calendar" size={21} color={isHealthy ? theme.colors.accentStrong : theme.colors.warning} />
        </View>
        <View style={[styles.packagePill, isHealthy ? styles.packagePillActive : styles.packagePillWarning]}>
          <Text style={[styles.packagePillText, !isHealthy && styles.packagePillTextWarning]}>{isHealthy ? 'Active' : safeStatus(status || 'Action needed')}</Text>
        </View>
      </View>
      <Text style={styles.kpiTitle}>Package Expiry</Text>
      <Text numberOfLines={1} style={styles.kpiValue}>{value}</Text>
      <Text style={styles.kpiHelper}>{helper}</Text>
    </View>
  );
}

function ListRow({ item, index }: { item: ListItem; index: number }) {
  return (
    <View style={[styles.listRow, index === 0 && styles.listRowFirst]}>
      <View style={styles.listAvatar}>
        <Feather name={item.icon || 'briefcase'} size={18} color={theme.colors.accentStrong} />
      </View>
      <View style={styles.listContent}>
        <Text numberOfLines={1} style={styles.listTitle}>
          {item.title}
        </Text>
        <Text numberOfLines={2} style={styles.listSubtitle}>
          {item.subtitle}
        </Text>
        {item.status ? (
          <View style={styles.statusPill}>
            <Text style={styles.statusPillText}>{item.status}</Text>
          </View>
        ) : null}
      </View>
      {item.right ? <Text style={styles.listRight}>{item.right}</Text> : null}
    </View>
  );
}

function EmptyBlock({ title, action }: { title: string; action?: string }) {
  return (
    <View style={styles.emptyBlock}>
      <View style={styles.emptyIcon}>
        <Feather name="zap" size={18} color={theme.colors.accentStrong} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      {action ? <Text style={styles.emptyText}>{action}</Text> : null}
    </View>
  );
}

function QuickAction({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon: FeatherName;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.quickAction, pressed && styles.pressed]}>
      <Feather name={icon} size={19} color={theme.colors.accentStrong} />
      <Text style={styles.quickActionText}>{label}</Text>
    </Pressable>
  );
}

function getRecentWorkRows(assignments: MobileAssignmentRecord[], workPosts: MobileWorkPost[], mode: DashboardMode): ListItem[] {
  if (assignments.length) {
    return assignments.slice(0, 5).map((assignment) => ({
      id: assignment.id,
      title: assignment.title,
      subtitle: `${assignment.category || 'Project'}${assignment.deadline ? ` - due ${formatDate(assignment.deadline)}` : ''}`,
      status: safeStatus(assignment.status),
      right: assignment.budgetAmount ? formatCompactCurrency(assignment.budgetAmount) : undefined,
      icon: mode === 'freelancer' ? 'briefcase' : 'folder',
    }));
  }

  return workPosts.slice(0, 5).map((post) => ({
    id: post.id,
    title: post.title,
    subtitle: `${post.category || 'Open work'}${post.deadline ? ` - due ${formatDate(post.deadline)}` : ''}`,
    status: safeStatus(post.status),
    right: getWorkPostBudget(post),
    icon: 'target',
  }));
}

export default function DashboardTab() {
  const router = useRouter();
  const [searchOpen, setSearchOpen] = useState(false);
  const [portfolioEditor, setPortfolioEditor] = useState<MobileTeamEditor | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const auth = useAuth();
  const user = auth.session;
  const setupGate = useOnboardingGate(user?.role, auth.token, user?.userId);
  const { deferred } = useOnboardingDeferral(user?.userId);
  const workspaceMode = user?.workspaceMode;
  const mode = getDashboardMode(user?.role, workspaceMode);
  const isFreelancer = mode === 'freelancer';
  const isManager = mode === 'manager';
  const isSuperAdmin = mode === 'superAdmin';
  const audience = resolveAudienceForRole(user?.role);
  const accountingAudience = isFreelancer ? 'editor' : 'agency';

  const dashboardQuery = useRoleDashboard(user?.role, workspaceMode, user?.userId);
  const chatsQuery = useChats(audience, { liveSync: false });
  const assignmentsQuery = useAssignments();
  const notificationsQuery = useNotifications();
  const subscriptionQuery = useSubscriptionStatus();
  const servicesQuery = useServices();
  const walletQuery = useFreelancerWallet(isFreelancer);
  const availabilityQuery = useFreelancerAvailability(isFreelancer);
  const setAvailability = useSetFreelancerAvailability();
  const accountingQuery = useAccountingRequests(accountingAudience, Boolean(user?.role));
  const contactsQuery = useContacts(mode === 'agency' || isManager);
  const managersQuery = useManagers(mode === 'agency');
  const workMatchingQuery = useWorkMatching();
  const editorDiscoveryQuery = useEditorDirectory({ enabled: mode === 'agency', scope: 'general' });
  const agencyDiscoveryQuery = useAgencyDirectory(isFreelancer);
  const referralQuery = useFreelancerReferral(isFreelancer);
  const learningCatalogScope = learningScope(user?.userId ?? 'signed-out', user?.role ?? '', user?.tenantId);
  const learningQuery = useLearningCatalog(learningCatalogScope, auth.token);

  const refreshDashboard = () => refreshEnabledQueries([
    dashboardQuery, chatsQuery, assignmentsQuery, notificationsQuery, subscriptionQuery,
    servicesQuery, walletQuery, accountingQuery, contactsQuery, managersQuery,
    workMatchingQuery, availabilityQuery, setupGate, learningQuery, editorDiscoveryQuery, agencyDiscoveryQuery, referralQuery,
  ]);
  useRefreshOnFocus(() => { void refreshDashboard(); });

  const assignments = assignmentsQuery.data?.assignments ?? [];
  const notifications = notificationsQuery.data?.notifications ?? [];
  const conversations = chatsQuery.data?.conversations ?? [];
  const assignedConversations = conversations.filter((c) => Boolean(c.assignmentSummary?.assignedFreelancerId || c.assignedFreelancerId));
  const assignedChatsCount = assignedConversations.length;
  const services = servicesQuery.data?.services ?? [];
  const workMatchingData = workMatchingQuery.data;
  const workPosts = workMatchingData?.mode === 'agency' ? workMatchingData.workPosts : workMatchingData?.matchedWork ?? [];
  const applications = workMatchingData?.mode === 'editor' ? workMatchingData.applications : [];
  const teamRequests = workMatchingData?.mode === 'editor' ? workMatchingData.invites : [];
  const contacts = contactsQuery.data?.contacts ?? [];
  const managers = managersQuery.data?.managers ?? [];
  const discoveryEditors = editorDiscoveryQuery.data?.mode === 'agency' ? editorDiscoveryQuery.data.editors : [];
  const discoveryAgencies = agencyDiscoveryQuery.data?.agencies ?? [];
  const walletSummary = walletQuery.data?.wallet;
  const accountingSummary = accountingQuery.data?.summary;
  const dashboardPayload = dashboardQuery.data;
  const freelancerDashboard = isFreelancer ? dashboardPayload as MobileFreelancerDashboardResponse | undefined : undefined;
  const trustScore = freelancerDashboard?.trust?.score ?? null;
  const freelancerOnline = availabilityQuery.isSuccess && !availabilityQuery.isError && availabilityQuery.data?.availability ? availabilityQuery.data.availability.onlineStatus === 'online' : null;
  const portfolioVideoDone = services.some((service) => Boolean(service.sampleVideoUrl || service.sampleVideoEmbedUrl || service.media?.some((item) => item.kind === 'video' && (item.sourceUrl || item.embedUrl))));
  const profileDone = setupGate.data?.profileComplete === true;

  const reviewStatuses = new Set(['SUBMITTED', 'UNDER_REVIEW', 'REVISION_REQUESTED']);
  const completedStatuses = new Set(['COMPLETED', 'PAID']);
  const openAssignments = assignments.filter((item) => {
    const status = String(item.status ?? '').toUpperCase();
    return status !== 'CANCELLED' && !reviewStatuses.has(status) && !completedStatuses.has(status);
  });
  const reviewAssignments = assignments.filter((item) => reviewStatuses.has(String(item.status ?? '').toUpperCase()));
  const completedAssignments = assignments.filter((item) => completedStatuses.has(String(item.status ?? '').toUpperCase()));
  const deliveryRisk = assignments.filter((item) => ['REVISION_REQUESTED', 'UNDER_REVIEW'].includes(item.status)).length;
  const pendingPaymentRequests = accountingSummary?.pending ?? getMetricValue(dashboardPayload, ['paymentRequests', 'pendingPaymentRequests']) ?? 0;
  const accountingTotal = (accountingSummary?.paidAmount ?? 0) + (accountingSummary?.pendingAmount ?? 0);
  const totalMoney = isFreelancer
    ? walletSummary?.grossEarned ?? getMetricValue(dashboardPayload, ['earnings', 'totalEarned']) ?? 0
    : accountingTotal || (getMetricValue(dashboardPayload, ['revenue', 'mrr', 'collectedRevenue']) ?? 0);
  const paidMoney = isFreelancer ? walletSummary?.availableForWithdrawal ?? 0 : accountingSummary?.paidAmount ?? 0;
  const pendingMoney = isFreelancer ? walletSummary?.pendingClearance ?? 0 : accountingSummary?.pendingAmount ?? 0;
  const newLeads = isFreelancer ? teamRequests.length + applications.length : contacts.length || conversations.length;
  const packageName = subscriptionQuery.data?.packageName || user?.packageName || 'No active package';
  const packageExpiresAt = subscriptionQuery.data?.packageExpiresAt ?? subscriptionQuery.data?.subscription?.expiresAt ?? user?.packageExpiresAt;
  const packageStatus = subscriptionQuery.data?.packageStatus ?? user?.packageStatus;
  const packageActive = subscriptionQuery.data ? subscriptionQuery.data.active : packageStatus === 'ACTIVE';
  const isAgencyPremium = Boolean(
    packageActive &&
    (packageName?.toLowerCase().includes('premium') || user?.packageId?.toLowerCase().includes('premium'))
  );

  const kpis = isFreelancer
    ? [
        {
          title: 'Active Work',
          value: formatNumber(openAssignments.length),
          helper: 'Assignments and selected work in progress.',
          icon: 'briefcase' as FeatherName,
          actionLabel: 'Work',
          onPress: () => router.push('/projects'),
        },
        {
          title: 'Applications',
          value: formatNumber(applications.length),
          helper: 'Open proposals and selection history.',
          icon: 'send' as FeatherName,
          actionLabel: 'Apply',
          onPress: () => router.push('/projects'),
        },
        {
          title: 'Earnings',
          value: formatCompactCurrency(totalMoney),
          helper: `${pendingPaymentRequests} payout request${pendingPaymentRequests === 1 ? '' : 's'} pending.`,
          icon: 'credit-card' as FeatherName,
          actionLabel: 'Wallet',
          onPress: () => router.push('/earnings'),
        },
        {
          title: 'Trust Score',
          value: trustScore == null ? 'Pending' : `${trustScore}/100`,
          helper: freelancerDashboard?.trust?.nextAction || 'Complete your skills assessment to build trust.',
          icon: 'award' as FeatherName,
          actionLabel: 'Test',
          onPress: () => router.push('/freelancer-test'),
        },
        {
          title: 'Services',
          value: formatNumber(services.length),
          helper: 'Profile supply available for discovery.',
          icon: 'layers' as FeatherName,
          actionLabel: 'Add',
          onPress: () => router.push('/service'),
        },
      ]
    : [
        {
          title: isSuperAdmin ? 'Agencies' : 'Open Chats',
          value: formatNumber(isSuperAdmin ? newLeads : conversations.length),
          helper: isSuperAdmin ? 'Platform demand and account activity.' : 'Live client threads and inquiries in inbox.',
          icon: 'message-circle' as FeatherName,
          actionLabel: 'Chats',
          onPress: () => router.push('/chats'),
        },
        {
          title: 'Assigned Editors',
          value: isAgencyPremium ? `${assignedChatsCount} (Unlimited)` : `${assignedChatsCount} / 2`,
          helper: isAgencyPremium
            ? `${openAssignments.length} active delivery project${openAssignments.length === 1 ? '' : 's'} · Agency Premium`
            : `${openAssignments.length} active delivery project${openAssignments.length === 1 ? '' : 's'}.`,
          icon: 'users' as FeatherName,
          actionLabel: 'Assign',
          onPress: () => router.push('/chats'),
        },
        {
          title: isSuperAdmin ? 'Revenue' : 'Pending Payments',
          value: formatCompactCurrency(isSuperAdmin ? totalMoney : pendingMoney),
          helper: `${pendingPaymentRequests} request${pendingPaymentRequests === 1 ? '' : 's'} waiting for action.`,
          icon: 'credit-card' as FeatherName,
          actionLabel: 'Money',
          onPress: () => router.push('/money'),
        },
        {
          title: 'Review queue',
          value: formatNumber(deliveryRisk),
          helper: 'Submissions and revisions needing attention.',
          icon: 'alert-triangle' as FeatherName,
          tone: deliveryRisk > 0 ? 'warning' as KpiTone : 'success' as KpiTone,
          actionLabel: 'Review',
          onPress: () => router.push('/projects'),
        },
      ];

  const recentRows = getRecentWorkRows(assignments, workPosts, mode);
  const performanceRows: ListItem[] = isFreelancer
    ? services.slice(0, 5).map((service) => ({
        id: service.id,
        title: service.title,
        subtitle: `${service.category || 'Service'}${service.basePrice ? ` - ${formatCompactCurrency(service.basePrice)}` : ''}`,
        status: safeStatus(service.status),
        icon: 'award',
      }))
    : managers.slice(0, 5).map((manager, index) => {
        const record = manager as Record<string, unknown>;
        return {
          id: getRecordString(record, 'id', `manager-${index}`),
          title: getRecordString(record, 'name', 'Manager'),
          subtitle: `${getRecordString(record, 'queue', 'General operations')} - ${getRecordArrayCount(record, 'permissions')} permissions`,
          status: safeStatus(getRecordString(record, 'status', 'Active')),
          icon: 'user-check',
        };
      });

  const activityRows: ListItem[] = notifications.slice(0, 5).map((notification) => ({
    id: notification.id,
    title: notification.title,
    subtitle: notification.body ?? notification.message ?? 'Gigxomi update',
    status: notification.readAt ? 'Read' : 'New',
    icon: 'bell',
  }));

  const quickActions = isFreelancer
    ? [
        { label: 'Open Chat', icon: 'message-circle' as FeatherName, route: '/chats' },
        { label: 'Add Service', icon: 'plus-circle' as FeatherName, route: '/service' },
        { label: 'Apply for Work', icon: 'target' as FeatherName, route: '/projects' },
        { label: 'Learning', icon: 'play-circle' as FeatherName, route: '/learning' },
        { label: 'View Earnings', icon: 'credit-card' as FeatherName, route: '/earnings' },
        { label: 'Settings', icon: 'settings' as FeatherName, route: '/settings' },
      ]
    : [
        { label: 'Open Chat', icon: 'message-circle' as FeatherName, route: '/chats' },
        { label: 'Connect APIs', icon: 'link' as FeatherName, route: '/integrations' },
        { label: 'Create Project', icon: 'plus-circle' as FeatherName, route: '/projects' },
        { label: isManager ? 'Review Work' : 'Manage Team', icon: 'users' as FeatherName, route: isManager ? '/projects' : '/team' },
        { label: 'Plan Status', icon: 'shield' as FeatherName, route: '/package' },
        ...(!isManager ? [{ label: 'Learning', icon: 'play-circle' as FeatherName, route: '/learning' }] : []),
        ...(!isManager ? [{ label: 'Settings', icon: 'settings' as FeatherName, route: '/settings' }] : []),
      ];

  const onRefresh = () => {
    setRefreshing(true);
    void refreshDashboard().finally(() => setRefreshing(false));
  };

  return (
    <Screen
      scroll
      contentStyle={styles.content}
      refreshControl={<BrandedRefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.accentStrong} />}
    >
      <GigxomiHeader
        rightSlot={
          <View style={styles.headerActions}>
            <IconButton label="Notifications" icon="bell" onPress={() => router.push('/notifications')} />
            <IconButton label={isFreelancer ? "Add a service" : "Create work"} icon="plus" onPress={() => router.push(isFreelancer ? '/service' : '/projects')} />
          </View>
        }
      />

      <View style={styles.hero}>
        <View style={styles.heroCopy}>
          <View style={styles.roleRow}>
            <Text style={styles.roleLabel}>{getDashboardLabel(mode)}</Text>

          </View>
          <Text style={styles.heroTitle}>Welcome back, {user?.displayName?.split(' ')[0] || 'Gigxomi'}.</Text>
          <Text style={styles.heroSubtitle}>{getWelcomeCopy(mode)}</Text>
        </View>
        <SearchPill mode={mode} onPress={() => setSearchOpen(true)} />
      </View>

      {isFreelancer ? <FreelancerGrowthCard online={freelancerOnline} portfolioVideoDone={portfolioVideoDone} profileDone={profileDone} saving={setAvailability.isPending} trustScore={trustScore} onToggle={() => setAvailability.mutate(freelancerOnline ? 'offline' : 'online')} /> : null}

      {isFreelancer ? (
        <FreelancerReferralCard
          referralCode={referralQuery.data?.referralCode || 'GXEDITOR'}
          playStoreUrl={
            referralQuery.data?.playStoreUrl ||
            `https://play.google.com/store/apps/details?id=com.gigxomi.app&referrer=ref%3D${encodeURIComponent(referralQuery.data?.referralCode || '')}`
          }
          commissionEarned={referralQuery.data?.metrics?.totalCommissionEarned ?? 0}
          registeredAgencies={referralQuery.data?.metrics?.registeredAgencies ?? 0}
          onPress={() => router.push('/referral')}
        />
      ) : null}

      <QueryFeedback error={dashboardQuery.error || assignmentsQuery.error || workMatchingQuery.error} onRetry={onRefresh} />
      {mode === 'agency' && !isAgencyPremium ? (
        <View style={styles.quotaCard}>
          <View style={styles.quotaHeader}>
            <View style={{ flex: 1, gap: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Feather name="zap" size={14} color={theme.colors.accent} />
                <Text style={styles.quotaEyebrow}>AGENCY WORKSPACE CAPACITY</Text>
              </View>
              <Text style={styles.quotaTitle}>
                {assignedChatsCount} / 2 Chats Assigned
              </Text>
            </View>
            <View style={[styles.quotaBadge, assignedChatsCount >= 2 ? styles.quotaBadgeWarning : styles.quotaBadgeActive]}>
              <Text style={[styles.quotaBadgeText, assignedChatsCount >= 2 ? styles.quotaBadgeTextWarning : styles.quotaBadgeTextActive]}>
                {assignedChatsCount >= 2 ? 'Limit Reached' : `${Math.max(0, 2 - assignedChatsCount)} Available`}
              </Text>
            </View>
          </View>

          {/* Progress Bar */}
          <View style={styles.progressBarTrack}>
            <View
              style={[
                styles.progressBarFill,
                {
                  width: `${Math.min((assignedChatsCount / 2) * 100, 100)}%`,
                  backgroundColor: assignedChatsCount >= 2 ? theme.colors.warning : theme.colors.accent,
                },
              ]}
            />
          </View>

          <Text style={styles.quotaDescription}>
            {assignedChatsCount >= 2
              ? 'You have reached the 2 chat assignment limit on the Freemium package. Upgrade your package now to assign unlimited video editors and unlock full agency automation.'
              : 'On the Freemium plan, assigning 2 chats to editors will require a package upgrade to keep assigning more editors. Upgrade anytime to scale.'}
          </Text>

          <View style={{ marginTop: 4, flexDirection: 'row', gap: 10 }}>
            <AppButton
              title="Upgrade Package"
              icon={<Feather name="arrow-up-right" size={15} color={theme.colors.background} />}
              onPress={() => router.push('/package')}
            />
            <AppButton
              title="View Chats"
              variant="secondary"
              onPress={() => router.push('/chats')}
            />
          </View>
        </View>
      ) : null}

      <PipelineCard active={openAssignments.length} review={reviewAssignments.length} completed={completedAssignments.length} />

      {mode === 'agency' ? <AgencyChannelsCard token={auth.token} role={user?.role} /> : null}

      {!isManager && !isSuperAdmin ? <DiscoveryCarousel agencies={discoveryAgencies} editors={discoveryEditors} failed={isFreelancer ? agencyDiscoveryQuery.isError : editorDiscoveryQuery.isError} isAgency={!isFreelancer} loading={isFreelancer ? agencyDiscoveryQuery.isLoading : editorDiscoveryQuery.isLoading} onOpenDirectory={() => router.push('/team')} onPortfolio={setPortfolioEditor} onOpenEditor={(editorId) => router.push(`/editor/${encodeURIComponent(editorId)}`)} onRetry={() => { if (isFreelancer) void agencyDiscoveryQuery.refetch(); else void editorDiscoveryQuery.refetch(); }} /> : null}

      {!isManager && !isSuperAdmin ? <LearningDashboardCard catalog={learningQuery.data} failed={learningQuery.isError} isAgency={!isFreelancer} loading={learningQuery.isLoading} onOpen={(destination) => router.push(destination ? { pathname: '/learning', params: destination } : '/learning')} onRetry={() => { void learningQuery.refetch(); }} /> : null}

      {portfolioEditor ? <EditorPortfolioPlayerModal key={portfolioEditor.id} editor={portfolioEditor} onClose={() => setPortfolioEditor(null)} onViewProfile={() => { const id = portfolioEditor.id; setPortfolioEditor(null); router.push(`/editor/${encodeURIComponent(id)}`); }} /> : null}

      <View style={styles.kpiGrid}>
        {kpis.map((kpi) => (
          <KpiCard key={kpi.title} {...kpi} />
        ))}
        {!isFreelancer ? <PackageStatusCard active={packageActive} expiresAt={packageExpiresAt} packageName={packageName} status={packageStatus} /> : null}
      </View>

      <View style={styles.twoColumn}>
        <RevenueCard total={totalMoney} paid={paidMoney} pending={pendingMoney} onViewAll={() => router.push(isFreelancer ? '/earnings' : '/money')} />
      </View>

      <View style={styles.twoColumn}>
        <SectionPanel title={isFreelancer ? 'Recent Work' : 'Recent Projects'} icon="briefcase" action="View all" onAction={() => router.push('/projects')}>
          {recentRows.length ? (
            recentRows.map((item, index) => <ListRow key={item.id} item={item} index={index} />)
          ) : (
            <EmptyBlock title="No active work yet" action={isFreelancer ? 'Apply for work or publish a service to start.' : 'Create a project to start tracking delivery.'} />
          )}
        </SectionPanel>

        <SectionPanel
          title={isFreelancer ? 'Service Performance' : 'Team Performance'}
          icon="bar-chart-2"
          action="View all"
          onAction={() => router.push(isFreelancer ? '/service' : '/team')}
        >
          {performanceRows.length ? (
            performanceRows.map((item, index) => <ListRow key={item.id} item={item} index={index} />)
          ) : (
            <EmptyBlock title={isFreelancer ? 'No services yet' : 'No team members yet'} action={isFreelancer ? 'Add your first service to unlock discovery.' : 'Add managers or freelancers to measure capacity.'} />
          )}
        </SectionPanel>
      </View>

      <View style={styles.twoColumn}>
        <SectionPanel title="Activity Feed" icon="activity" action="View all" onAction={() => router.push('/notifications')}>
          {activityRows.length ? (
            activityRows.map((item, index) => <ListRow key={item.id} item={item} index={index} />)
          ) : (
            <EmptyBlock title="No new activity" action="Important updates will appear here." />
          )}
        </SectionPanel>

        <SectionPanel title="Quick Actions" icon="zap">
          <View style={styles.quickGrid}>
            {quickActions.map((action) => (
              <QuickAction key={action.label} label={action.label} icon={action.icon} onPress={() => router.push(action.route as never)} />
            ))}
          </View>
        </SectionPanel>
      </View>

      <View style={styles.bottomSpacer} />
      <DashboardSearchModal
        assignments={assignments}
        conversations={conversations}
        services={services}
        visible={searchOpen}
        workPosts={workPosts}
        onClose={() => setSearchOpen(false)}
        onSelect={(route) => {
          setSearchOpen(false);
          router.push(route as never);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: theme.spacing.lg,
    paddingBottom: theme.spacing.xl * 4,
  },
  headerActions: {
    flexDirection: 'row',
    gap: theme.spacing.md,
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(185, 247, 25, 0.1)',
    borderColor: 'rgba(185, 247, 25, 0.24)',
    borderRadius: 24,
    borderWidth: 1,
    height: 52,
    justifyContent: 'center',
    shadowColor: theme.colors.accentStrong,
    shadowOpacity: 0.18,
    shadowRadius: 16,
    width: 52,
  },
  pressed: {
    opacity: 0.72,
    transform: [{ scale: 0.98 }],
  },
  hero: {
    gap: 12,
  },
  heroCopy: {
    gap: theme.spacing.sm,
  },
  roleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  roleLabel: {
    color: theme.colors.text,
    fontWeight: '800',
    fontSize: 15,
  },
  heroTitle: {
    color: theme.colors.text,
    fontWeight: '900',
    fontSize: 25,
    letterSpacing: -0.8,
    lineHeight: 31,
  },
  heroSubtitle: {
    color: theme.colors.mutedText,
    fontWeight: '400',
    fontSize: 15,
    lineHeight: 22,
  },
  growthCard: { backgroundColor: theme.colors.surface, borderColor: theme.colors.accentBorder, borderRadius: 24, borderWidth: 1, gap: theme.spacing.md, padding: theme.spacing.lg },
  growthTop: { alignItems: 'flex-start', flexDirection: 'row', gap: theme.spacing.md },
  growthCopy: { flex: 1, gap: 5 },
  growthEyebrow: { color: theme.colors.accentStrong, fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
  growthTitle: { color: theme.colors.text, fontSize: 20, fontWeight: '900', lineHeight: 25 },
  growthHelper: { color: theme.colors.mutedText, fontSize: 12, lineHeight: 18 },
  presenceToggle: { backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.border, borderRadius: 999, borderWidth: 1, height: 34, justifyContent: 'center', paddingHorizontal: 3, width: 60 },
  presenceToggleOn: { backgroundColor: theme.colors.accentStrong, borderColor: theme.colors.accentStrong },
  presenceThumb: { backgroundColor: theme.colors.mutedText, borderRadius: 999, height: 26, width: 26 },
  presenceThumbOn: { alignSelf: 'flex-end', backgroundColor: theme.colors.background },
  growthStatusRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  liveDot: { borderRadius: 999, height: 9, width: 9 },
  liveDotOnline: { backgroundColor: theme.colors.success },
  liveDotOffline: { backgroundColor: theme.colors.mutedText },
  liveCopy: { color: theme.colors.textSecondary, flex: 1, fontSize: 11, fontWeight: '700', lineHeight: 16 },
  completionTabs: { flexDirection: 'row', gap: 8 },
  completionTab: { backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.borderSubtle, borderRadius: 16, borderWidth: 1, flex: 1, gap: 4, minHeight: 98, padding: 11 },
  completionTabDone: { backgroundColor: theme.colors.accentStrong, borderColor: theme.colors.accentStrong },
  completionTitle: { color: theme.colors.text, fontSize: 11, fontWeight: '900' },
  completionTitleDone: { color: theme.colors.background },
  completionMeta: { color: theme.colors.accentStrong, fontSize: 10, fontWeight: '800' },
  completionMetaDone: { color: theme.colors.background },
  quotaCard: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    gap: 12,
  },
  quotaHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  quotaEyebrow: {
    color: theme.colors.accent,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  quotaTitle: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: '900',
  },
  quotaBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  quotaBadgeActive: {
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    borderColor: 'rgba(34, 197, 94, 0.35)',
  },
  quotaBadgeWarning: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderColor: 'rgba(239, 68, 68, 0.35)',
  },
  quotaBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  quotaBadgeTextActive: {
    color: '#22C55E',
  },
  quotaBadgeTextWarning: {
    color: '#EF4444',
  },
  progressBarTrack: {
    height: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  quotaDescription: {
    color: theme.colors.mutedText,
    fontSize: 12,
    lineHeight: 18,
  },
  channelsCard: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    gap: 14,
  },
  channelsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  channelsEyebrow: {
    color: theme.colors.accent,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  channelsTitle: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: '900',
  },
  channelsDescription: {
    color: theme.colors.mutedText,
    fontSize: 12.5,
    lineHeight: 18,
  },
  channelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.surfaceRaised,
    borderColor: theme.colors.borderSubtle,
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    gap: 10,
  },
  channelInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  channelIconBadge: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  channelIconActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  channelName: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  channelStatusPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
  },
  channelStatusPillOnline: {
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
  },
  channelStatusPillOffline: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  channelStatusText: {
    fontSize: 10,
    fontWeight: '800',
  },
  channelStatusTextOnline: {
    color: '#22C55E',
  },
  channelStatusTextOffline: {
    color: theme.colors.mutedText,
  },
  channelMeta: {
    color: theme.colors.mutedText,
    fontSize: 11,
    lineHeight: 15,
  },
  channelActionButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 80,
  },
  channelActionButtonPrimary: {
    backgroundColor: theme.colors.accent,
  },
  channelActionButtonSecondary: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
  },
  channelActionText: {
    fontSize: 12,
    fontWeight: '800',
  },
  channelActionTextPrimary: {
    color: theme.colors.background,
  },
  channelActionTextSecondary: {
    color: theme.colors.textSecondary,
  },
  channelsFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
  },
  channelsFooterText: {
    color: theme.colors.accent,
    fontSize: 12,
    fontWeight: '700',
  },
  pipelineSummary: { gap: 12, backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderWidth: 1, borderRadius: 20, padding: 14 },
  discoverySection: { gap: theme.spacing.md },
  sectionHeadingRow: { alignItems: 'flex-start', flexDirection: 'row', gap: theme.spacing.md },
  sectionHeadingCopy: { flex: 1, gap: 5 },
  sectionArrow: { alignItems: 'center', backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.border, borderRadius: 18, borderWidth: 1, height: 42, justifyContent: 'center', width: 42 },
  slideRail: { gap: 12, paddingRight: theme.spacing.lg },
  discoverySlide: { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: 20, borderWidth: 1, gap: 7, minHeight: 218, padding: 15, width: 238 },
  slideSkeleton: { justifyContent: 'center' },
  discoveryTop: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  discoveryAvatar: { alignItems: 'center', backgroundColor: theme.colors.accentSoft, borderColor: theme.colors.accentBorder, borderRadius: 20, borderWidth: 1, height: 40, justifyContent: 'center', width: 40 },
  discoveryAvatarOnline: { borderColor: theme.colors.success },
  discoveryAvatarText: { color: theme.colors.text, fontSize: 12, fontWeight: '900' },
  presencePill: { backgroundColor: theme.colors.accentSoft, borderColor: theme.colors.accentBorder, borderRadius: 999, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 5 },
  presencePillOnline: { backgroundColor: 'rgba(55, 214, 125, 0.12)', borderColor: 'rgba(55, 214, 125, 0.28)' },
  presencePillOffline: { backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.border },
  presencePillText: { color: theme.colors.textSecondary, fontSize: 10, fontWeight: '900' },
  discoveryName: { color: theme.colors.text, fontSize: 17, fontWeight: '900' },
  discoveryRole: { color: theme.colors.mutedText, fontSize: 12, lineHeight: 17, minHeight: 17 },
  discoveryDivider: { backgroundColor: theme.colors.borderSubtle, height: 1, marginVertical: 2 },
  discoveryProof: { color: theme.colors.text, fontSize: 12, fontWeight: '900' },
  discoveryMeta: { color: theme.colors.mutedText, fontSize: 10.5, lineHeight: 15 },
  discoveryPrice: { color: theme.colors.text, fontSize: 13, fontWeight: '900' },
  learningCard: { backgroundColor: theme.colors.surface, borderColor: theme.colors.accentBorder, borderRadius: 24, borderWidth: 1, gap: theme.spacing.md, overflow: 'hidden', padding: theme.spacing.lg },
  learningHeader: { alignItems: 'flex-start', flexDirection: 'row', gap: theme.spacing.md, justifyContent: 'space-between' },
  learningHeaderCopy: { flex: 1, gap: 5 },
  learningEyebrow: { color: theme.colors.accentStrong, fontSize: 11, fontWeight: '900', letterSpacing: 0.4, textTransform: 'uppercase' },
  learningHeading: { color: theme.colors.text, fontSize: 19, fontWeight: '900', lineHeight: 24 },
  learningDescription: { color: theme.colors.mutedText, fontSize: 12, lineHeight: 18 },
  learningResume: { backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.borderSubtle, borderRadius: 18, borderWidth: 1, flexDirection: 'row', gap: theme.spacing.md, overflow: 'hidden', padding: 10 },
  learningPoster: { alignSelf: 'stretch', backgroundColor: theme.colors.backgroundSoft, borderRadius: 14, minHeight: 128, overflow: 'hidden', width: 118 },
  learningPosterImage: { height: '100%', resizeMode: 'cover', width: '100%' },
  learningPosterFallback: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  learningPlay: { alignItems: 'center', backgroundColor: theme.colors.accentStrong, borderRadius: 999, bottom: 9, height: 36, justifyContent: 'center', position: 'absolute', right: 9, width: 36 },
  learningBody: { flex: 1, gap: 7, justifyContent: 'center', minWidth: 0 },
  learningPlaylist: { color: theme.colors.accentStrong, fontSize: 10, fontWeight: '900', textTransform: 'uppercase' },
  learningTitle: { color: theme.colors.text, fontSize: 14, fontWeight: '900', lineHeight: 19 },
  learningMeta: { color: theme.colors.mutedText, fontSize: 10.5, fontWeight: '700', lineHeight: 15 },
  learningProgressTrack: { backgroundColor: theme.colors.backgroundSoft, borderRadius: 999, height: 6, overflow: 'hidden' },
  learningProgressFill: { backgroundColor: theme.colors.accentStrong, borderRadius: 999, height: '100%' },
  learningLink: { color: theme.colors.accentStrong, fontSize: 12, fontWeight: '900' },
  learningLinkButton: { alignSelf: 'flex-start', minHeight: 40, justifyContent: 'center' },
  learningError: { backgroundColor: theme.colors.surfaceRaised, borderRadius: 18, gap: 7, padding: theme.spacing.md },
  learningLoading: { backgroundColor: theme.colors.surfaceRaised, borderRadius: 18, gap: 12, minHeight: 116, padding: theme.spacing.lg },
  learningSkeletonWide: { backgroundColor: theme.colors.borderSubtle, borderRadius: 8, height: 18, width: '82%' },
  learningSkeletonShort: { backgroundColor: theme.colors.borderSubtle, borderRadius: 8, height: 12, width: '54%' },
  learningCatalog: { gap: theme.spacing.md },
  learningReportRow: { flexDirection: 'row', gap: 8 },
  learningReportItem: { backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.borderSubtle, borderRadius: 14, borderWidth: 1, flex: 1, gap: 3, padding: 10 },
  learningReportValue: { color: theme.colors.text, fontSize: 16, fontWeight: '900' },
  learningReportLabel: { color: theme.colors.mutedText, fontSize: 9.5, fontWeight: '800' },
  courseRail: { gap: 12, paddingRight: theme.spacing.lg },
  courseSlide: { backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.borderSubtle, borderRadius: 18, borderWidth: 1, overflow: 'hidden', width: 258 },
  coursePoster: { backgroundColor: theme.colors.backgroundSoft, height: 130, overflow: 'hidden', width: '100%' },
  courseBody: { gap: 7, padding: 13 },
  searchPill: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.md,
    minHeight: 58,
    paddingHorizontal: theme.spacing.lg,
  },
  searchText: {
    color: theme.colors.mutedText,
    flex: 1,
    fontWeight: '400',
    fontSize: 15,
  },
  searchTune: {
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceRaised,
    borderColor: theme.colors.border,
    borderRadius: 16,
    borderWidth: 1,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  searchModalBackdrop: {
    flex: 1,
    justifyContent: 'flex-start',
    backgroundColor: 'rgba(0,0,0,0.46)',
    padding: theme.spacing.lg,
    paddingTop: 74,
  },
  searchModalScrim: {
    ...StyleSheet.absoluteFillObject,
  },
  searchModal: {
    maxHeight: '78%',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.backgroundSoft,
    overflow: 'hidden',
  },
  searchModalInputRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderSubtle,
    paddingHorizontal: theme.spacing.md,
  },
  searchModalInput: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  searchModalClose: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 17,
    backgroundColor: theme.colors.surfaceRaised,
  },
  searchResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderSubtle,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 12,
  },
  searchResultIcon: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 19,
    backgroundColor: 'rgba(185, 247, 25, 0.1)',
  },
  searchResultCopy: {
    flex: 1,
    gap: 2,
  },
  searchResultTitle: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  searchResultSubtitle: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  searchEmpty: {
    color: theme.colors.mutedText,
    fontSize: 13,
    fontWeight: '700',
    padding: theme.spacing.lg,
    textAlign: 'center',
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
  },
  kpiCard: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: 24,
    borderWidth: 1,
    flexGrow: 1,
    flexBasis: '47%',
    gap: theme.spacing.sm,
    minHeight: 184,
    minWidth: 154,
    maxWidth: '49%',
    overflow: 'hidden',
    padding: theme.spacing.lg,
  },
  packageCard: {
    backgroundColor: theme.colors.surface,
    borderColor: 'rgba(185, 247, 25, 0.18)',
    borderRadius: 24,
    borderWidth: 1,
    flexGrow: 1,
    flexBasis: '47%',
    gap: theme.spacing.md,
    minHeight: 184,
    minWidth: 154,
    maxWidth: '49%',
    padding: theme.spacing.lg,
  },
  packageHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  packagePill: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  packagePillActive: {
    backgroundColor: 'rgba(55, 214, 125, 0.12)',
    borderColor: 'rgba(55, 214, 125, 0.26)',
  },
  packagePillWarning: {
    backgroundColor: 'rgba(255, 191, 71, 0.12)',
    borderColor: 'rgba(255, 191, 71, 0.28)',
  },
  packagePillText: {
    color: theme.colors.success,
    fontWeight: '900',
    fontSize: 11,
  },
  packagePillTextWarning: {
    color: theme.colors.warning,
  },
  kpiHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  kpiIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(185, 247, 25, 0.1)',
    borderColor: 'rgba(185, 247, 25, 0.22)',
    borderRadius: 18,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  kpiIconWarning: {
    backgroundColor: 'rgba(255, 191, 71, 0.12)',
    borderColor: 'rgba(255, 191, 71, 0.28)',
  },
  kpiIconSuccess: {
    backgroundColor: 'rgba(55, 214, 125, 0.12)',
    borderColor: 'rgba(55, 214, 125, 0.26)',
  },
  kpiAction: {
    color: theme.colors.accentStrong,
    fontWeight: '800',
    fontSize: 12,
  },
  kpiTitle: {
    color: theme.colors.textSecondary,
    fontWeight: '800',
    fontSize: 13,
  },
  kpiValue: {
    color: theme.colors.text,
    fontWeight: '900',
    fontSize: 26,
    letterSpacing: -0.7,
  },
  kpiHelper: {
    color: theme.colors.mutedText,
    fontWeight: '400',
    fontSize: 12,
    lineHeight: 17,
  },
  sparkBars: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 4,
    height: 36,
  },
  sparkBar: {
    backgroundColor: theme.colors.accentStrong,
    borderRadius: 999,
    flex: 1,
    minWidth: 4,
  },
  sparkBarEmpty: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  twoColumn: {
    gap: theme.spacing.md,
  },
  panel: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: 26,
    borderWidth: 1,
    overflow: 'hidden',
    padding: theme.spacing.lg,
  },
  panelHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.lg,
  },
  panelTitleWrap: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  panelIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(185, 247, 25, 0.08)',
    borderRadius: 14,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  panelTitle: {
    color: theme.colors.text,
    fontWeight: '800',
    fontSize: 17,
  },
  panelAction: {
    color: theme.colors.accentStrong,
    fontWeight: '800',
    fontSize: 12,
  },
  panelMuted: {
    color: theme.colors.mutedText,
    fontWeight: '400',
    fontSize: 13,
    marginTop: 4,
  },
  largeValue: {
    color: theme.colors.text,
    fontWeight: '900',
    fontSize: 34,
    letterSpacing: -1,
  },
  chart: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 10,
    height: 130,
    marginTop: theme.spacing.lg,
  },
  chartColumn: {
    alignItems: 'center',
    flex: 1,
    gap: 8,
    justifyContent: 'flex-end',
  },
  chartBar: {
    backgroundColor: theme.colors.accentStrong,
    borderRadius: 999,
    shadowColor: theme.colors.accentStrong,
    shadowOpacity: 0.26,
    shadowRadius: 10,
    width: '70%',
  },
  chartBarEmpty: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    shadowOpacity: 0,
  },
  chartLabel: {
    color: theme.colors.mutedText,
    fontWeight: '800',
    fontSize: 10,
  },
  pipelineWrap: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.lg,
  },
  pipelineRing: {
    alignItems: 'center',
    backgroundColor: 'rgba(185, 247, 25, 0.1)',
    borderColor: 'rgba(185, 247, 25, 0.32)',
    borderRadius: 68,
    borderWidth: 14,
    height: 136,
    justifyContent: 'center',
    width: 136,
  },
  pipelineTotal: {
    color: theme.colors.text,
    fontWeight: '900',
    fontSize: 32,
  },
  pipelineLabel: {
    color: theme.colors.mutedText,
    fontWeight: '800',
    fontSize: 12,
  },
  pipelineLegend: {
    flex: 1,
    gap: theme.spacing.sm,
  },
  legendRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  legendDot: {
    borderRadius: 999,
    height: 10,
    width: 10,
  },
  legendLabel: {
    color: theme.colors.textSecondary,
    flex: 1,
    fontWeight: '800',
    fontSize: 13,
  },
  legendValue: {
    color: theme.colors.text,
    fontWeight: '900',
    fontSize: 14,
  },
  listRow: {
    alignItems: 'center',
    borderTopColor: 'rgba(255,255,255,0.07)',
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
  listRowFirst: {
    borderTopWidth: 0,
    paddingTop: 0,
  },
  listAvatar: {
    alignItems: 'center',
    backgroundColor: 'rgba(185, 247, 25, 0.09)',
    borderColor: 'rgba(185, 247, 25, 0.2)',
    borderRadius: 22,
    borderWidth: 1,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  listContent: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  listTitle: {
    color: theme.colors.text,
    fontWeight: '800',
    fontSize: 15,
  },
  listSubtitle: {
    color: theme.colors.mutedText,
    fontWeight: '400',
    fontSize: 13,
    lineHeight: 18,
  },
  listRight: {
    color: theme.colors.textSecondary,
    fontWeight: '800',
    fontSize: 12,
  },
  statusPill: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(185, 247, 25, 0.09)',
    borderColor: 'rgba(185, 247, 25, 0.22)',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  statusPillText: {
    color: theme.colors.accentStrong,
    fontWeight: '800',
    fontSize: 11,
  },
  emptyBlock: {
    alignItems: 'center',
    borderColor: theme.colors.border,
    borderRadius: 22,
    borderStyle: 'dashed',
    borderWidth: 1,
    gap: theme.spacing.sm,
    padding: theme.spacing.xl,
  },
  emptyIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(185, 247, 25, 0.1)',
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  emptyTitle: {
    color: theme.colors.text,
    fontWeight: '800',
    fontSize: 15,
    textAlign: 'center',
  },
  emptyText: {
    color: theme.colors.mutedText,
    fontWeight: '400',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
  },
  quickAction: {
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceRaised,
    borderColor: theme.colors.border,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.sm,
    minHeight: 52,
    minWidth: '47%',
    paddingHorizontal: theme.spacing.md,
  },
  quickActionText: {
    color: theme.colors.text,
    flex: 1,
    fontWeight: '800',
    fontSize: 13,
  },
  referralCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.lg,
    gap: 10,
  },
  referralTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  referralBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: theme.colors.accent,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 14,
  },
  referralBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#000',
    letterSpacing: 0.5,
  },
  referralCodePill: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.accentStrong,
    fontFamily: 'monospace',
  },
  referralTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: theme.colors.text,
  },
  referralSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    color: theme.colors.mutedText,
  },
  referralMetricsRow: {
    flexDirection: 'row',
    gap: 8,
    marginVertical: 2,
  },
  referralMetricChip: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: 6,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  referralMetricChipValue: {
    fontSize: 14,
    fontWeight: '800',
    color: theme.colors.text,
  },
  referralMetricChipLabel: {
    fontSize: 10,
    color: theme.colors.mutedText,
    marginTop: 1,
  },
  referralActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    gap: 8,
  },
  referralCopyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    flex: 1,
  },
  referralCopyBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.accentStrong,
  },
  referralLinkArrow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  referralLinkText: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.accentStrong,
  },
  bottomSpacer: {
    height: theme.spacing.xl,
  },
});
