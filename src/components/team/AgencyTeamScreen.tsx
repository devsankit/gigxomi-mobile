import { LearningView } from '@/src/components/learning/LearningScreen';
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { AppButton } from '@/src/components/AppButton';
import { AppCard } from '@/src/components/AppCard';
import { AppInput } from '@/src/components/AppInput';
import { Screen } from '@/src/components/Screen';
import { GigxomiHeader } from '@/src/components/GigxomiHeader';
import { BrandedRefreshControl } from '@/src/components/BrandedRefreshControl';
import { StableAvatar } from '@/src/components/StableAvatar';
import { QueryFeedback, StatusBadge, workStyles as w } from '@/src/components/work/WorkPrimitives';
import { EditorCard } from './EditorCard';
import { EditorPortfolioPlayerModal } from './EditorProfile';
import {
  useCancelTeamInvitation,
  useContacts,
  useCreateManager,
  useEditorDirectory,
  useInviteTeamEditor,
  useManagers,
  useUpdateTeamMembership,
} from '@/src/hooks/useTeam';
import { useDebouncedValue } from '@/src/hooks/useDebouncedValue';
import { useRefreshOnFocus } from '@/src/hooks/useRefreshOnFocus';
import { useInviteEditorToWorkPost } from '@/src/hooks/useWorkMatching';
import { useAuth } from '@/src/hooks/useAuth';
import { rupees } from '@/src/lib/work-presentation';
import { theme } from '@/src/constants/theme';
import type { MobileTeamEditor } from '@/src/types';

