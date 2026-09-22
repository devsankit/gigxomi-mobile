import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppButton } from '@/src/components/AppButton';
import { theme } from '@/src/constants/theme';
import { ApiError, isNetworkError } from '@/src/lib/api';
import { uniqueTags } from '@/src/lib/work-presentation';

export const workStyles = StyleSheet.create({
  title: { color: theme.colors.text, fontSize: 26, lineHeight: 32, fontWeight: '800' },
  heading: { color: theme.colors.text, fontSize: 17, lineHeight: 23, fontWeight: '700' },
  body: { color: theme.colors.textSecondary, fontSize: 14, lineHeight: 21 },
  meta: { color: theme.colors.textSecondary, fontSize: 12, lineHeight: 18 },
  eyebrow: { color: theme.colors.accent, fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  grow: { flex: 1, minWidth: 0 },
  card: { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 16, padding: 14, gap: 10 },
  divider: { borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: 10 },
  link: { color: theme.colors.accent, fontSize: 13, fontWeight: '700' },
  linkTarget: { minHeight: 44, justifyContent: 'center' },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: theme.colors.border, backgroundColor: theme.colors.backgroundSoft, gap: 10 },
});

export function CompactTags({ items, limit = 3 }: { items: string[]; limit?: number }) {
  const [open, setOpen] = useState(false);
  const tags = uniqueTags(items);
  if (!tags.length) return null;
  return <><View style={s.tags}>{tags.slice(0, limit).map(tag => <View key={tag.toLowerCase()} style={s.tag}><Text numberOfLines={1} style={s.tagText}>{tag}</Text></View>)}
    {tags.length > limit ? <Pressable accessibilityRole="button" accessibilityLabel={`Show all ${tags.length} skills and tags`} onPress={() => setOpen(true)} style={s.more}><Text style={s.tagText}>+{tags.length - limit}</Text></Pressable> : null}
  </View><Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}><View style={s.overlay}><SafeAreaView style={s.tagSheet}><Text style={workStyles.heading}>Skills & tags</Text><ScrollView contentContainerStyle={s.allTags}>{tags.map(tag => <View style={s.tag} key={tag.toLowerCase()}><Text style={s.tagText}>{tag}</Text></View>)}</ScrollView><AppButton title="Done" onPress={() => setOpen(false)} /></SafeAreaView></View></Modal></>;
}

export function StatusBadge({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'positive' | 'pending' }) {
  return <View style={[s.badge, tone === 'positive' && s.positive, tone === 'pending' && s.pending]}><Text style={[s.badgeText, tone === 'positive' && { color: '#8CE7AD' }, tone === 'pending' && { color: '#F2C778' }]}>{label}</Text></View>;
}

export function QueryFeedback({ loading, error, empty, title = 'Nothing here yet', message, onRetry, errorTitle, errorMessage, retryLabel = 'Try again' }: {
  loading?: boolean; error?: unknown; empty?: boolean; title?: string; message?: string; onRetry?: () => void; errorTitle?: string; errorMessage?: string; retryLabel?: string;
}) {
  if (!loading && !error && !empty) return null;
  const expired = error instanceof ApiError && error.status === 401;
  const forbidden = error instanceof ApiError && error.status === 403;
  const missing = error instanceof ApiError && error.status === 404;
  return <View accessibilityLiveRegion="polite" style={s.feedback}>
    {loading ? <ActivityIndicator color={theme.colors.accent} /> : <Feather name={error ? 'alert-circle' : 'inbox'} size={25} color={theme.colors.textSecondary} />}
    <Text style={workStyles.heading}>{loading ? 'Loading…' : expired ? 'Sign in to continue' : forbidden ? 'Access not available' : isNetworkError(error) ? 'You’re offline' : error ? (missing ? 'Not available right now' : errorTitle ?? 'Couldn’t load this view') : title}</Text>
    {!loading ? <Text style={[workStyles.body, { textAlign: 'center' }]}>{expired ? 'Your session needs to be refreshed.' : forbidden ? 'Your account cannot use this action yet. Check your profile approval or workspace permissions, then refresh.' : error ? (errorMessage ?? (isNetworkError(error) ? 'Reconnect and retry. Saved results may still be shown below.' : 'Please retry. If this continues, contact Gigxomi support.')) : message}</Text> : null}
    {expired ? <AppButton title="Sign in" onPress={() => router.push('/login')} /> : error && onRetry ? <AppButton title={retryLabel} variant="secondary" onPress={onRetry} /> : null}
  </View>;
}
const s = StyleSheet.create({
  tags: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 32 },
  tag: { backgroundColor: theme.colors.surfaceRaised, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 4, maxWidth: '34%', flexShrink: 1, alignSelf: 'center' },
  tagText: { color: theme.colors.textSecondary, fontSize: 12, lineHeight: 16, includeFontPadding: false },
  more: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  badge: { alignSelf: 'flex-start', maxWidth: '100%', backgroundColor: theme.colors.surfaceRaised, borderRadius: 7, paddingHorizontal: 8, paddingVertical: 5 },
  badgeText: { color: theme.colors.textSecondary, fontSize: 11, lineHeight: 15, fontWeight: '600' },
  positive: { backgroundColor: '#173123' }, pending: { backgroundColor: '#342C1E' },
  feedback: { padding: 20, gap: 12, alignItems: 'center' }, overlay: { flex: 1, backgroundColor: '#000A', justifyContent: 'center', padding: 20 },
  tagSheet: { backgroundColor: theme.colors.surface, borderRadius: 18, padding: 20, maxHeight: '70%', gap: 16 },
  allTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingVertical: 16 },
});
