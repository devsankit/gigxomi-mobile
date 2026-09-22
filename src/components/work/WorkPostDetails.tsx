import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppButton } from '@/src/components/AppButton';
import { AppInput } from '@/src/components/AppInput';
import { StableAvatar } from '@/src/components/StableAvatar';
import { EditorProfileModal } from '@/src/components/team/EditorProfile';
import { CompactTags, QueryFeedback, StatusBadge, workStyles as w } from './WorkPrimitives';
import { applicationLabel, workStatusLabel } from './WorkPostCard';
import { useApplyToWorkPost, useUpdateWorkApplication } from '@/src/hooks/useWorkMatching';
import { budgetLabel, publicMediaUrl, rupees } from '@/src/lib/work-presentation';
import { theme } from '@/src/constants/theme';
import type { FreelancerServiceRecord, MobileRole, MobileWorkApplication, MobileWorkPost } from '@/src/types';

export function WorkPostDetails({ post, role, application, services, servicesLoading, servicesError, onRetryServices, initialTab, onClose, onFindEditors }: {
  post: MobileWorkPost; role?: MobileRole | null; application?: MobileWorkApplication; services: FreelancerServiceRecord[];
  servicesLoading?: boolean; servicesError?: unknown; onRetryServices?: () => void;
  initialTab: 'brief' | 'applications'; onClose: () => void; onFindEditors: () => void;
}) {
  const freelancer = role === 'FREELANCER';
  const [tab, setTab] = useState(initialTab);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [editorId, setEditorId] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [proposal, setProposal] = useState('');
  const [delivery, setDelivery] = useState('');
  const [payout, setPayout] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [actionError, setActionError] = useState<unknown>(null);
  const apply = useApplyToWorkPost();
  const update = useUpdateWorkApplication();
  const [submitted, setSubmitted] = useState<MobileWorkApplication | undefined>();
  const ownApplication = application ?? submitted;
  const approvedServices = services.filter(service => String(service.status).toUpperCase() === 'APPROVED');
  const busy = apply.isPending || update.isPending;
  async function updateStatus(applicationId: string, status: 'SHORTLISTED' | 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN') {
    try { setActionError(null); await update.mutateAsync({ applicationId, status }); } catch (error) { setActionError(error); }
  }
  function confirmAccept(item: MobileWorkApplication) {
    Alert.alert('Assign this work?', `Accept ${item.editorName || item.editor?.name || 'this editor'} for ${post.title}? Assignment limits are checked before confirmation.`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Accept editor', onPress: () => void updateStatus(item.applicationId, 'ACCEPTED') }]);
  }
  async function submit() {
    try { setActionError(null); const result = await apply.mutateAsync({ workPostId: post.id, proposalMessage: proposal.trim(), expectedDelivery: delivery.trim(), expectedPayout: payout, serviceId, availability: delivery.trim() }); setSubmitted(result.application); setApplying(false); } catch (error) { setActionError(error); }
  }
  return <><Modal visible animationType="slide" onRequestClose={() => !busy && onClose()}><SafeAreaView style={s.safe}><KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <View style={s.header}><Pressable accessibilityLabel="Close work details" disabled={busy} onPress={onClose} style={s.icon}><Feather name="arrow-left" size={22} color={theme.colors.text} /></Pressable><Text style={w.body}>Work details</Text></View>
    <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled"><View style={w.between}><Text style={[w.meta, w.grow]}>{freelancer ? post.agencyName : post.category}</Text><StatusBadge label={freelancer ? applicationLabel(ownApplication?.status) : workStatusLabel(post)} /></View><Text style={w.title}>{post.title}</Text><Text style={w.heading}>{budgetLabel(post.budgetMin, post.budgetMax)}</Text><Text style={w.meta}>{post.deadline ? `Due ${new Date(post.deadline).toLocaleDateString('en-IN')}` : 'Flexible delivery'} · {post.editorsNeeded} editor{post.editorsNeeded === 1 ? '' : 's'}</Text>
      {!freelancer ? <View style={s.tabs}>{(['brief', 'applications'] as const).map(value => <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: tab === value }} style={[s.tab, tab === value && s.active]} onPress={() => setTab(value)}><Text style={tab === value ? w.link : w.body}>{value === 'brief' ? 'Brief' : `Applications · ${post.applications?.length ?? 0}`}</Text></Pressable>)}</View> : null}
      {tab === 'brief' || freelancer ? <><Text style={w.heading}>The brief</Text><Text selectable style={w.body}>{post.description}</Text><CompactTags items={[...post.skills, ...post.tags]} />{post.expectedOutput ? <View style={w.card}><Text style={w.heading}>Deliverables</Text><Text style={w.body}>{post.expectedOutput}</Text></View> : null}
        {post.attachmentLinks.length ? <View style={w.card}><Text style={w.heading}>References & footage</Text>{post.attachmentLinks.map((link, index) => publicMediaUrl(link) ? <Pressable key={`${link}-${index}`} style={w.linkTarget} onPress={() => void Linking.openURL(link).catch(setActionError)}><Text numberOfLines={2} style={w.link}>Reference {index + 1} ↗ · {new URL(link).hostname}</Text></Pressable> : null)}</View> : null}
        {post.assignedFreelancerId && !freelancer ? <View style={w.card}><Text style={w.meta}>Assigned editor</Text><Text style={w.heading}>{post.assignedFreelancerName || 'Editor assigned'}</Text><Pressable onPress={() => setEditorId(post.assignedFreelancerId!)} style={w.linkTarget}><Text style={w.link}>View profile ↗</Text></Pressable></View> : null}
      </> : <>
        {!post.applications?.length ? <QueryFeedback empty title="No applications yet" message="Invite an editor to discuss the brief and get started." /> : null}
        {post.applications?.map(item => <View style={w.card} key={item.applicationId}><View style={w.row}><StableAvatar size={38} label={item.editorName || item.editor?.name || 'Editor'} /><View style={w.grow}><Text style={w.heading}>{item.editorName || item.editor?.name || 'Editor'}</Text><Text style={w.meta}>{item.expectedDelivery || 'Delivery to discuss'}</Text></View><StatusBadge label={applicationLabel(item.status)} tone={item.status === 'SHORTLISTED' ? 'pending' : item.status === 'ACCEPTED' ? 'positive' : 'neutral'} /></View><Text style={w.body}>{rupees(item.expectedPayout)} quoted</Text><Text numberOfLines={reviewId === item.applicationId ? undefined : 2} style={w.body}>{item.proposalMessage}</Text><View style={w.between}><Pressable style={w.linkTarget} onPress={() => setEditorId(item.editorId)}><Text style={w.link}>View profile ↗</Text></Pressable><Pressable style={w.linkTarget} onPress={() => setReviewId(reviewId === item.applicationId ? null : item.applicationId)}><Text style={w.link}>{reviewId === item.applicationId ? 'Hide proposal' : 'Review proposal →'}</Text></Pressable></View>
          {reviewId === item.applicationId ? <><Text style={w.body}>Availability: {item.availability || 'Discuss with the editor'}</Text>{item.portfolioLinks.filter(link => publicMediaUrl(link)).map(link => <Pressable key={link} style={w.linkTarget} onPress={() => void Linking.openURL(link).catch(setActionError)}><Text style={w.link}>Open attached portfolio ↗</Text></Pressable>)}{['PENDING', 'SHORTLISTED'].includes(item.status) ? <><View style={s.actions}>{item.status !== 'SHORTLISTED' ? <View style={w.grow}><AppButton title="Shortlist" variant="secondary" disabled={busy} onPress={() => void updateStatus(item.applicationId, 'SHORTLISTED')} /></View> : null}<View style={w.grow}><AppButton title="Accept editor" disabled={busy} onPress={() => confirmAccept(item)} /></View></View><AppButton title="Reject application" variant="danger" disabled={busy} onPress={() => Alert.alert('Reject application?', 'The editor will see the updated status.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Reject', style: 'destructive', onPress: () => void updateStatus(item.applicationId, 'REJECTED') }])} /></> : null}</> : null}
        </View>)}
      </>}
      {freelancer && ownApplication ? <View style={w.card}><Text style={w.heading}>Your application</Text><StatusBadge label={applicationLabel(ownApplication.status)} /><Text style={w.body}>{ownApplication.proposalMessage}</Text><Text style={w.meta}>{rupees(ownApplication.expectedPayout)} · {ownApplication.expectedDelivery}</Text>{ownApplication.status === 'PENDING' ? <AppButton title="Withdraw application" variant="secondary" disabled={busy} onPress={() => Alert.alert('Withdraw application?', 'The agency will see that you withdrew.', [{ text: 'Keep application', style: 'cancel' }, { text: 'Withdraw', onPress: () => void updateStatus(ownApplication.applicationId, 'WITHDRAWN') }])} /> : null}</View> : null}
      {freelancer && !ownApplication && applying ? <View style={w.card}><Text style={w.heading}>Make a strong first impression</Text><AppInput label="Your proposal" multiline value={proposal} onChangeText={setProposal} placeholder="Explain your approach, relevant experience, and the result you can deliver." /><AppInput label="Expected delivery" value={delivery} onChangeText={setDelivery} placeholder="For example, 2 days after receiving footage" /><AppInput label="Your quote (₹)" keyboardType="numeric" value={payout} onChangeText={setPayout} /><Text style={w.body}>Attach an approved service · Optional</Text><Text style={w.meta}>A relevant service strengthens your proposal, but you can apply without one.</Text><QueryFeedback loading={servicesLoading} error={servicesError} onRetry={onRetryServices} />{approvedServices.map(service => <Pressable key={service.id} accessibilityRole="checkbox" accessibilityState={{ checked: service.id === serviceId }} style={[s.service, service.id === serviceId && s.active]} onPress={() => setServiceId(current => current === service.id ? '' : service.id)}><Text style={w.body}>{service.id === serviceId ? '✓ ' : ''}{service.title}</Text></Pressable>)}{!servicesLoading && !servicesError && !approvedServices.length ? <Text style={w.meta}>No approved service yet. You can still send this proposal now.</Text> : null}<AppButton title="Send proposal" loading={apply.isPending} disabled={!proposal.trim() || !delivery.trim() || !Number.isFinite(Number(payout)) || Number(payout) <= 0} onPress={() => void submit()} /></View> : null}
      <QueryFeedback error={actionError} onRetry={() => setActionError(null)} />
    </ScrollView><View style={w.footer}>{freelancer ? !ownApplication && post.status === 'OPEN' ? <AppButton title={applying ? 'Cancel proposal' : 'Apply for this work'} variant={applying ? 'secondary' : 'primary'} onPress={() => setApplying(value => !value)} /> : <Text style={w.meta}>{ownApplication ? `Application status: ${applicationLabel(ownApplication.status)}` : 'This work is no longer accepting applications.'}</Text> : post.status === 'OPEN' ? <AppButton title="Find editors for this work" variant="secondary" onPress={onFindEditors} /> : <Text style={w.meta}>This work is {workStatusLabel(post).toLowerCase()}.</Text>}</View>
  </KeyboardAvoidingView></SafeAreaView></Modal><EditorProfileModal editorId={editorId} onClose={() => setEditorId(null)} /></>;
}
const s = StyleSheet.create({ safe: { flex: 1, backgroundColor: theme.colors.background }, flex: { flex: 1 }, header: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8 }, icon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, content: { padding: 16, gap: 16, paddingBottom: 28 }, tabs: { flexDirection: 'row', backgroundColor: theme.colors.surface, borderRadius: 12, padding: 4 }, tab: { flex: 1, minHeight: 44, justifyContent: 'center', alignItems: 'center', borderRadius: 9 }, active: { backgroundColor: theme.colors.accentSoft }, actions: { flexDirection: 'row', gap: 8 }, service: { padding: 12, minHeight: 44, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.border } });
