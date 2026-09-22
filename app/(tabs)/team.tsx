import { LearningView } from '@/src/components/learning/LearningScreen';
import { Feather } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Image, KeyboardAvoidingView, Modal, Platform, ScrollView, Pressable, StyleSheet, Text, View } from 'react-native';
import { AgencyTeamScreen } from '@/src/components/team/AgencyTeamScreen';
import { QueryFeedback, workStyles as w } from '@/src/components/work/WorkPrimitives';

import { AppButton } from '@/src/components/AppButton';
import { AppCard } from '@/src/components/AppCard';
import { AppInput } from '@/src/components/AppInput';
import { BrandedRefreshControl } from '@/src/components/BrandedRefreshControl';
import { GigxomiHeader } from '@/src/components/GigxomiHeader';
import { Screen } from '@/src/components/Screen';
import { StableAvatar } from '@/src/components/StableAvatar';
import { theme } from '@/src/constants/theme';
import { useAuth } from '@/src/hooks/useAuth';
import { useRefreshOnFocus } from '@/src/hooks/useRefreshOnFocus';
import { useAgencyDirectory, useEditorDirectory, useRequestAgency, useUpdateTeamMembership } from '@/src/hooks/useTeam';
import { getSiteBaseUrl } from '@/src/lib/api';
import type { MobileAgencyDirectoryProfile, MobileAgencyTeamMembership, MobileTeamMembershipStatus } from '@/src/types';

