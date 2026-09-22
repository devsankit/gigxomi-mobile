import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppButton } from '@/src/components/AppButton';
import { AppCard } from '@/src/components/AppCard';
import { StableAvatar } from '@/src/components/StableAvatar';
import { CompactTags, QueryFeedback, StatusBadge, workStyles as w } from '@/src/components/work/WorkPrimitives';
import { EditorPresence, EditorProof, PortfolioCover } from './EditorCard';
import { useCancelTeamInvitation, useEditorProfile, useInviteTeamEditor } from '@/src/hooks/useTeam';
import { publicMediaUrl, rupees } from '@/src/lib/work-presentation';
import { portfolioSources } from '@/src/lib/portfolio-media';
import { PortfolioMediaPlayer } from './PortfolioMediaPlayer';
import { theme } from '@/src/constants/theme';
import type { MobileTeamEditor } from '@/src/types';

export function EditorPortfolioPlayerModal({
  editor,
  onClose,
  onViewProfile,
}: {
  editor: MobileTeamEditor;
  onClose: () => void;
  onViewProfile?: () => void;
}) {
  const profile = useEditorProfile(editor.id);
  const current = profile.data?.editor ?? editor;
  const sources = portfolioSources(current);
  const [selected, setSelected] = useState<string | null>(null);
  const playing = selected && sources.includes(selected) ? selected : sources[0];
  const invite = useInviteTeamEditor();
  const cancelInvite = useCancelTeamInvitation();
  const [sent, setSent] = useState(false);
  const pending = (sent || Boolean(current.invitation)) && !cancelInvite.isSuccess;
  const active = current.membership?.status === 'ACTIVE';

  async function handleCancel() {
    const inviteId = current.invitation?.id;
    if (!inviteId) return;
    try {
      await cancelInvite.mutateAsync(inviteId);
      setSent(false);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Unable to cancel invitation.');
    }
  }

  return (
    <Modal animationType="slide" visible onRequestClose={onClose}>
      <SafeAreaView style={s.screen}>
        <View style={s.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close portfolio player"
            style={s.back}
            onPress={onClose}
          >
            <Feather name="x" size={23} color={theme.colors.text} />
          </Pressable>
          <View style={w.grow}>
            <Text numberOfLines={1} style={w.heading}>
              {current.name}
            </Text>
          </View>
        </View>
        <ScrollView contentContainerStyle={s.portfolioModalContent}>
          <QueryFeedback loading={profile.isLoading} error={profile.error} onRetry={() => void profile.refetch()} />
          {!profile.error ? (
            <>
              {playing ? (
                <PortfolioMediaPlayer url={playing} />
              ) : !profile.isLoading ? (
                <View style={w.card}>
                  <Text style={w.heading}>No portfolio samples shared yet</Text>
                  <Text style={w.body}>
                    When this editor shares a public video, you’ll be able to watch it here before inviting them.
                  </Text>
                </View>
              ) : null}
              {sources.length > 1 ? (
                <View style={s.sampleList}>
                  <Text style={w.heading}>Explore their work</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                    {sources.map((source, index) => (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ selected: playing === source }}
                        key={source}
                        onPress={() => setSelected(source)}
                        style={[s.sampleButton, playing === source && s.sampleButtonActive]}
                      >
                        <Feather
                          color={playing === source ? theme.colors.accent : theme.colors.textSecondary}
                          name="play-circle"
                          size={19}
                        />
                        <Text style={w.body}>{'Sample ' + (index + 1)}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              ) : null}
              <View style={s.portfolioProofCard}>
                <View style={w.row}>
                  <StableAvatar label={current.name} imageUrl={current.avatarUrl} size={48} />
                  <View style={w.grow}>
                    <Text style={w.heading}>{current.name}</Text>
                    <Text style={w.meta}>{current.title || current.category || 'Video editor'}</Text>
                    <EditorPresence editor={current} />
                  </View>
                </View>
                <EditorProof editor={current} />
                <View style={w.between}>
                  <Text style={w.meta}>Starting price</Text>
                  <Text style={w.link}>
                    {current.startingPrice == null ? 'Price on request' : 'From ' + rupees(current.startingPrice)}
                  </Text>
                </View>
              </View>
            </>
          ) : null}
          <View style={s.portfolioActions}>
            {onViewProfile ? (
              <AppButton title="View full editor profile" variant="secondary" onPress={onViewProfile} />
            ) : null}
            <QueryFeedback
              error={invite.error}
              errorTitle="Invitation not confirmed"
              errorMessage="Check your connection and try again."
              retryLabel="Retry invitation"
              onRetry={() => invite.mutate(current.id, { onSuccess: () => setSent(true) })}
            />
            {active ? (
              <StatusBadge label="Already in your Agency Team" tone="positive" />
            ) : pending ? (
              <View style={{ gap: 8 }}>
                <StatusBadge
                  label={
                    current.invitation?.direction === 'FREELANCER_TO_AGENCY'
                      ? 'Team request received'
                      : 'Agency invitation sent'
                  }
                  tone="pending"
                />
                {current.invitation?.id ? (
                  <AppButton
                    title="Cancel invitation"
                    variant="danger"
                    loading={cancelInvite.isPending}
                    onPress={() => void handleCancel()}
                  />
                ) : null}
              </View>
            ) : !invite.isError ? (
              <AppButton
                title="Invite to Agency Team"
                disabled={profile.isLoading || profile.isError}
                loading={invite.isPending}
                onPress={() => invite.mutate(current.id, { onSuccess: () => setSent(true) })}
              />
            ) : null}
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

export function EditorProfileContent({
  editorId,
  onClose,
  onSelect,
}: {
  editorId: string;
  onClose: () => void;
  onSelect?: (editor: MobileTeamEditor) => void;
}) {
  const query = useEditorProfile(editorId);
  const invite = useInviteTeamEditor();
  const cancelInvite = useCancelTeamInvitation();
  const [playing, setPlaying] = useState<string | null>(null);
  const [inviteSent, setInviteSent] = useState(false);
  const [actionError, setActionError] = useState<unknown>(null);
  const editor = query.data?.editor;
  const active = editor?.membership?.status === 'ACTIVE';
  const pending = (inviteSent || Boolean(editor?.invitation)) && !cancelInvite.isSuccess;

  function play(value?: string | null) {
    const url = publicMediaUrl(value);
    if (!url) {
      setActionError(new Error('This portfolio link is unavailable.'));
      return;
    }
    setPlaying(url);
  }

  async function sendInvite() {
    try {
      setActionError(null);
      await invite.mutateAsync(editorId);
      setInviteSent(true);
    } catch (error) {
      setActionError(error);
    }
  }

  async function cancelPendingInvite() {
    const inviteId = editor?.invitation?.id;
    if (!inviteId) return;
    try {
      setActionError(null);
      await cancelInvite.mutateAsync(inviteId);
      setInviteSent(false);
      void query.refetch();
    } catch (error) {
      setActionError(error);
    }
  }

  const sources = editor ? portfolioSources(editor) : [];
  const trustScore = editor?.trustScore ?? 85;

  return (
    <SafeAreaView style={s.screen}>
      <View style={s.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to editors"
          style={s.back}
          onPress={onClose}
        >
          <Feather name="arrow-left" size={22} color={theme.colors.text} />
        </Pressable>
        <Text style={w.body}>Editor Profile</Text>
      </View>

      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <QueryFeedback loading={query.isLoading} error={query.error} onRetry={() => void query.refetch()} />
        {editor && !query.error ? (
          <>
            {/* Header Identity Card */}
            <AppCard style={s.identityCard}>
              <View style={w.row}>
                <StableAvatar label={editor.name} imageUrl={editor.avatarUrl} size={64} />
                <View style={w.grow}>
                  <Text style={s.editorName}>{editor.name}</Text>
                  <Text style={s.editorTitle}>{editor.title || 'Video Editor'}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    <EditorPresence editor={editor} />
                    <Text style={s.dotSep}>•</Text>
                    <Text style={s.categoryTag}>{editor.category || 'Video Editing'}</Text>
                  </View>
                </View>
              </View>

              <View style={s.statRow}>
                <View style={s.statItem}>
                  <Text style={s.statValue}>{trustScore}</Text>
                  <Text style={s.statLabel}>Trust Score</Text>
                </View>
                <View style={s.statDivider} />
                <View style={s.statItem}>
                  <Text style={s.statValue}>{editor.workload?.activeProjects ?? 0}</Text>
                  <Text style={s.statLabel}>Active Work</Text>
                </View>
                <View style={s.statDivider} />
                <View style={s.statItem}>
                  <Text style={s.statValue}>
                    {editor.startingPrice ? `₹${editor.startingPrice.toLocaleString('en-IN')}` : 'Flexible'}
                  </Text>
                  <Text style={s.statLabel}>Starting Rate</Text>
                </View>
              </View>
            </AppCard>

            {/* Portfolio & Video Showcase */}
            <View style={s.sectionBlock}>
              <Text style={s.sectionHeader}>Portfolio & Showreel</Text>
              {playing ? (
                <PortfolioMediaPlayer url={playing} />
              ) : (
                <PortfolioCover editor={editor} large onPress={() => play(sources[0])} />
              )}
              {sources.length > 1 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginTop: 8 }}>
                  {sources.map((source, index) => (
                    <Pressable
                      key={source}
                      accessibilityRole="button"
                      onPress={() => play(source)}
                      style={[s.sampleButton, playing === source && s.sampleButtonActive]}
                    >
                      <Feather name="play" size={14} color={playing === source ? theme.colors.accent : theme.colors.text} />
                      <Text style={playing === source ? w.link : w.body}>{'Sample ' + (index + 1)}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              ) : null}
            </View>

            {/* About / Bio */}
            {editor.bio ? (
              <AppCard style={s.sectionCard}>
                <Text style={s.cardTitle}>About the Editor</Text>
                <Text style={s.bioText}>{editor.bio}</Text>
              </AppCard>
            ) : null}

            {/* Skills & Production Tools */}
            <AppCard style={s.sectionCard}>
              <Text style={s.cardTitle}>Skills & Production Tools</Text>
              <CompactTags items={editor.skills?.length ? editor.skills : ['Video Editing', 'Color Grading', 'Premiere Pro']} />
            </AppCard>

            {/* All Services & Packages */}
            <View style={s.sectionBlock}>
              <Text style={s.sectionHeader}>Services & Packages</Text>
              {editor.services?.length ? (
                editor.services.map((service) => (
                  <AppCard key={service.id} style={s.serviceCard}>
                    <View style={w.between}>
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <Text style={s.serviceTitle}>{service.title}</Text>
                        <Text style={s.serviceCategory}>{service.category || 'Video Editing'}</Text>
                      </View>
                      <Text style={s.servicePrice}>{rupees(service.price)}</Text>
                    </View>
                    <Text style={s.serviceDelivery}>
                      ⏱ {service.deliveryTime || '2-3 days delivery'}
                    </Text>
                    {service.portfolioUrl ? (
                      <Pressable
                        style={s.playSampleBtn}
                        onPress={() => play(service.portfolioUrl)}
                      >
                        <Feather name="play-circle" size={16} color={theme.colors.accent} />
                        <Text style={s.playSampleText}>Watch package sample reel</Text>
                      </Pressable>
                    ) : null}
                  </AppCard>
                ))
              ) : (
                <AppCard style={s.emptyServices}>
                  <Text style={w.body}>
                    No custom packages listed. You can agree on scope and pricing directly.
                  </Text>
                </AppCard>
              )}
            </View>

            <QueryFeedback error={actionError} onRetry={() => setActionError(null)} />
          </>
        ) : null}
      </ScrollView>

      {editor && !query.error ? (
        <View style={w.footer}>
          {onSelect ? (
            <AppButton
              title="Select editor & return"
              disabled={editor.offerEligible === false}
              onPress={() => onSelect(editor)}
            />
          ) : active ? (
            <StatusBadge label="✓ Active in your agency team" tone="positive" />
          ) : pending ? (
            <View style={{ gap: 8, width: '100%' }}>
              <StatusBadge label="Invitation pending with editor" tone="pending" />
              <AppButton
                title="Cancel invitation"
                variant="danger"
                loading={cancelInvite.isPending}
                onPress={() => void cancelPendingInvite()}
              />
            </View>
          ) : (
            <AppButton
              title="Invite to agency team"
              loading={invite.isPending}
              onPress={() => void sendInvite()}
            />
          )}
        </View>
      ) : null}
    </SafeAreaView>
  );
}

export function EditorProfileModal({
  editorId,
  onClose,
  onSelect,
}: {
  editorId: string | null;
  onClose: () => void;
  onSelect?: (editor: MobileTeamEditor) => void;
}) {
  return (
    <Modal visible={Boolean(editorId)} animationType="slide" onRequestClose={onClose}>
      {editorId ? (
        <EditorProfileContent key={editorId} editorId={editorId} onClose={onClose} onSelect={onSelect} />
      ) : null}
    </Modal>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  header: { paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, gap: 16, paddingBottom: 30 },
  identityCard: {
    gap: 16,
    padding: 16,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.borderSubtle,
  },
  editorName: {
    fontSize: 18,
    fontWeight: '900',
    color: theme.colors.text,
  },
  editorTitle: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  dotSep: {
    color: theme.colors.mutedText,
  },
  categoryTag: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.accent,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: theme.colors.surfaceRaised,
    borderRadius: 12,
    paddingVertical: 12,
  },
  statItem: {
    alignItems: 'center',
    gap: 2,
  },
  statValue: {
    fontSize: 17,
    fontWeight: '900',
    color: theme.colors.accent,
  },
  statLabel: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    fontWeight: '700',
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: theme.colors.borderSubtle,
  },
  sectionBlock: {
    gap: 10,
  },
  sectionHeader: {
    fontSize: 16,
    fontWeight: '900',
    color: theme.colors.text,
  },
  sectionCard: {
    gap: 10,
    padding: 16,
    borderColor: theme.colors.borderSubtle,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: theme.colors.text,
  },
  bioText: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    lineHeight: 20,
  },
  serviceCard: {
    gap: 8,
    padding: 14,
    marginBottom: 8,
    borderColor: theme.colors.borderSubtle,
  },
  serviceTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: theme.colors.text,
  },
  serviceCategory: {
    fontSize: 11,
    color: theme.colors.accent,
    fontWeight: '700',
    marginTop: 2,
  },
  servicePrice: {
    fontSize: 15,
    fontWeight: '900',
    color: theme.colors.accent,
  },
  serviceDelivery: {
    fontSize: 12,
    color: theme.colors.mutedText,
  },
  playSampleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: theme.colors.surfaceRaised,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  playSampleText: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.accent,
  },
  emptyServices: {
    padding: 14,
  },
  sampleList: { gap: 8 },
  sampleButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 9,
    minHeight: 44,
    paddingHorizontal: 12,
  },
  sampleButtonActive: { backgroundColor: theme.colors.accentSoft, borderColor: theme.colors.accentBorder },
  portfolioModalContent: { gap: 16, padding: 16, paddingBottom: 40 },
  portfolioProofCard: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.accentBorder,
    borderRadius: 20,
    borderWidth: 1,
    gap: 12,
    padding: 15,
  },
  portfolioActions: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: 20,
    borderWidth: 1,
    gap: 10,
    padding: 14,
  },
  portfolioPrivacy: { color: theme.colors.mutedText, fontSize: 10.5, lineHeight: 15, textAlign: 'center' },
});