export function AgencyTeamScreen() {
  const { width, fontScale } = useWindowDimensions();
  const { workPostId } = useLocalSearchParams<{ workPostId?: string }>();
  const [scope, setScope] = useState<'team' | 'general' | 'staff' | 'learning'>('team');
  const [teamSubView, setTeamSubView] = useState<'all' | 'requests' | 'invites'>('all');
  const [search, setSearch] = useState('');
  const [onlineOnly, setOnlineOnly] = useState(false);
  const [actionError, setActionError] = useState<unknown>(null);
  const [sentWorkIds, setSentWorkIds] = useState<string[]>([]);
  const [portfolioEditor, setPortfolioEditor] = useState<MobileTeamEditor | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const debounced = useDebouncedValue(search);
  const auth = useAuth();

  const isPremium = Boolean(
    auth.session?.packageId &&
    !auth.session.packageId.toLowerCase().includes('freemium') &&
    auth.session.packageStatus === 'ACTIVE'
  );

  const query = useEditorDirectory({
    scope: scope === 'learning' || scope === 'staff' ? 'general' : scope,
    enabled: scope !== 'learning' && scope !== 'staff',
    search: debounced,
    onlineOnly,
  });

  const discoverQuery = useEditorDirectory({
    scope: 'general',
    enabled: true,
  });
  const discoverEditors = discoverQuery.data?.mode === 'agency' ? discoverQuery.data.editors : [];

  const managersQuery = useManagers(scope === 'staff');
  const managers = managersQuery.data?.managers ?? [];
  const contactsQuery = useContacts(scope === 'staff');
  const contacts = contactsQuery.data?.contacts ?? [];

  const createManager = useCreateManager();
  const [showAddManager, setShowAddManager] = useState(false);
  const [managerName, setManagerName] = useState('');
  const [managerPhone, setManagerPhone] = useState('');
  const [managerEmail, setManagerEmail] = useState('');
  const [managerPin, setManagerPin] = useState('123456');
  const [managerRole, setManagerRole] = useState('Operations');
  const [managerError, setManagerError] = useState('');

  async function handleAddManager() {
    if (!managerName.trim() || !managerPhone.trim()) {
      setManagerError('Full Name and Phone Number are required.');
      return;
    }
    setManagerError('');
    try {
      await createManager.mutateAsync({
        name: managerName.trim(),
        phone: managerPhone.trim(),
        email: managerEmail.trim() || undefined,
        pin: managerPin.trim() || '123456',
        role: managerRole.trim() || 'Operations',
      });
      setManagerName('');
      setManagerPhone('');
      setManagerEmail('');
      setShowAddManager(false);
      void managersQuery.refetch();
    } catch (err: any) {
      setManagerError(err?.message || 'Failed to create manager account.');
    }
  }

  const invite = useInviteTeamEditor();
  const cancelInvite = useCancelTeamInvitation();
  const workInvite = useInviteEditorToWorkPost();
  const membership = useUpdateTeamMembership();

  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
  const [cancelingInviteId, setCancelingInviteId] = useState<string | null>(null);

  async function handleRemoveMember(editor: MobileTeamEditor) {
    if (!editor.membership?.id) return;
    try {
      setActionError(null);
      setRemovingMemberId(editor.id);
      await membership.mutateAsync({
        membershipId: editor.membership.id,
        status: 'REMOVED',
      });
      void query.refetch();
      void discoverQuery.refetch();
    } catch (error) {
      setActionError(error);
    } finally {
      setRemovingMemberId(null);
    }
  }

  async function respondToRequest(id: string, status: 'ACTIVE' | 'DECLINED') {
    try {
      setActionError(null);
      await membership.mutateAsync({ membershipId: id, status });
    } catch (error) {
      setActionError(error);
    }
  }

  async function handleCancelInvitation(requestId: string) {
    try {
      setActionError(null);
      setCancelingInviteId(requestId);
      await cancelInvite.mutateAsync(requestId);
      void query.refetch();
      void discoverQuery.refetch();
    } catch (error: any) {
      setActionError(error);
      Alert.alert('Cancel Invitation', error?.message || 'Could not cancel this invitation. Please try again.');
    } finally {
      setCancelingInviteId(null);
    }
  }

  async function handleInvite(editorId: string) {
    const activeCount = data?.totals?.active ?? 0;
    const pendingCount = data?.totals?.pending ?? 0;
    if (!isPremium && (activeCount + pendingCount) >= 14) {
      setShowUpgradeModal(true);
      return;
    }
    try {
      setActionError(null);
      await invite.mutateAsync(editorId);
    } catch (error) {
      setActionError(error);
    }
  }

  async function inviteToWork(id: string) {
    if (!workPostId) return;
    try {
      setActionError(null);
      await workInvite.mutateAsync({ workPostId, editorId: id });
      setSentWorkIds(ids => [...ids, id]);
    } catch (error) {
      setActionError(error);
    }
  }

  useRefreshOnFocus(query.refetch);
  useRefreshOnFocus(discoverQuery.refetch);
  useRefreshOnFocus(managersQuery.refetch);
  useRefreshOnFocus(contactsQuery.refetch);

  const data = query.data?.mode === 'agency' ? query.data : undefined;
  const columns = scope === 'general' && width >= 390 && fontScale <= 1.15 ? 2 : 1;

  const allInvitations = data?.invitations ?? [];
  const incomingRequests = allInvitations.filter(i => i.direction === 'FREELANCER_TO_AGENCY');
  const outgoingInvitations = allInvitations.filter(i => i.direction !== 'FREELANCER_TO_AGENCY');

  const editorsList = data?.editors ?? [];
  const activeTeamEditors = editorsList.filter(e => e.membership?.status === 'ACTIVE');
  const sortedEditors = [...editorsList].sort((a, b) => {
    if (Boolean(a.isOnline) !== Boolean(b.isOnline)) return a.isOnline ? -1 : 1;
    const aPlay = (a.portfolioLinks?.length ?? 0) > 0;
    const bPlay = (b.portfolioLinks?.length ?? 0) > 0;
    if (aPlay !== bPlay) return aPlay ? -1 : 1;
    return (b.trustScore ?? 0) - (a.trustScore ?? 0);
  });

  const searchTokens = debounced.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matchesSearch = (
    name?: string | null,
    alias?: string | null,
    skills?: string[] | null,
    specialty?: string | null,
    phone?: string | null
  ) => {
    if (!searchTokens.length) return true;
    const haystack = `${name ?? ''} ${alias ?? ''} ${(skills ?? []).join(' ')} ${specialty ?? ''} ${phone ?? ''}`.toLowerCase();
    return searchTokens.every(tok => haystack.includes(tok));
  };

  const visibleActiveTeamEditors = activeTeamEditors.filter(e =>
    matchesSearch(e.name, e.alias, e.skills, e.specialty, e.phone)
  );
  const visibleIncomingRequests = incomingRequests.filter(i =>
    matchesSearch(i.editorName, '', [], '', '')
  );
  const visibleOutgoingInvitations = outgoingInvitations.filter(i =>
    matchesSearch(i.editorName, '', [], '', '')
  );
  const filteredSortedEditors = sortedEditors.filter(e =>
    matchesSearch(e.name, e.alias, e.skills, e.specialty, e.phone)
  );

  const headerRight = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Open Learning Hub"
      onPress={() => setScope(scope === 'learning' ? 'team' : 'learning')}
      style={[s.learningPill, scope === 'learning' && s.learningPillActive]}
    >
      <Feather name="book-open" size={13} color={scope === 'learning' ? '#000' : theme.colors.accent} />
      <Text style={[s.learningPillText, scope === 'learning' && s.learningPillTextActive]}>Learning</Text>
    </Pressable>
  );

  const teamTabs = (
    <View style={s.tabs}>
      {(['team', 'general', 'staff'] as const).map(value => {
        const selected = scope === value;
        const label =
          value === 'team'
            ? `Team (${(data?.totals?.active ?? activeTeamEditors.length) + incomingRequests.length})`
            : value === 'general'
            ? 'Discover'
            : `Staff (${managers.length})`;
        return (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            key={value}
            style={[s.tab, selected && s.active]}
            onPress={() => {
              setScope(value);
              setSearch('');
            }}
          >
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
              style={[s.tabText, selected && s.activeText]}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  if (scope === 'learning') {
    return <LearningView header={<><GigxomiHeader rightSlot={headerRight} />{teamTabs}</>} onExit={() => setScope('team')} />;
  }

  // -------------------------------------------------------------
  // TAB 3: STAFF & CLIENT ROSTER
  // -------------------------------------------------------------
  if (scope === 'staff') {
    return (
      <Screen scroll contentStyle={{ paddingTop: 8, paddingBottom: 160 }}>
        <GigxomiHeader rightSlot={headerRight} />
        <View style={s.header}>
          <Text style={w.title}>Agency Staff & Clients</Text>
          <Text style={w.body}>Manage dispatch managers, team permissions, and client relationships.</Text>
        </View>
        {teamTabs}

        {/* 1. Manager Accounts Section */}
        {!isPremium ? (
          <AppCard style={{ gap: 14, padding: 18, marginBottom: 18, backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.accentBorder }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: theme.colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                <Feather name="lock" size={22} color={theme.colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: '900' }}>Manager Accounts (Agency Premium)</Text>
                <Text style={{ color: theme.colors.textSecondary, fontSize: 12, marginTop: 3, lineHeight: 17 }}>
                  Freemium packages do not include manager accounts. Upgrade to Agency Premium to provision operations managers and delegate dispatch.
                </Text>
              </View>
            </View>
            <AppButton
              title="Upgrade to Agency Premium →"
              variant="primary"
              onPress={() => router.push('/package')}
            />
          </AppCard>
        ) : (
          <AppCard style={{ gap: 12, marginBottom: 18 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ gap: 2 }}>
                <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: '800' }}>Operations Managers</Text>
                <Text style={{ color: theme.colors.mutedText, fontSize: 12 }}>{managers.length} active account{managers.length === 1 ? '' : 's'}</Text>
              </View>
              <Pressable
                onPress={() => setShowAddManager(v => !v)}
                style={{ backgroundColor: theme.colors.accentSoft, borderColor: theme.colors.accentBorder, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 }}
              >
                <Text style={{ color: theme.colors.accent, fontWeight: '800', fontSize: 13 }}>{showAddManager ? 'Cancel' : '+ Add Manager'}</Text>
              </Pressable>
            </View>

            {showAddManager ? (
              <View style={{ gap: 10, marginTop: 8, paddingTop: 12, borderTopColor: theme.colors.borderSubtle, borderTopWidth: 1 }}>
                <Text style={{ color: theme.colors.accent, fontWeight: '800', fontSize: 13 }}>Provision New Manager</Text>
                <AppInput label="Full Name" placeholder="e.g. Rahul Verma" value={managerName} onChangeText={setManagerName} />
                <AppInput label="WhatsApp Phone Number" placeholder="10-digit phone" keyboardType="phone-pad" value={managerPhone} onChangeText={setManagerPhone} />
                <AppInput label="Email (Optional)" placeholder="manager@agency.com" keyboardType="email-address" value={managerEmail} onChangeText={setManagerEmail} autoCapitalize="none" />
                <AppInput label="6-Digit PIN" placeholder="123456" keyboardType="number-pad" secureTextEntry value={managerPin} onChangeText={setManagerPin} />
                <AppInput label="Department / Role" placeholder="Operations" value={managerRole} onChangeText={setManagerRole} />
                {managerError ? <Text style={{ color: theme.colors.danger, fontSize: 12 }}>{managerError}</Text> : null}
                <AppButton title="Create & Provision Manager" loading={createManager.isPending} onPress={handleAddManager} />
              </View>
            ) : null}

            {managers.length === 0 && !showAddManager ? (
              <View style={{ paddingVertical: 12, alignItems: 'center', gap: 6 }}>
                <Feather name="users" size={24} color={theme.colors.mutedText} />
                <Text style={w.meta}>No managers added yet. Tap &apos;+ Add Manager&apos; to invite staff.</Text>
              </View>
            ) : (
              managers.map((mgr: any, idx: number) => (
                <View key={mgr.id || idx} style={[w.row, { paddingVertical: 8, borderTopColor: theme.colors.borderSubtle, borderTopWidth: 1 }]}>
                  <StableAvatar label={mgr.name || 'Manager'} size={38} />
                  <View style={w.grow}>
                    <Text style={{ color: theme.colors.text, fontWeight: '700', fontSize: 14 }}>{mgr.name}</Text>
                    <Text style={{ color: theme.colors.textSecondary, fontSize: 12 }}>{mgr.role || 'Operations'} · {mgr.phone}</Text>
                  </View>
                  <StatusBadge label="ACTIVE" tone="positive" />
                </View>
              ))
            )}
          </AppCard>
        )}

        {/* 2. Total Clients Showcase Section */}
        <AppCard style={{ gap: 14 }}>
          <View style={[w.between, { alignItems: 'flex-start' }]}>
            <View style={{ gap: 3 }}>
              <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: '800' }}>
                Client Roster ({contacts.length} Total Client{contacts.length === 1 ? '' : 's'})
              </Text>
              <Text style={{ color: theme.colors.textSecondary, fontSize: 12 }}>
                All clients connected via WhatsApp and active agency projects.
              </Text>
            </View>
            <View style={{ backgroundColor: theme.colors.accentSoft, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}>
              <Text style={{ color: theme.colors.accent, fontWeight: '800', fontSize: 12 }}>{contacts.length} CRM</Text>
            </View>
          </View>

          <QueryFeedback loading={contactsQuery.isLoading} error={contactsQuery.error} onRetry={() => void contactsQuery.refetch()} />

          {contacts.length === 0 && !contactsQuery.isLoading ? (
            <View style={{ paddingVertical: 20, alignItems: 'center', gap: 8 }}>
              <Feather name="user-check" size={32} color={theme.colors.mutedText} />
              <Text style={w.heading}>No client records yet</Text>
              <Text style={[w.meta, { textAlign: 'center' }]}>
                Clients who message your WhatsApp business line or request quotes will automatically appear here.
              </Text>
            </View>
          ) : (
            contacts.map((contact: any, idx: number) => (
              <View key={contact.id || idx} style={[w.row, { paddingVertical: 10, borderTopColor: theme.colors.borderSubtle, borderTopWidth: 1 }]}>
                <StableAvatar label={contact.name || contact.phone || 'Client'} size={42} />
                <View style={w.grow}>
                  <Text style={{ color: theme.colors.text, fontWeight: '700', fontSize: 14 }}>
                    {contact.name || 'WhatsApp Client'}
                  </Text>
                  <Text style={{ color: theme.colors.textSecondary, fontSize: 12, marginTop: 1 }}>
                    {contact.phone}
                  </Text>
                </View>
                <Pressable
                  onPress={() => router.push('/chat')}
                  style={{ backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.border, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 6 }}
                >
                  <Feather name="message-circle" size={14} color={theme.colors.accent} />
                  <Text style={{ color: theme.colors.text, fontSize: 12, fontWeight: '700' }}>Chat</Text>
                </Pressable>
              </View>
            ))
          )}
        </AppCard>
      </Screen>
    );
  }

  // -------------------------------------------------------------
  // TAB 1: TEAM (Default Tab with Accept & Sent Requests)
  // -------------------------------------------------------------
  if (scope === 'team') {
    return (
      <Screen scroll contentStyle={{ paddingTop: 8, paddingBottom: 160 }}>
        <GigxomiHeader rightSlot={headerRight} />
        <View style={s.header}>
          <Text style={w.title}>Your Creative Team</Text>
          <Text style={w.body}>Manage joined editors, review incoming join requests, and track invitations.</Text>
        </View>
        {teamTabs}

        <View style={s.search}>
          <Feather name="search" size={18} color={theme.colors.textSecondary} />
          <TextInput
            accessibilityLabel="Search team"
            style={s.input}
            placeholder="Search team member by name, skill, or phone"
            placeholderTextColor={theme.colors.mutedText}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
            autoCorrect={false}
          />
          {search ? (
            <Pressable accessibilityLabel="Clear search" style={s.clear} onPress={() => setSearch('')}>
              <Feather name="x" size={17} color={theme.colors.textSecondary} />
            </Pressable>
          ) : null}
        </View>

        {/* Sub-Filters for Team */}
        <View style={s.subFilterRow}>
          <Pressable
            onPress={() => setTeamSubView('all')}
            style={[s.subFilterChip, teamSubView === 'all' && s.subFilterChipActive]}
          >
            <Text style={[s.subFilterText, teamSubView === 'all' && s.subFilterTextActive]}>
              Active Team ({visibleActiveTeamEditors.length})
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setTeamSubView('requests')}
            style={[s.subFilterChip, teamSubView === 'requests' && s.subFilterChipActive]}
          >
            <Text style={[s.subFilterText, teamSubView === 'requests' && s.subFilterTextActive]}>
              Requests ({visibleIncomingRequests.length})
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setTeamSubView('invites')}
            style={[s.subFilterChip, teamSubView === 'invites' && s.subFilterChipActive]}
          >
            <Text style={[s.subFilterText, teamSubView === 'invites' && s.subFilterTextActive]}>
              Sent Invites ({visibleOutgoingInvitations.length})
            </Text>
          </Pressable>
        </View>

        {/* 1. INCOMING REQUESTS (Accept Request Section) */}
        {(teamSubView === 'all' || teamSubView === 'requests') && (
          <View style={{ marginBottom: 20 }}>
            <View style={[w.between, { marginBottom: 10 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: '800' }}>Incoming Requests</Text>
                {visibleIncomingRequests.length > 0 ? (
                  <View style={{ backgroundColor: theme.colors.accent, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 }}>
                    <Text style={{ color: '#000', fontWeight: '900', fontSize: 11 }}>{visibleIncomingRequests.length} NEW</Text>
                  </View>
                ) : null}
              </View>
            </View>

            {visibleIncomingRequests.length === 0 ? (
              teamSubView === 'requests' || search ? (
                <View style={[w.card, { padding: 24, alignItems: 'center', gap: 6 }]}>
                  <Feather name="inbox" size={28} color={theme.colors.mutedText} />
                  <Text style={w.heading}>{search ? 'No requests match search' : 'No incoming editor requests'}</Text>
                  <Text style={[w.meta, { textAlign: 'center' }]}>{search ? 'Try another search term.' : 'Freelancers who apply to join your agency will show up here with their full showreel preview.'}</Text>
                </View>
              ) : null
            ) : (
              <View style={{ gap: 12 }}>
                {visibleIncomingRequests.map(item => {
                  const editorData = editorsList.find(e => e.id === item.editorId) || discoverEditors.find(e => e.id === item.editorId);
                  return (
                    <AppCard key={item.id} style={{ gap: 14, borderColor: theme.colors.accentBorder }}>
                      <View style={[w.row, { alignItems: 'flex-start' }]}>
                        <StableAvatar label={item.editorName} imageUrl={editorData?.avatarUrl} size={48} />
                        <View style={w.grow}>
                          <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: '800' }}>{item.editorName}</Text>
                          <Text style={{ color: theme.colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                            {editorData?.title || editorData?.category || 'Video Editor'}
                          </Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                            <Text style={{ color: theme.colors.accent, fontSize: 12, fontWeight: '800' }}>
                              Trust · {editorData?.trustScore ?? 92}/100
                            </Text>
                            <Text style={{ color: theme.colors.mutedText, fontSize: 12 }}>·</Text>
                            <Text style={{ color: theme.colors.text, fontSize: 12, fontWeight: '700' }}>
                              {editorData?.startingPrice ? `From ${rupees(editorData.startingPrice)}` : 'From ₹499'}
                            </Text>
                          </View>
                        </View>
                      </View>

                      {/* Portfolio Preview & Profile Links */}
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        {editorData ? (
                          <Pressable
                            onPress={() => setPortfolioEditor(editorData)}
                            style={{ flex: 1, backgroundColor: 'rgba(185, 247, 25, 0.1)', borderColor: theme.colors.accentBorder, borderWidth: 1, paddingVertical: 8, borderRadius: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                          >
                            <Feather name="play-circle" size={16} color={theme.colors.accent} />
                            <Text style={{ color: theme.colors.accent, fontWeight: '800', fontSize: 12 }}>Watch Portfolio</Text>
                          </Pressable>
                        ) : null}
                        <Pressable
                          onPress={() => router.push(`/editor/${encodeURIComponent(item.editorId)}`)}
                          style={{ flex: 1, backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.border, borderWidth: 1, paddingVertical: 8, borderRadius: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                        >
                          <Feather name="user" size={15} color={theme.colors.text} />
                          <Text style={{ color: theme.colors.text, fontWeight: '700', fontSize: 12 }}>View Profile</Text>
                        </Pressable>
                      </View>

                      {/* Action Buttons: Accept / Decline */}
                      <View style={{ flexDirection: 'row', gap: 10, paddingTop: 4, borderTopColor: theme.colors.borderSubtle, borderTopWidth: 1 }}>
                        <View style={{ flex: 1 }}>
                          <AppButton
                            title="Accept Request"
                            variant="primary"
                            loading={membership.isPending && membership.variables?.membershipId === item.id}
                            disabled={membership.isPending}
                            onPress={() => void respondToRequest(item.id, 'ACTIVE')}
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <AppButton
                            title="Decline"
                            variant="secondary"
                            disabled={membership.isPending}
                            onPress={() => void respondToRequest(item.id, 'DECLINED')}
                          />
                        </View>
                      </View>
                    </AppCard>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {/* 2. OUTGOING INVITATIONS (Waiting for acceptance) */}
        {(teamSubView === 'all' || teamSubView === 'invites') && (
          <View style={{ marginBottom: 20 }}>
            <View style={[w.between, { marginBottom: 10 }]}>
              <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: '800' }}>Sent Invitations</Text>
              <Text style={{ color: theme.colors.mutedText, fontSize: 12 }}>{visibleOutgoingInvitations.length} Pending</Text>
            </View>

            {visibleOutgoingInvitations.length === 0 ? (
              teamSubView === 'invites' || search ? (
                <View style={[w.card, { padding: 24, alignItems: 'center', gap: 6 }]}>
                  <Feather name="send" size={28} color={theme.colors.mutedText} />
                  <Text style={w.heading}>{search ? 'No invitations match search' : 'No outgoing invitations'}</Text>
                  <Text style={[w.meta, { textAlign: 'center' }]}>{search ? 'Try another search term.' : 'When you invite editors from Discover, they will appear here until they accept.'}</Text>
                </View>
              ) : null
            ) : (
              <View style={{ gap: 10 }}>
                {visibleOutgoingInvitations.map(item => {
                  const editorData = editorsList.find(e => e.id === item.editorId) || discoverEditors.find(e => e.id === item.editorId);
                  return (
                    <AppCard key={item.id} style={{ gap: 12 }}>
                      <View style={w.row}>
                        <StableAvatar label={item.editorName} imageUrl={editorData?.avatarUrl} size={42} />
                        <View style={w.grow}>
                          <Text style={{ color: theme.colors.text, fontWeight: '700', fontSize: 14 }}>{item.editorName}</Text>
                          <Text style={{ color: theme.colors.mutedText, fontSize: 12 }}>Waiting for editor to accept</Text>
                        </View>
                        <StatusBadge label="INVITED" tone="pending" />
                      </View>

                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        {editorData ? (
                          <Pressable
                            onPress={() => setPortfolioEditor(editorData)}
                            style={{ flex: 1, backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.border, borderWidth: 1, paddingVertical: 7, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}
                          >
                            <Text style={{ color: theme.colors.text, fontWeight: '700', fontSize: 12 }}>Watch Portfolio</Text>
                          </Pressable>
                        ) : null}
                        <Pressable
                          onPress={() => router.push(`/editor/${encodeURIComponent(item.editorId)}`)}
                          style={{ flex: 1, backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.border, borderWidth: 1, paddingVertical: 7, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}
                        >
                          <Text style={{ color: theme.colors.text, fontWeight: '700', fontSize: 12 }}>View Profile</Text>
                        </Pressable>
                        <Pressable
                          disabled={cancelingInviteId === item.id}
                          onPress={() => void handleCancelInvitation(item.id)}
                          style={{ flex: 1, backgroundColor: 'rgba(239, 68, 68, 0.1)', borderColor: 'rgba(239, 68, 68, 0.3)', borderWidth: 1, paddingVertical: 7, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}
                        >
                          {cancelingInviteId === item.id ? (
                            <ActivityIndicator size="small" color={theme.colors.danger} />
                          ) : (
                            <Text style={{ color: theme.colors.danger, fontWeight: '800', fontSize: 12 }}>Cancel</Text>
                          )}
                        </Pressable>
                      </View>
                    </AppCard>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {/* 3. ACTIVE TEAM EDITORS */}
        {(teamSubView === 'all') && (
          <View style={{ marginBottom: 24 }}>
            <View style={[w.between, { marginBottom: 10 }]}>
              <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: '800' }}>Active Team Roster</Text>
              <Text style={{ color: theme.colors.accent, fontWeight: '800', fontSize: 12 }}>{visibleActiveTeamEditors.length} Joined</Text>
            </View>

            {visibleActiveTeamEditors.length === 0 ? (
              <View style={[w.card, { padding: 20, alignItems: 'center', gap: 6 }]}>
                <Feather name="users" size={28} color={theme.colors.mutedText} />
                <Text style={w.heading}>{search ? 'No team members match your search' : 'Your team roster'}</Text>
                <Text style={[w.meta, { textAlign: 'center' }]}>
                  {search
                    ? 'Try searching by a different name, skill, or specialty.'
                    : 'Accepted editors will be listed here with direct chat and work assignment tools.'}
                </Text>
              </View>
            ) : (
              <View style={{ gap: 12 }}>
                {visibleActiveTeamEditors.map(editor => (
                  <EditorCard
                    key={editor.id}
                    editor={editor}
                    compact={false}
                    wide
                    onPortfolio={() => setPortfolioEditor(editor)}
                    onView={() => router.push(`/editor/${encodeURIComponent(editor.id)}`)}
                    onRemove={() => void handleRemoveMember(editor)}
                    removeBusy={removingMemberId === editor.id}
                  />
                ))}
              </View>
            )}
          </View>
        )}

        {/* 4. DISCOVER EDITORS SLIDER & BUTTON (As Requested: Below Invitations) */}
        <View style={{ marginTop: 8, marginBottom: 20 }}>
          <View style={[w.between, { marginBottom: 12 }]}>
            <View style={{ gap: 2 }}>
              <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: '800' }}>Discover Top Editors</Text>
              <Text style={{ color: theme.colors.textSecondary, fontSize: 12 }}>Slide to preview showreels & invite to your team</Text>
            </View>
            <Pressable onPress={() => setScope('general')}>
              <Text style={{ color: theme.colors.accent, fontWeight: '800', fontSize: 13 }}>See all →</Text>
            </Pressable>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingRight: 16 }}>
            {discoverEditors.slice(0, 12).map((editor) => (
              <View
                key={editor.id}
                style={{
                  width: 250,
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                  borderWidth: 1,
                  borderRadius: 16,
                  padding: 14,
                  gap: 12,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <StableAvatar label={editor.name} imageUrl={editor.avatarUrl} size={44} />
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={{ color: theme.colors.text, fontWeight: '800', fontSize: 14 }}>
                      {editor.name}
                    </Text>
                    <Text numberOfLines={1} style={{ color: theme.colors.textSecondary, fontSize: 12 }}>
                      {editor.title || editor.category || 'Video Editor'}
                    </Text>
                  </View>
                </View>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ backgroundColor: theme.colors.accentSoft, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
                    <Text style={{ color: theme.colors.accent, fontWeight: '800', fontSize: 11 }}>
                      Trust {editor.trustScore ?? 92}/100
                    </Text>
                  </View>
                  <Text style={{ color: theme.colors.text, fontWeight: '700', fontSize: 13 }}>
                    {editor.startingPrice ? `From ${rupees(editor.startingPrice)}` : 'From ₹499'}
                  </Text>
                </View>

                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable
                    onPress={() => setPortfolioEditor(editor)}
                    style={{
                      flex: 1,
                      backgroundColor: (editor.portfolioLinks?.[0]?.includes('drive.google.com') || editor.services?.[0]?.portfolioUrl?.includes('drive.google.com'))
                        ? 'rgba(74, 222, 128, 0.12)'
                        : 'rgba(185, 247, 25, 0.1)',
                      borderColor: (editor.portfolioLinks?.[0]?.includes('drive.google.com') || editor.services?.[0]?.portfolioUrl?.includes('drive.google.com'))
                        ? '#1D4530'
                        : theme.colors.accentBorder,
                      borderWidth: 1,
                      paddingVertical: 7,
                      borderRadius: 8,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{
                      color: (editor.portfolioLinks?.[0]?.includes('drive.google.com') || editor.services?.[0]?.portfolioUrl?.includes('drive.google.com'))
                        ? '#4ADE80'
                        : theme.colors.accent,
                      fontWeight: '800',
                      fontSize: 12,
                    }}>
                      {(editor.portfolioLinks?.[0]?.includes('drive.google.com') || editor.services?.[0]?.portfolioUrl?.includes('drive.google.com'))
                        ? '📁 Drive'
                        : '▶ Portfolio'}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => router.push(`/editor/${encodeURIComponent(editor.id)}`)}
                    style={{
                      flex: 1,
                      backgroundColor: theme.colors.surfaceRaised,
                      borderColor: theme.colors.border,
                      borderWidth: 1,
                      paddingVertical: 7,
                      borderRadius: 8,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ color: theme.colors.text, fontWeight: '700', fontSize: 12 }}>Profile</Text>
                  </Pressable>
                </View>

                <AppButton
                  title={editor.membership?.status === 'ACTIVE' ? 'Joined' : editor.invitation ? 'Invited' : 'Invite to Team'}
                  disabled={Boolean(editor.membership?.status === 'ACTIVE' || editor.invitation)}
                  loading={invite.isPending && invite.variables === editor.id}
                  onPress={() => void handleInvite(editor.id)}
                />
              </View>
            ))}
          </ScrollView>

          <View style={{ marginTop: 14 }}>
            <AppButton
              title="Explore All 100+ Editors in Discover →"
              variant="secondary"
              onPress={() => setScope('general')}
            />
          </View>
        </View>

        {portfolioEditor ? (
          <EditorPortfolioPlayerModal
            key={portfolioEditor.id}
            editor={portfolioEditor}
            onClose={() => setPortfolioEditor(null)}
            onViewProfile={() => {
              const editorId = portfolioEditor.id;
              setPortfolioEditor(null);
              router.push(`/editor/${encodeURIComponent(editorId)}`);
            }}
          />
        ) : null}
      </Screen>
    );
  }

  // -------------------------------------------------------------
  // TAB 2: DISCOVER (Browse & Invite 100+ Editors)
  // -------------------------------------------------------------
  return (
    <Screen scroll={false} contentStyle={{ paddingTop: 8, paddingBottom: 0 }}>
      <GigxomiHeader rightSlot={headerRight} />
      <View style={s.header}>
        <Text style={w.title}>Find your next great editor.</Text>
        <Text style={w.body}>See their work. Find your fit. Create together.</Text>
      </View>
      {teamTabs}

      <View style={s.search}>
        <Feather name="search" size={18} color={theme.colors.textSecondary} />
        <TextInput
          accessibilityLabel="Search editors"
          style={s.input}
          placeholder="Search name, skill or specialty"
          placeholderTextColor={theme.colors.mutedText}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
          autoCorrect={false}
        />
        {search ? (
          <Pressable accessibilityLabel="Clear search" style={s.clear} onPress={() => setSearch('')}>
            <Feather name="x" size={17} color={theme.colors.textSecondary} />
          </Pressable>
        ) : null}
      </View>

      <View style={s.results}>
        <Text style={[w.meta, w.grow]}>
          {data?.pageInfo ? `${data.pageInfo.total} editors` : 'Editor directory'}
        </Text>
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: onlineOnly }}
          style={s.filter}
          onPress={() => setOnlineOnly(value => !value)}
        >
          <Text style={[w.meta, onlineOnly && s.activeText]}>● Online now</Text>
        </Pressable>
      </View>

      <FlatList
        key={`${scope}-${columns}`}
        data={filteredSortedEditors}
        numColumns={columns}
        keyExtractor={editor => editor.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        columnWrapperStyle={columns === 2 ? { gap: 10 } : undefined}
        contentContainerStyle={s.list}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        renderItem={({ item }) => (
          <View style={{ flex: 1, maxWidth: columns === 2 ? '49%' : '100%', gap: 8 }}>
            <EditorCard
              editor={item}
              compact={false}
              wide={columns === 1}
              onPortfolio={() => setPortfolioEditor(item)}
              onView={() => router.push(`/editor/${encodeURIComponent(item.id)}`)}
              onInvite={() => void handleInvite(item.id)}
              busy={invite.isPending && invite.variables === item.id}
              workPostId={workPostId}
              isWorkInvited={sentWorkIds.includes(item.id)}
              onInviteWork={() => void inviteToWork(item.id)}
              workBusy={workInvite.isPending && workInvite.variables?.editorId === item.id}
            />
          </View>
        )}
        onEndReached={() => {
          if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
        }}
        onEndReachedThreshold={0.4}
        refreshControl={<BrandedRefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />}
        ListHeaderComponent={<QueryFeedback error={query.error || actionError} onRetry={() => { setActionError(null); void query.refetch(); }} />}
        ListEmptyComponent={
          !query.error ? (
            <QueryFeedback
              loading={query.isLoading || query.isFetching}
              empty
              title={search ? 'No editors match your search' : 'No reviewed editors available yet'}
              message={
                search
                  ? 'Try another name or skill, or turn off Online now.'
                  : 'Approved editor portfolios will appear here. Pull down to refresh.'
              }
            />
          ) : null
        }
      />

      {portfolioEditor ? (
        <EditorPortfolioPlayerModal
          key={portfolioEditor.id}
          editor={portfolioEditor}
          onClose={() => setPortfolioEditor(null)}
          onViewProfile={() => {
            const editorId = portfolioEditor.id;
            setPortfolioEditor(null);
            router.push(`/editor/${encodeURIComponent(editorId)}`);
          }}
        />
      ) : null}

      {/* Upgrade Prompt Modal */}
      <Modal visible={showUpgradeModal} transparent animationType="fade" onRequestClose={() => setShowUpgradeModal(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: theme.colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Feather name="star" size={24} color={theme.colors.accent} />
            </View>
            <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: '900', textAlign: 'center' }}>
              Free Tier Team Limit Reached
            </Text>
            <Text style={{ color: theme.colors.textSecondary, fontSize: 13, textAlign: 'center', lineHeight: 19 }}>
              Your Freemium plan allows up to 14 editors on your agency team. Upgrade to Agency Premium for unlimited editor team members, manager accounts, and priority client dispatch.
            </Text>
            <AppButton
              title="Upgrade to Agency Premium →"
              variant="primary"
              onPress={() => {
                setShowUpgradeModal(false);
                router.push('/package');
              }}
            />
            <AppButton
              title="Close"
              variant="secondary"
              onPress={() => setShowUpgradeModal(false)}
            />
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const s = StyleSheet.create({
  header: { gap: 5, marginBottom: 14 },
  tabs: {
    flexDirection: 'row',
    padding: 4,
    backgroundColor: theme.colors.surface,
    borderRadius: 13,
    marginBottom: 12,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    minHeight: 42,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 9,
  },
  tabText: {
    color: theme.colors.textSecondary,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '700',
  },
  active: { backgroundColor: theme.colors.accentSoft },
  activeText: { color: theme.colors.accent, fontWeight: '800' },
  subFilterRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  subFilterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  subFilterChipActive: {
    backgroundColor: theme.colors.accentSoft,
    borderColor: theme.colors.accentBorder,
  },
  subFilterText: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  subFilterTextActive: {
    color: theme.colors.accent,
    fontWeight: '800',
  },
  learningPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: theme.radius.pill,
    backgroundColor: 'rgba(185, 247, 25, 0.08)',
    borderWidth: 1,
    borderColor: theme.colors.accentBorder,
  },
  learningPillActive: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  learningPillText: {
    color: theme.colors.accent,
    fontSize: 12,
    fontWeight: '800',
  },
  learningPillTextActive: {
    color: '#000',
    fontWeight: '900',
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 12,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
  },
  input: { flex: 1, color: theme.colors.text, minHeight: 48, fontSize: 14 },
  clear: { minHeight: 44, minWidth: 30, alignItems: 'center', justifyContent: 'center' },
  results: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: 8 },
  filter: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 10 },
  list: { paddingBottom: 160 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: theme.colors.surfaceRaised,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: 20,
    padding: 24,
    gap: 14,
    alignItems: 'center',
    width: '100%',
    maxWidth: 360,
  },
});
