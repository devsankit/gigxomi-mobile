import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { StableAvatar } from '@/src/components/StableAvatar';
import { AppButton } from '@/src/components/AppButton';
import { StatusBadge, workStyles as w } from '@/src/components/work/WorkPrimitives';
import { theme } from '@/src/constants/theme';
import { rupees, trustLabel, youtubeVideoId } from '@/src/lib/work-presentation';
import { portfolioSources, resolvePortfolioMedia } from '@/src/lib/portfolio-media';
import type { MobileTeamEditor } from '@/src/types';

export function EditorProof({ editor, dense = false }: { editor: MobileTeamEditor; dense?: boolean }) {
  if (dense) return <View style={{ gap: 2 }}><Text style={s.proof}>Trust · {trustLabel(editor)}</Text><Text style={w.meta}>{editor.workload ? `${editor.workload.activeProjects} project${editor.workload.activeProjects === 1 ? '' : 's'} · ${editor.workload.activeChats} chat${editor.workload.activeChats === 1 ? '' : 's'} active` : 'Workload unavailable'}</Text></View>;
  return <View style={[w.between, w.divider]}><View style={w.grow}><Text style={s.proof}>{trustLabel(editor)}</Text><Text style={w.meta}>Trust Score</Text></View><View style={w.grow}><Text style={[s.proof, s.right]}>{editor.workload ? `${editor.workload.activeProjects} active project${editor.workload.activeProjects === 1 ? '' : 's'}` : 'Workload unavailable'}</Text><Text style={[w.meta, s.right]}>{editor.workload ? `${editor.workload.activeChats} active chat${editor.workload.activeChats === 1 ? '' : 's'}` : 'Not reported yet'}</Text></View></View>;
}
export function EditorPresence({ editor }: { editor: MobileTeamEditor }) {
  return <Text style={[w.meta, editor.isOnline === true && s.online]}>● {editor.isOnline === true ? 'Online' : editor.isOnline === false ? 'Offline' : 'Presence unavailable'}</Text>;
}
export function PortfolioCover({ editor, onPress, large = false, wide = false, showPresence = false }: { editor: MobileTeamEditor; onPress: () => void; large?: boolean; wide?: boolean; showPresence?: boolean }) {
  const url = portfolioSources(editor)[0];
  const media = resolvePortfolioMedia(url);
  const isDrive = media?.kind === 'drive_folder' || media?.kind === 'drive_file';
  const isYouTube = media?.kind === 'youtube';
  const id = isYouTube ? media.videoId : null;
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const failed = failedUrl === url;

  return (
    <Pressable
      disabled={!url}
      accessibilityRole="button"
      accessibilityLabel={`View ${editor.name}'s portfolio${showPresence ? `, ${editor.isOnline === true ? 'online' : editor.isOnline === false ? 'offline' : 'presence unavailable'}` : ''}`}
      onPress={onPress}
      style={[s.cover, wide && s.wideCover, large && s.largeCover]}
    >
      {id && !failed ? (
        <Image
          accessible={false}
          alt=""
          source={{ uri: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` }}
          style={StyleSheet.absoluteFillObject}
          onError={() => setFailedUrl(url)}
        />
      ) : isDrive ? (
        <View style={s.driveCover}>
          <View style={s.driveCoverIconBox}>
            <Feather name="folder" size={32} color="#4ADE80" />
          </View>
          <Text style={s.driveCoverBadge}>Google Drive</Text>
        </View>
      ) : (
        <Feather name={url ? 'play-circle' : 'film'} size={48} color={theme.colors.textSecondary} />
      )}

      {showPresence ? (
        <View style={s.presence}>
          <EditorPresence editor={editor} />
        </View>
      ) : null}

      <View style={[s.coverLabel, isDrive && s.driveCoverLabel]}>
        <Feather name={isDrive ? 'folder' : url ? 'play-circle' : 'film'} size={18} color={isDrive ? '#4ADE80' : '#fff'} />
        <Text style={[s.coverText, isDrive && { color: '#4ADE80', fontWeight: '800' }]}>
          {isDrive ? 'Open Drive Portfolio ↗' : url ? 'View portfolio' : 'No portfolio shared'}
        </Text>
      </View>
    </Pressable>
  );
}
export function EditorCard({
  editor,
  compact = false,
  wide = false,
  selected,
  onSelect,
  onView,
  onPortfolio,
  onInvite,
  onRemove,
  onInviteWork,
  workPostId,
  isWorkInvited,
  busy,
  removeBusy,
  workBusy,
}: {
  editor: MobileTeamEditor;
  compact?: boolean;
  wide?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  onView: () => void;
  onPortfolio?: () => void;
  onInvite?: () => void;
  onRemove?: () => void;
  onInviteWork?: () => void;
  workPostId?: string;
  isWorkInvited?: boolean;
  busy?: boolean;
  removeBusy?: boolean;
  workBusy?: boolean;
}) {
  const active = editor.membership?.status === 'ACTIVE';
  const pending = Boolean(editor.invitation);
  const url = portfolioSources(editor)[0];
  const media = resolvePortfolioMedia(url);
  const isDrive = media?.kind === 'drive_folder' || media?.kind === 'drive_file';

  return (
    <View style={[s.card, selected && s.selected]}>
      {!compact ? <PortfolioCover editor={editor} onPress={onPortfolio ?? onView} wide={wide} showPresence /> : null}
      <View style={[s.content, !compact && s.discoveryContent]}>
        <View style={w.row}>
          {compact ? <StableAvatar label={editor.name} imageUrl={editor.avatarUrl} size={40} /> : null}
          <View style={w.grow}>
            <Text numberOfLines={2} style={s.name}>{editor.name}</Text>
            <Text numberOfLines={1} style={w.meta}>{editor.title}</Text>
          </View>
          {onSelect ? (
            <Pressable
              accessibilityRole="checkbox"
              accessibilityLabel={`Select ${editor.name}`}
              accessibilityState={{ checked: selected, disabled: busy }}
              disabled={busy || editor.offerEligible === false}
              onPress={onSelect}
              style={s.selectTarget}
            >
              <Feather name={selected ? 'check-square' : 'square'} size={23} color={selected ? theme.colors.accent : theme.colors.textSecondary} />
            </Pressable>
          ) : null}
        </View>
        {compact ? <EditorPresence editor={editor} /> : null}
        <EditorProof editor={editor} dense={!compact} />
        <Text style={s.price}>{editor.startingPrice != null ? `From ${rupees(editor.startingPrice)}` : 'Price on request'}</Text>
        <View style={[w.between, s.actions]}>
          {url ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Play ${editor.name}'s portfolio`}
              onPress={onPortfolio ?? onView}
              style={[w.linkTarget, { flexDirection: 'row', alignItems: 'center', gap: 4 }]}
            >
              <Feather name={isDrive ? 'folder' : 'play-circle'} size={15} color={isDrive ? '#4ADE80' : theme.colors.accent} />
              <Text style={[w.link, { color: isDrive ? '#4ADE80' : theme.colors.accent, fontWeight: '800' }]}>
                {isDrive ? '📁 Drive Portfolio' : '▶ Play Portfolio'}
              </Text>
            </Pressable>
          ) : null}
          <Pressable accessibilityRole="button" accessibilityLabel={`View ${editor.name}'s profile`} onPress={onView} style={w.linkTarget}>
            <Text style={w.link}>View profile ↗</Text>
          </Pressable>
          {active ? <StatusBadge label="Team Member" tone="positive" /> : null}
        </View>

        {/* Action Button Section: Single, context-aware action */}
        {!onSelect ? (
          workPostId ? (
            <View style={{ marginTop: 4 }}>
              {isWorkInvited ? (
                <StatusBadge label="Invited to this work" tone="positive" />
              ) : (
                <AppButton
                  title="Invite to this work"
                  loading={workBusy}
                  disabled={editor.offerEligible === false}
                  onPress={onInviteWork ?? (() => {})}
                />
              )}
            </View>
          ) : active ? (
            onRemove ? (
              <View style={{ marginTop: 4 }}>
                <AppButton
                  title="Remove from team"
                  variant="danger"
                  loading={removeBusy}
                  onPress={onRemove}
                />
              </View>
            ) : null
          ) : pending ? (
            <View style={{ marginTop: 4 }}>
              <StatusBadge
                label={editor.invitation?.direction === 'FREELANCER_TO_AGENCY' ? 'Request received' : 'Invitation pending'}
                tone="pending"
              />
            </View>
          ) : onInvite ? (
            <View style={{ marginTop: 4 }}>
              <AppButton
                title="Invite to team"
                loading={busy}
                onPress={onInvite}
              />
            </View>
          ) : null
        ) : null}
      </View>
    </View>
  );
}
const s = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, overflow: 'hidden' },
  selected: { borderColor: theme.colors.accent, backgroundColor: theme.colors.accentSoft },
  content: { padding: 12, gap: 8 }, name: { color: theme.colors.text, fontSize: 15, lineHeight: 20, fontWeight: '700' },
  discoveryContent: { gap: 6, paddingBottom: 8 }, actions: { flexWrap: 'wrap', gap: 4 },
  proof: { color: theme.colors.text, fontSize: 12, fontWeight: '600', lineHeight: 18 }, right: { textAlign: 'right' },
  price: { color: theme.colors.text, fontSize: 14, fontWeight: '700' }, online: { color: '#8CE7AD' }, selectTarget: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
  cover: { width: '100%', aspectRatio: 1, backgroundColor: theme.colors.surfaceRaised, justifyContent: 'center', alignItems: 'center' },
  wideCover: { aspectRatio: 16 / 9 },
  largeCover: { aspectRatio: undefined, height: 190 },
  presence: { position: 'absolute', top: 10, left: 10, right: 10, alignSelf: 'flex-start', backgroundColor: '#0B1118E6', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  coverLabel: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 9, backgroundColor: '#0009', flexDirection: 'row', alignItems: 'center', gap: 6 },
  coverText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  driveCover: { ...StyleSheet.absoluteFillObject, backgroundColor: '#0E1715', alignItems: 'center', justifyContent: 'center', gap: 8 },
  driveCoverIconBox: { width: 52, height: 52, borderRadius: 16, backgroundColor: '#163323', alignItems: 'center', justifyContent: 'center' },
  driveCoverBadge: { color: '#4ADE80', fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  driveCoverLabel: { backgroundColor: 'rgba(14, 23, 21, 0.9)', borderColor: '#1D3B2B', borderWidth: 1 },
});
