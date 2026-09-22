import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppButton } from '@/src/components/AppButton';
import { StableAvatar } from '@/src/components/StableAvatar';
import { CompactTags, StatusBadge, workStyles as w } from './WorkPrimitives';
import { budgetLabel } from '@/src/lib/work-presentation';
import type { MobileWorkApplication, MobileWorkPost } from '@/src/types';

export function applicationLabel(status?: string) {
  if (!status) return 'Not applied';
  if (status === 'PENDING' || status === 'APPLIED') return 'Applied';
  return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
}
export function workStatusLabel(post: MobileWorkPost) {
  const status = post.taskStatus?.toUpperCase();
  if (status === 'COMPLETED') return 'Completed';
  if (status === 'CANCELLED') return 'Cancelled';
  if (status === 'IN_PROGRESS') return 'In progress';
  return post.status === 'OPEN' ? 'Open' : post.status === 'FILLED' ? 'Assigned' : applicationLabel(post.status);
}
export function WorkPostCard({ post, freelancer, application, onOpen, onFindEditors }: {
  post: MobileWorkPost; freelancer: boolean; application?: MobileWorkApplication; onOpen: (tab: 'brief' | 'applications') => void; onFindEditors: () => void;
}) {
  const applications = post.applications ?? [];
  const shortlistCount = applications.filter(item => item.status === 'SHORTLISTED').length;
  const label = freelancer ? applicationLabel(application?.status) : workStatusLabel(post);
  const date = post.deadline ? new Date(post.deadline).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : 'Flexible';
  return <View style={w.card}>
    <View style={w.between}><Text numberOfLines={1} style={[w.meta, w.grow]}>{freelancer ? post.agencyName : post.category}</Text><StatusBadge label={label} tone={label === 'Accepted' || label === 'Open' ? 'positive' : label === 'Shortlisted' ? 'pending' : 'neutral'} /></View>
    <Pressable accessibilityRole="button" onPress={() => onOpen('brief')} style={{ gap: 5 }}><Text style={w.heading}>{post.title}</Text><Text numberOfLines={2} style={w.body}>{post.description}</Text></Pressable>
    <View style={w.between}><View style={w.grow}><Text style={[w.heading, { fontSize: 15 }]}>{budgetLabel(post.budgetMin, post.budgetMax)}</Text><Text style={w.meta}>Project budget</Text></View><View><Text style={w.body}>{date}</Text><Text style={w.meta}>Delivery</Text></View><View><Text style={w.body}>{post.editorsNeeded} editor{post.editorsNeeded === 1 ? '' : 's'}</Text><Text style={w.meta}>Needed</Text></View></View>
    <CompactTags items={[...post.skills, ...post.tags]} />
    <View style={[w.row, w.divider]}>{freelancer ? <Text style={w.meta}>{application ? application.status === 'ACCEPTED' ? 'You’ve been selected for this work.' : application.status === 'WITHDRAWN' ? 'You withdrew this application.' : application.status === 'REJECTED' ? 'The agency chose a different direction.' : 'Proposal sent · Follow its progress here.' : 'Review the brief before sending your proposal.'}</Text> : post.assignedFreelancerId ? <><StableAvatar size={30} label={post.assignedFreelancerName || 'Editor'} /><View style={w.grow}><Text style={w.body}>{post.assignedFreelancerName || 'Editor assigned'}</Text><Text style={w.meta}>Assigned to this work</Text></View></> : applications.length ? <><View style={s.avatars}>{applications.slice(0, 3).map(item => <View key={item.applicationId} style={{ marginRight: -6 }}><StableAvatar size={26} label={item.editorName || item.editor?.name || 'Editor'} /></View>)}</View><View style={w.grow}><Text numberOfLines={1} style={w.body}>{applications.slice(0, 2).map(item => item.editorName || item.editor?.name || 'Editor').join(', ')}{applications.length > 2 ? ` +${applications.length - 2}` : ''}</Text><Text style={w.meta}>{applications.length} applicant{applications.length === 1 ? '' : 's'}{shortlistCount ? ` · ${shortlistCount} shortlisted` : ''}</Text></View></> : <Text style={w.meta}>No applications yet. Invite an editor to get started.</Text>}</View>
    <View style={s.actions}><View style={w.grow}><AppButton title={freelancer ? application ? 'View application' : post.status === 'OPEN' ? 'View brief & apply' : 'Open work' : post.assignedFreelancerId ? 'Open work' : applications.length ? `View applications · ${applications.length}` : 'Open work'} onPress={() => onOpen(freelancer || post.assignedFreelancerId ? 'brief' : applications.length ? 'applications' : 'brief')} /></View>{!freelancer && post.status === 'OPEN' ? <View style={w.grow}><AppButton title="Find editors" variant="secondary" onPress={onFindEditors} /></View> : null}</View>
  </View>;
}
const s = StyleSheet.create({ avatars: { flexDirection: 'row', paddingRight: 7 }, actions: { flexDirection: 'row', gap: 8, alignItems: 'stretch' } });