function labelize(value: string) {
  return value.toLowerCase().split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

function mediaUrl(value?: string | null) {
  if (!value) return '';
  return /^https?:\/\//i.test(value) ? value : `${getSiteBaseUrl()}${value.startsWith('/') ? '' : '/'}${value}`;
}

function StatusPill({ label }: { label: string }) {
  return <View style={styles.pill}><Text style={styles.pillText}>{labelize(label)}</Text></View>;
}

function AgencyRequestCard({ busy, item, onAction }: {
  busy: boolean;
  item: MobileAgencyTeamMembership;
  onAction: (status: MobileTeamMembershipStatus) => void;
}) {
  const isAgencyInvite = item.direction === 'AGENCY_TO_FREELANCER';
  return (
    <AppCard style={styles.editorCard}>
      <View style={styles.cardTop}>
        <View style={styles.avatar}><Text style={styles.avatarText}>{item.agencyName.slice(0, 2).toUpperCase()}</Text></View>
        <View style={styles.cardHeading}>
          <Text style={styles.cardTitle}>{item.agencyName}</Text>
          <Text style={styles.cardMeta}>{item.status === 'ACTIVE' ? 'You’re part of this agency’s team' : isAgencyInvite ? 'Agency sent you a team invitation' : `Your ${item.requestKind === 'WORK' ? 'work' : 'team'} request · ${labelize(item.status).toLowerCase()}`}</Text>
        </View>
        <StatusPill label={item.status} />
      </View>
      <Text style={styles.cardCopy}>{item.agencyBrief}</Text>
      {item.invitedByName ? <Text style={styles.inviteContext}>Sent by {item.invitedByName} on behalf of {item.agencyName}</Text> : null}
      {item.status === 'INVITED' && isAgencyInvite ? (
        <View style={styles.actionRow}>
          <AppButton loading={busy} title="Accept agency invite" onPress={() => onAction('ACTIVE')} />
          <AppButton loading={busy} title="Decline" variant="danger" onPress={() => onAction('DECLINED')} />
        </View>
      ) : null}
    </AppCard>
  );
}

function AgencyProfileCard({ agency, onRequest }: { agency: MobileAgencyDirectoryProfile; onRequest: (kind: 'TEAM' | 'WORK') => void }) {
  const location = [agency.office.city, agency.office.state].filter(Boolean).join(', ') || agency.office.country;
  const review = agency.reviews[0];
  const cover = mediaUrl(agency.coverUrl);
  return (
    <AppCard style={styles.editorCard}>
      {cover ? (
        <View style={styles.agencyHero}>
          <Image alt="" accessible={false} accessibilityIgnoresInvertColors source={{ uri: cover }} style={styles.portfolioImage} />
          <View style={styles.portfolioScrim} />
          <View style={styles.agencyHeroCopy}>
            <View style={styles.hiringBadge}>
              <Feather color={theme.colors.accent} name="briefcase" size={12} />
              <Text style={styles.hiringBadgeText}>{agency.hiringStatus || 'ACTIVELY HIRING'}</Text>
            </View>
            <Text numberOfLines={2} style={styles.agencyHeroTitle}>{agency.tagline || `Build your next editing win with ${agency.publicName}`}</Text>
          </View>
        </View>
      ) : (
        <View style={styles.agencyBannerClean}>
          <View style={styles.hiringBadge}>
            <Feather color={theme.colors.accent} name="briefcase" size={12} />
            <Text style={styles.hiringBadgeText}>{agency.hiringStatus || 'ACTIVELY HIRING EDITORS'}</Text>
          </View>
          <Text numberOfLines={2} style={styles.agencyBannerTitle}>
            {agency.tagline || `Build your next editing win with ${agency.publicName}`}
          </Text>
        </View>
      )}
      <View style={styles.cardTop}>
        <StableAvatar imageUrl={mediaUrl(agency.logoUrl)} label={agency.publicName} size={52} />
        <View style={styles.cardHeading}>
          <Text style={styles.cardTitle}>{agency.publicName}</Text>
          <Text style={styles.cardMeta}>{location} · Agency Trust {agency.reputation.score}/100</Text>
        </View>
        <StatusPill label={agency.reputation.band} />
      </View>
      <Text numberOfLines={4} style={styles.cardCopy}>{agency.description || 'A verified Gigxomi agency building reliable creative partnerships.'}</Text>
      <View style={styles.skillRow}>{agency.specialties.slice(0, 3).map((item) => <View key={item} style={styles.skillChip}><Text style={styles.skillText}>{item}</Text></View>)}{agency.specialties.length > 3 ? <Text style={styles.moreSkills}>+{agency.specialties.length - 3}</Text> : null}</View>
      <View style={styles.agencyStats}>
        <View style={styles.agencyStat}><Text style={styles.agencyStatValue}>{agency.stats.completedOrders}</Text><Text style={styles.proofLabel}>Projects</Text></View>
        <View style={styles.agencyStat}><Text style={styles.agencyStatValue}>{agency.stats.averageRating || 'New'}</Text><Text style={styles.proofLabel}>Rating</Text></View>
        <View style={styles.agencyStat}><Text style={styles.agencyStatValue}>{agency.stats.openOpportunities}</Text><Text style={styles.proofLabel}>Open roles</Text></View>
      </View>
      {agency.serviceOffers[0] ? <View style={styles.agencyOffer}><Feather color={theme.colors.accent} name="zap" size={17} /><View style={styles.grow}><Text style={styles.serviceTitle}>{agency.serviceOffers[0].title}</Text><Text style={styles.serviceMeta}>{agency.serviceOffers[0].priceLabel} · {agency.serviceOffers[0].summary}</Text></View></View> : null}
      {review ? <View style={styles.reviewQuote}><Text style={styles.reviewStars}>★ {review.rating.toFixed(1)} · Verified client</Text><Text numberOfLines={3} style={styles.reviewText}>“{review.comment}”</Text></View> : null}
      <View style={styles.actionColumn}>
        <AppButton onPress={() => onRequest('WORK')} title="Request project work" />
        <AppButton onPress={() => onRequest('TEAM')} title="Request to join Team" variant="secondary" />
      </View>
    </AppCard>
  );
}

export default function TeamTab() { const auth = useAuth(); return auth.session?.role === 'FREELANCER' ? <FreelancerTeamScreen /> : <AgencyTeamScreen />; }

function FreelancerTeamScreen() {
  const auth = useAuth();
  const isFreelancer = auth.session?.role === 'FREELANCER';
  const directoryQuery = useEditorDirectory();
  const agencyDirectoryQuery = useAgencyDirectory(isFreelancer);
  const requestAgency = useRequestAgency();
  const updateMembership = useUpdateTeamMembership();
  const [agencySearch, setAgencySearch] = useState('');
  const [agencyTab, setAgencyTab] = useState<'relationships' | 'discover' | 'learning'>('relationships');
  const [selectedAgency, setSelectedAgency] = useState<MobileAgencyDirectoryProfile | null>(null);
  const [requestKind, setRequestKind] = useState<'TEAM' | 'WORK'>('WORK');
  const [requestMessage, setRequestMessage] = useState('');
  const payload = directoryQuery.data;

  useRefreshOnFocus(directoryQuery.refetch);
  useRefreshOnFocus(agencyDirectoryQuery.refetch, isFreelancer);

  const requests = payload?.mode === 'freelancer' ? payload.requests : [];
  const memberships = payload?.mode === 'freelancer' ? payload.memberships : [];
  const history = payload?.mode === 'freelancer' ? payload.history : [];
  const activeCount = memberships.length;
  const pendingCount = requests.length;
  const agencies = useMemo(() => {
    const query = agencySearch.trim().toLowerCase();
    return (agencyDirectoryQuery.data?.agencies ?? []).filter((agency) => !query || [agency.publicName, agency.tagline, agency.niche, ...agency.specialties, agency.office.city].join(' ').toLowerCase().includes(query));
  }, [agencyDirectoryQuery.data?.agencies, agencySearch]);

  function update(id: string, status: MobileTeamMembershipStatus) {
    updateMembership.mutate({ membershipId: id, status });
  }

  function startAgencyRequest(agency: MobileAgencyDirectoryProfile, kind: 'TEAM' | 'WORK') {
    setSelectedAgency(agency);
    setRequestKind(kind);
    setRequestMessage(kind === 'WORK'
      ? `I admire ${agency.publicName}'s work in ${agency.specialties[0] || agency.niche || 'creative production'}. I am available for upcoming editing projects and would love to share how I can support your delivery team.`
      : `I would like to join ${agency.publicName}'s Gigxomi Team. Please review my profile and portfolio. I would like to discuss how I can support your upcoming work.`);
  }

  async function submitAgencyRequest() {
    if (!selectedAgency || requestMessage.trim().length < 20) return;
    await requestAgency.mutateAsync({
      agencyUserId: selectedAgency.ownerUserId,
      message: requestMessage.trim(),
      requestKind,
      roleType: selectedAgency.specialties[0] || 'Video editor',
    });
    setSelectedAgency(null);
  }

  const teamTabs = (
      <View style={newTeamStyles.tabs}>{(['relationships', 'discover', 'learning'] as const).map(value => {
        const selected = agencyTab === value;
        const label = value === 'relationships' ? 'My agencies' : value === 'discover' ? 'Discover' : 'Learning';
        return <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected }} onPress={() => { setAgencyTab(value); }} style={[newTeamStyles.tab, selected && newTeamStyles.active]}><Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82} style={selected ? w.link : w.body}>{label}</Text></Pressable>;
      })}</View>
  );
  if (agencyTab === 'learning') return <LearningView header={<><GigxomiHeader />{teamTabs}</>} onExit={() => setAgencyTab('relationships')} />;
  return (
    <Screen contentStyle={{ paddingTop: 8 }} refreshControl={<BrandedRefreshControl refreshing={directoryQuery.isRefetching || agencyDirectoryQuery.isRefetching} onRefresh={() => { void directoryQuery.refetch(); void agencyDirectoryQuery.refetch(); }} />}>
      <GigxomiHeader />
      <View style={{ gap: 5, marginBottom: 14 }}><Text style={w.title}>Build great partnerships.</Text><Text style={w.body}>Meet agencies. Find consistent work. Grow together.</Text></View>
      {teamTabs}
      <QueryFeedback error={updateMembership.error || requestAgency.error} onRetry={() => { updateMembership.reset(); requestAgency.reset(); }} />
      {agencyTab === 'relationships' ? <View style={styles.list}>
        <QueryFeedback loading={directoryQuery.isLoading} error={directoryQuery.error} onRetry={() => void directoryQuery.refetch()} />
        {!directoryQuery.error && payload ? <><Text style={w.meta}>{activeCount} active partnerships · {pendingCount} awaiting your response</Text>
          {requests.length ? <Text style={w.heading}>Your next collaboration?</Text> : null}
          {requests.map(item => <AgencyRequestCard busy={updateMembership.isPending} item={item} key={item.id} onAction={status => update(item.id, status)} />)}
          {memberships.length ? <Text style={w.heading}>Your agency teams</Text> : null}
          {memberships.map(item => <AgencyRequestCard busy={false} item={item} key={item.id} onAction={() => undefined} />)}
          {history.length ? <Text style={w.heading}>Sent requests & history</Text> : null}
          {history.map(item => <AgencyRequestCard busy={false} item={item} key={item.id} onAction={() => undefined} />)}
          {!requests.length && !memberships.length && !history.length ? (
            <View style={{ gap: 12 }}>
              <QueryFeedback empty title="Your next partnership starts here" message="Explore agency profiles and introduce yourself. Invitations you receive will appear here." />
              <AppButton title="Discover & Connect with Agencies →" variant="secondary" onPress={() => setAgencyTab('discover')} />
            </View>
          ) : null}
        </> : null}
      </View> : <View style={styles.list}>
        <AppInput label="Find the right agency" placeholder="Search niche, city or specialty" value={agencySearch} onChangeText={setAgencySearch} />
        <QueryFeedback loading={agencyDirectoryQuery.isLoading} error={agencyDirectoryQuery.error} onRetry={() => void agencyDirectoryQuery.refetch()} />
        {agencies.map(agency => <AgencyProfileCard agency={agency} key={agency.tenantId} onRequest={kind => startAgencyRequest(agency, kind)} />)}
        {!agencyDirectoryQuery.isLoading && !agencyDirectoryQuery.error && !agencies.length ? <QueryFeedback empty title={agencySearch ? "No agencies match your search" : "New partnerships are on the way"} message="Try a different specialty or check back as agencies publish their profiles." /> : null}
      </View>}
      <Modal animationType="slide" onRequestClose={() => !requestAgency.isPending && setSelectedAgency(null)} transparent visible={Boolean(selectedAgency)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.composerBackdrop}><ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: '90%', width: '100%' }} contentContainerStyle={styles.composerSheet}>
          <View style={styles.playerHeader}><View style={styles.grow}><Text style={styles.playerEyebrow}>{requestKind === 'WORK' ? 'Project introduction' : 'Team application'}</Text><Text style={styles.playerTitle}>{selectedAgency?.publicName}</Text></View><Pressable accessibilityLabel="Close request form" disabled={requestAgency.isPending} onPress={() => setSelectedAgency(null)} style={styles.closeButton}><Feather color={theme.colors.text} name="x" size={24} /></Pressable></View>
          <Text style={styles.composerTitle}>{requestKind === 'WORK' ? 'Show why you fit their next project' : 'Make a strong first Team impression'}</Text>
          <Text style={styles.copy}>{requestKind === 'WORK' ? 'The agency receives this as a real work-interest notification and can review your approved profile before sending an offer.' : 'The agency receives your portfolio, Trust Score, and this introduction before deciding on Team access.'}</Text>
          <AppInput inputStyle={styles.requestInput} label="Your introduction" multiline onChangeText={setRequestMessage} placeholder="Mention your strongest relevant work and availability" value={requestMessage} />
          <Text style={styles.helper}>{requestMessage.trim().length}/20 minimum characters</Text>
          <AppButton disabled={requestMessage.trim().length < 20} loading={requestAgency.isPending} onPress={() => void submitAgencyRequest().catch(() => undefined)} title={requestKind === 'WORK' ? 'Send project request' : 'Send Team request'} />
          <QueryFeedback error={requestAgency.error} onRetry={() => requestAgency.reset()} /><Text style={styles.requestPrivacy}>Only this agency receives your introduction. Your phone number and private verification data stay hidden.</Text>
        </ScrollView></KeyboardAvoidingView>
      </Modal>
    </Screen>
  );
}

