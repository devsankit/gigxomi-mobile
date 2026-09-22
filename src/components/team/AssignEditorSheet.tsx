import { Feather } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { FlatList, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppButton } from '@/src/components/AppButton';
import { QueryFeedback, workStyles as w } from '@/src/components/work/WorkPrimitives';
import { EditorCard } from './EditorCard';
import { EditorProfileModal } from './EditorProfile';
import { useEditorDirectory } from '@/src/hooks/useTeam';
import { useDebouncedValue } from '@/src/hooks/useDebouncedValue';
import { theme } from '@/src/constants/theme';
import type { MobileTeamEditor } from '@/src/types';

export type EditorAssignmentInput = { freelancerIds: string[]; projectDetails: string; assignmentMode: 'offer' | 'direct' | 'replace' };
export function AssignEditorSheet({ visible, defaultProjectDetails, hasPrimaryEditor, isSaving, error, onAssign, onClose }: {
  visible: boolean; defaultProjectDetails?: string; hasPrimaryEditor: boolean; isSaving: boolean; error?: unknown;
  onAssign: (input: EditorAssignmentInput) => void; onClose: () => void;
}) {
  const [step, setStep] = useState<'choose' | 'review'>('choose');
  const [scope, setScope] = useState<'team' | 'general'>('general');
  const [search, setSearch] = useState('');
  const [onlineOnly, setOnlineOnly] = useState(false);
  const [selected, setSelected] = useState<MobileTeamEditor[]>([]);
  const [details, setDetails] = useState(defaultProjectDetails ?? '');
  const [mode, setMode] = useState<'offer' | 'direct'>('offer');
  const [profileId, setProfileId] = useState<string | null>(null);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const query = useEditorDirectory({ enabled: visible, scope, search: useDebouncedValue(search), onlineOnly });
  const rawEditors = query.data?.mode === 'agency' ? query.data.editors : [];
  const searchTokens = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const filteredRawEditors = searchTokens.length > 0
    ? rawEditors.filter(e => {
        const text = `${e.name} ${e.alias || ''} ${e.specialty || ''} ${(e.skills || []).join(' ')} ${e.phone || ''}`.toLowerCase();
        return searchTokens.every(tok => text.includes(tok));
      })
    : rawEditors;
  const editors = [...filteredRawEditors].sort((a, b) => {
    if (Boolean(a.isOnline) === Boolean(b.isOnline)) return 0;
    return a.isOnline ? -1 : 1;
  });
  const canDirect = scope === 'team' && selected.length === 1 && selected[0].membership?.status === 'ACTIVE' && selected[0].directAssignmentEligible === true;
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardOpen(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardOpen(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  function toggle(editor: MobileTeamEditor) {
    if (isSaving || editor.offerEligible === false) return;
    setMode('offer');
    setSelected(current => current.some(item => item.id === editor.id) ? current.filter(item => item.id !== editor.id) : [...current, editor]);
  }
  function changeScope(next: 'team' | 'general') { setScope(next); setSearch(''); setMode('offer'); }
  function close() { if (!isSaving) { Keyboard.dismiss(); onClose(); } }
  function submit() {
    if (!selected.length || isSaving || (mode === 'direct' && !canDirect)) return;
    Keyboard.dismiss();
    onAssign({ freelancerIds: selected.map(editor => editor.id), projectDetails: details.trim(), assignmentMode: mode === 'direct' ? 'direct' : hasPrimaryEditor ? 'replace' : 'offer' });
  }
  return <><Modal visible={visible} animationType="slide" onRequestClose={close}>
    <SafeAreaView style={s.safe}><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.flex}>
      <View style={s.head}><Pressable accessibilityRole="button" accessibilityLabel={step === 'review' ? 'Back to editor selection' : 'Close editor selection'} disabled={isSaving} onPress={() => step === 'review' ? setStep('choose') : close()} style={s.icon}><Feather name="arrow-left" size={22} color={theme.colors.text} /></Pressable><Text style={w.body}>Assign editor · Step {step === 'choose' ? 1 : 2} of 2</Text><Pressable accessibilityLabel="Close assignment" disabled={isSaving} onPress={close} style={s.icon}><Feather name="x" size={22} color={theme.colors.text} /></Pressable></View>
      {!keyboardOpen ? <View style={s.heading}><Text style={w.title}>{step === 'choose' ? 'Who’s right for this work?' : 'Make the brief clear.'}</Text><Text style={w.body}>{step === 'choose' ? 'Choose editors first. Add your brief next.' : 'Give your editor the context to start strong.'}</Text></View> : null}
      {step === 'choose' ? <>
        <View style={s.tabs}>{(['general', 'team'] as const).map(value => <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: scope === value }} disabled={isSaving} onPress={() => changeScope(value)} style={[s.tab, scope === value && s.active]}><Text style={[w.body, scope === value && w.link]}>{value === 'team' ? 'My Team' : 'All editors'}</Text></Pressable>)}</View>
        <View style={s.search}><Feather name="search" color={theme.colors.textSecondary} size={18} /><TextInput accessibilityLabel="Search editors" style={s.input} placeholder="Search name, skill or specialty" placeholderTextColor={theme.colors.mutedText} value={search} onChangeText={setSearch} autoCorrect={false} />{search ? <Pressable accessibilityLabel="Clear editor search" onPress={() => setSearch('')} style={s.icon}><Feather name="x" size={17} color={theme.colors.textSecondary} /></Pressable> : null}</View>
        <View style={s.filters}><Text style={[w.meta, w.grow]}>{scope === 'team' ? 'Offer or assign directly' : 'Send offers to active freelancers'}</Text><Pressable accessibilityRole="switch" accessibilityState={{ checked: onlineOnly }} onPress={() => setOnlineOnly(value => !value)} style={s.icon}><Text style={onlineOnly ? w.link : w.meta}>● Online now</Text></Pressable></View>
        <FlatList data={editors} keyExtractor={item => item.id} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={s.list} ItemSeparatorComponent={() => <View style={{ height: 10 }} />} renderItem={({ item }) => <EditorCard editor={item} compact selected={selected.some(editor => editor.id === item.id)} busy={isSaving} onSelect={() => toggle(item)} onView={() => { Keyboard.dismiss(); setProfileId(item.id); }} />}
          ListHeaderComponent={<QueryFeedback error={query.error} onRetry={() => void query.refetch()} />}
          ListEmptyComponent={!query.error ? <QueryFeedback loading={query.isLoading || query.isFetching} empty title={search ? 'No matching editors' : scope === 'team' ? 'No accepted team members yet' : 'No active freelancers available'} message={search ? 'Try another name or skill, or turn off Online now.' : scope === 'team' ? 'Invite an editor from All editors. They appear here after accepting.' : 'Pull down to refresh the active freelancer directory.'} /> : null}
          onEndReached={() => { if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage(); }} onEndReachedThreshold={0.4} ListFooterComponent={<QueryFeedback loading={query.isFetchingNextPage} />}
        />
      </> : <ScrollView contentContainerStyle={s.list} keyboardShouldPersistTaps="handled">
        <View style={w.between}><Text style={w.heading}>{selected.length} editor{selected.length === 1 ? '' : 's'} selected</Text><Pressable style={w.linkTarget} disabled={isSaving} onPress={() => setStep('choose')}><Text style={w.link}>Change</Text></Pressable></View>
        {selected.map(editor => <View style={[w.card, { marginBottom: 10 }]} key={editor.id}><Text style={w.heading}>{editor.name}</Text><Text style={w.meta}>{editor.title}</Text></View>)}
        <Text style={w.body}>Project brief · optional</Text><TextInput accessibilityLabel="Project brief" multiline value={details} onChangeText={setDetails} placeholder="Deliverables, deadline and reference files…" placeholderTextColor={theme.colors.mutedText} style={s.details} />
        {canDirect ? <View style={s.tabs}>{(['offer', 'direct'] as const).map(value => <Pressable key={value} onPress={() => setMode(value)} style={[s.tab, mode === value && s.active]}><Text style={mode === value ? w.link : w.body}>{value === 'offer' ? 'Send offer' : 'Assign directly'}</Text></Pressable>)}</View> : null}
        <View style={w.card}><Text style={w.body}>{mode === 'direct' ? 'This accepted team member receives the assignment immediately. Existing customer-reply permissions still apply.' : 'The first editor to accept gets this work. Remaining offers expire automatically.'}</Text><Text style={w.meta}>{scope === 'general' ? 'Accepting an offer does not add the editor to your team.' : 'Offline editors can receive work too.'}</Text>{hasPrimaryEditor && mode !== 'direct' ? <Text style={w.meta}>This sends a replacement offer for the currently assigned work.</Text> : null}</View>
        <QueryFeedback error={error} onRetry={submit} />
      </ScrollView>}
      <View style={w.footer}>{step === 'choose' ? <><Text style={w.heading}>{selected.length} editor{selected.length === 1 ? '' : 's'} selected</Text><AppButton title="Continue to review →" disabled={!selected.length || isSaving} onPress={() => { Keyboard.dismiss(); setStep('review'); }} /></> : <AppButton title={mode === 'direct' ? 'Assign directly' : `${hasPrimaryEditor ? 'Send replacement offer' : 'Send offer'} to ${selected.length} editor${selected.length === 1 ? '' : 's'}`} disabled={!selected.length || (mode === 'direct' && !canDirect)} loading={isSaving} onPress={submit} />}</View>
    </KeyboardAvoidingView></SafeAreaView>
  </Modal><EditorProfileModal editorId={profileId} onClose={() => setProfileId(null)} onSelect={editor => { setSelected(current => current.some(item => item.id === editor.id) ? current : [...current, editor]); setProfileId(null); }} /></>;
}
const s = StyleSheet.create({ safe: { flex: 1, backgroundColor: theme.colors.background }, flex: { flex: 1 }, head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 }, icon: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'center' }, heading: { padding: 16, gap: 6 }, tabs: { flexDirection: 'row', backgroundColor: theme.colors.surface, padding: 4, borderRadius: 12, marginHorizontal: 16, marginBottom: 12, gap: 4 }, tab: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 8, padding: 6 }, active: { backgroundColor: theme.colors.accentSoft }, search: { marginHorizontal: 16, backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderWidth: 1, borderRadius: 12, paddingLeft: 12, gap: 8, flexDirection: 'row', alignItems: 'center' }, input: { flex: 1, minHeight: 48, color: theme.colors.text, fontSize: 15 }, filters: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16 }, list: { paddingHorizontal: 16, paddingBottom: 24, gap: 10 }, details: { minHeight: 110, textAlignVertical: 'top', color: theme.colors.text, fontSize: 15, backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderWidth: 1, borderRadius: 12, padding: 12, marginVertical: 8 } });