const newTeamStyles = StyleSheet.create({ tabs: { flexDirection: 'row', padding: 4, backgroundColor: theme.colors.surface, borderRadius: 12, marginBottom: 16 }, tab: { flex: 1, minHeight: 44, padding: 8, alignItems: 'center', justifyContent: 'center', borderRadius: 9 }, active: { backgroundColor: theme.colors.accentSoft } });
const styles = StyleSheet.create({
  header: { gap: theme.spacing.xs, marginBottom: theme.spacing.lg },
  grow: { flex: 1 },
  eyebrow: { color: theme.colors.accent, fontSize: theme.typography.caption, fontWeight: '900', textTransform: 'uppercase' },
  title: { color: theme.colors.text, fontSize: 26, fontWeight: '900' },
  copy: { color: theme.colors.textSecondary, fontSize: theme.typography.small, lineHeight: 19 },
  metrics: { flexDirection: 'row', gap: theme.spacing.sm, marginBottom: theme.spacing.md },
  metric: { flex: 1, minHeight: 78, justifyContent: 'center', gap: 3, padding: theme.spacing.sm },
  metricValue: { color: theme.colors.text, fontSize: 22, fontWeight: '900' },
  metricLabel: { color: theme.colors.mutedText, fontSize: 11, fontWeight: '800' },
  list: { gap: theme.spacing.md, marginTop: theme.spacing.md },
  sectionTitle: { color: theme.colors.text, fontSize: theme.typography.section, fontWeight: '900', marginTop: theme.spacing.xs },
  editorCard: { gap: theme.spacing.sm },
  portfolioHero: { backgroundColor: theme.colors.surfaceRaised, borderRadius: theme.radius.lg, height: 190, justifyContent: 'center', overflow: 'hidden' },
  portfolioImage: { height: '100%', width: '100%' },
  portfolioFallback: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  portfolioScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.28)' },
  playButton: { alignItems: 'center', alignSelf: 'center', backgroundColor: theme.colors.accent, borderRadius: 999, height: 54, justifyContent: 'center', position: 'absolute', width: 54 },
  portfolioLabel: { bottom: 14, left: 14, position: 'absolute', right: 14 },
  portfolioEyebrow: { color: theme.colors.accent, fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },
  portfolioTitle: { color: '#fff', fontSize: theme.typography.body, fontWeight: '900', marginTop: 3 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  avatar: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, borderWidth: 1, borderColor: theme.colors.accentBorder, backgroundColor: theme.colors.accentSoft },
  avatarText: { color: theme.colors.accent, fontSize: theme.typography.small, fontWeight: '900' },
  presenceDot: { borderColor: theme.colors.surface, borderRadius: 999, borderWidth: 2, bottom: -1, height: 13, position: 'absolute', right: -1, width: 13 },
  presenceOnline: { backgroundColor: theme.colors.success },
  presenceOffline: { backgroundColor: theme.colors.mutedText },
  cardHeading: { flex: 1, minWidth: 0 },
  cardTitle: { color: theme.colors.text, fontSize: theme.typography.body, fontWeight: '900' },
  cardMeta: { color: theme.colors.mutedText, fontSize: theme.typography.caption, fontWeight: '700', marginTop: 2 },
  cardCopy: { color: theme.colors.textSecondary, fontSize: theme.typography.small, lineHeight: 19 },
  skillRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  skillChip: { backgroundColor: theme.colors.surfaceSoft, borderColor: theme.colors.borderSubtle, borderRadius: theme.radius.pill, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 6 },
  skillText: { color: theme.colors.textSecondary, fontSize: 10, fontWeight: '800' },
  moreSkills: { color: theme.colors.accent, fontSize: 11, fontWeight: '900' },
  pill: { borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.colors.accentBorder, backgroundColor: theme.colors.accentSoft, paddingHorizontal: theme.spacing.sm, paddingVertical: 5 },
  pillText: { color: theme.colors.text, fontSize: 10, fontWeight: '900' },
  proofStrip: { flexDirection: 'row', gap: theme.spacing.sm },
  proofItem: { flex: 1, borderRadius: theme.radius.md, backgroundColor: theme.colors.surfaceSoft, padding: theme.spacing.sm },
  proofLabel: { color: theme.colors.mutedText, fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  proofValue: { color: theme.colors.text, fontSize: theme.typography.caption, fontWeight: '900', marginTop: 3 },
  serviceRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, borderTopWidth: 1, borderTopColor: theme.colors.borderSubtle, paddingTop: theme.spacing.sm },
  serviceCopy: { flex: 1 },
  serviceTitle: { color: theme.colors.text, fontSize: theme.typography.small, fontWeight: '900' },
  serviceMeta: { color: theme.colors.mutedText, fontSize: theme.typography.caption, marginTop: 2 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: theme.spacing.sm },
  actionColumn: { gap: 10, marginTop: 4 },
  inviteContext: { color: theme.colors.accent, fontSize: theme.typography.caption, fontWeight: '800' },
  playerScreen: { backgroundColor: theme.colors.background, flex: 1, paddingTop: 48 },
  playerHeader: { alignItems: 'center', flexDirection: 'row', gap: 12, padding: theme.spacing.lg },
  playerEyebrow: { color: theme.colors.accent, fontSize: 10, fontWeight: '900', textTransform: 'uppercase' },
  playerTitle: { color: theme.colors.text, fontSize: theme.typography.body, fontWeight: '900', marginTop: 3 },
  closeButton: { alignItems: 'center', backgroundColor: theme.colors.surfaceRaised, borderRadius: 999, height: 42, justifyContent: 'center', width: 42 },
  webPlayer: { backgroundColor: '#000', flex: 1 },
  playerFooter: { gap: theme.spacing.sm, padding: theme.spacing.lg },
  playerPrice: { color: theme.colors.accent, fontSize: 22, fontWeight: '900' },
  agencyHero: { backgroundColor: theme.colors.surfaceRaised, borderRadius: theme.radius.lg, height: 172, justifyContent: 'center', overflow: 'hidden' },
  agencyBannerClean: { backgroundColor: theme.colors.surfaceRaised, borderRadius: theme.radius.lg, padding: 14, gap: 8, borderWidth: 1, borderColor: theme.colors.borderSubtle },
  hiringBadge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: theme.colors.accentSoft, borderColor: theme.colors.accentBorder, borderWidth: 1, borderRadius: theme.radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  hiringBadgeText: { color: theme.colors.accent, fontSize: 11, fontWeight: '900', letterSpacing: 0.5, textTransform: 'uppercase' },
  agencyBannerTitle: { color: theme.colors.text, fontSize: 18, fontWeight: '900', lineHeight: 24 },
  agencyHeroCopy: { bottom: 14, left: 14, position: 'absolute', right: 14 },
  agencyHeroTitle: { color: '#fff', fontSize: 19, fontWeight: '900', lineHeight: 23, marginTop: 4 },
  agencyStats: { flexDirection: 'row', gap: 8 },
  agencyStat: { backgroundColor: theme.colors.surfaceSoft, borderRadius: theme.radius.md, flex: 1, padding: 10 },
  agencyStatValue: { color: theme.colors.text, fontSize: theme.typography.body, fontWeight: '900', marginBottom: 2 },
  agencyOffer: { alignItems: 'center', borderColor: theme.colors.accentBorder, borderRadius: theme.radius.md, borderWidth: 1, flexDirection: 'row', gap: 10, padding: 12 },
  reviewQuote: { backgroundColor: theme.colors.surfaceRaised, borderRadius: theme.radius.md, gap: 5, padding: 12 },
  reviewStars: { color: theme.colors.accent, fontSize: theme.typography.caption, fontWeight: '900' },
  reviewText: { color: theme.colors.textSecondary, fontSize: theme.typography.small, fontStyle: 'italic', lineHeight: 19 },
  composerBackdrop: { backgroundColor: 'rgba(0,0,0,0.72)', flex: 1, justifyContent: 'flex-end' },
  composerSheet: { backgroundColor: theme.colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, gap: theme.spacing.md, maxHeight: '88%', padding: theme.spacing.lg, paddingBottom: 34 },
  composerTitle: { color: theme.colors.text, fontSize: 22, fontWeight: '900' },
  requestInput: { minHeight: 130, paddingTop: 14, textAlignVertical: 'top' },
  requestPrivacy: { color: theme.colors.mutedText, fontSize: 11, lineHeight: 16, textAlign: 'center' },
  helper: { color: theme.colors.mutedText, fontSize: theme.typography.caption },
  error: { color: theme.colors.danger, fontSize: theme.typography.small, lineHeight: 19, marginBottom: theme.spacing.sm },
  empty: { color: theme.colors.mutedText, fontSize: theme.typography.small, textAlign: 'center', paddingVertical: theme.spacing.xl },
});
