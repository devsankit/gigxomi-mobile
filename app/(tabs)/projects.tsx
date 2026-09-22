import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppButton } from '@/src/components/AppButton';
import { AppCard } from '@/src/components/AppCard';
import { AppChip } from '@/src/components/AppChip';
import { AppInput } from '@/src/components/AppInput';
import { BrandedRefreshControl } from '@/src/components/BrandedRefreshControl';
import { GigxomiHeader } from '@/src/components/GigxomiHeader';
import { Screen } from '@/src/components/Screen';
import { QueryFeedback, workStyles as w } from '@/src/components/work/WorkPrimitives';
import { WorkPostCard } from '@/src/components/work/WorkPostCard';
import { WorkPostDetails } from '@/src/components/work/WorkPostDetails';
import { theme } from '@/src/constants/theme';
import { useAssignments } from '@/src/hooks/useAssignments';
import { useAuth } from '@/src/hooks/useAuth';
import { useRespondConversationAssignment } from '@/src/hooks/useChats';
import { useRefreshOnFocus } from '@/src/hooks/useRefreshOnFocus';
import { useServices } from '@/src/hooks/useServices';
import { useCreateWorkPost, useUpdateWorkInvite, useWorkMatching } from '@/src/hooks/useWorkMatching';
import type { MobileAssignmentRecord, MobileCreateWorkPostInput, MobileRole, MobileWorkInvite, MobileWorkMatchingResponse } from '@/src/types';

type WorkFilter = 'matching' | 'assigned' | 'active' | 'review' | 'completed';

const ASSIGNED_STATUSES = new Set(['ASSIGNED', 'OFFERED']);
const ACTIVE_STATUSES = new Set(['ACCEPTED', 'IN_PROGRESS']);
const REVIEW_STATUSES = new Set(['SUBMITTED', 'UNDER_REVIEW', 'REVISION_REQUESTED']);
const COMPLETED_STATUSES = new Set(['COMPLETED', 'PAYMENT_REQUESTED', 'PAID', 'CANCELLED']);
const WORK_TYPES = ['ONE_TIME', 'RECURRING', 'MONTHLY', 'URGENT'] as const;
const EXPERIENCE_LEVELS = ['BEGINNER', 'INTERMEDIATE', 'EXPERT'] as const;
const VISIBILITIES = ['PUBLIC_MATCHED', 'PRIVATE_INVITE', 'AGENCY_TEAM'] as const;

const defaultCreateForm: MobileCreateWorkPostInput = {
  attachmentLinks: '',
  budgetMax: '',
  budgetMin: '',
  category: 'Video Editing',
  deadline: '',
  description: '',
  editorsNeeded: '1',
  experienceLevel: 'INTERMEDIATE',
  expectedOutput: '',
  niche: '',
  sampleLink: '',
  skills: '',
  tags: '',
  title: '',
  visibility: 'PUBLIC_MATCHED',
  workType: 'ONE_TIME',
};

function formatCurrency(amount: number) {
  return `₹${Math.round(amount || 0).toLocaleString('en-IN')}`;
}

function formatDate(value?: string | null) {
  if (!value) {
    return 'Flexible';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Flexible';
  }

  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function labelize(value: string) {
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function assignmentMatchesFilter(assignment: MobileAssignmentRecord, filter: WorkFilter) {
  const status = assignment.status.toUpperCase();

  if (filter === 'assigned') {
    return ASSIGNED_STATUSES.has(status);
  }

  if (filter === 'active') {
    return ACTIVE_STATUSES.has(status);
  }

  if (filter === 'review') {
    return REVIEW_STATUSES.has(status);
  }

  if (filter === 'completed') {
    return COMPLETED_STATUSES.has(status);
  }

  return false;
}

function getNextAction(assignment: MobileAssignmentRecord, role?: MobileRole | null) {
  const status = assignment.status.toUpperCase();

  if (role === 'FREELANCER' && (status === 'ASSIGNED' || status === 'OFFERED')) {
    return 'Respond';
  }

  if (role === 'FREELANCER' && (status === 'ACCEPTED' || status === 'IN_PROGRESS' || status === 'REVISION_REQUESTED')) {
    return 'Submit';
  }

  if ((role === 'ADMIN' || role === 'MANAGER' || role === 'SUPER_ADMIN') && (status === 'SUBMITTED' || status === 'UNDER_REVIEW')) {
    return 'Review';
  }

  if (role === 'FREELANCER' && status === 'COMPLETED') {
    return 'Payment';
  }

  return 'Open';
}

function isAgencyPayload(payload: MobileWorkMatchingResponse | undefined): payload is Extract<MobileWorkMatchingResponse, { mode: 'agency' }> {
  return payload?.mode === 'agency';
}

function isEditorPayload(payload: MobileWorkMatchingResponse | undefined): payload is Extract<MobileWorkMatchingResponse, { mode: 'editor' }> {
  return payload?.mode === 'editor';
}

function roleCanCreateWork(role?: MobileRole | null) {
  return role === 'ADMIN' || role === 'SUPER_ADMIN' || role === 'MANAGER';
}

function OptionChips<T extends string>({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: T) => void;
  options: readonly T[];
  value: T;
}) {
  return (
    <View style={styles.optionBlock}>
      <Text style={styles.formLabel}>{label}</Text>
      <View style={styles.optionRow}>
        {options.map((option) => (
          <AppChip key={option} active={value === option} label={labelize(option)} onPress={() => onChange(option)} />
        ))}
      </View>
    </View>
  );
}

function AssignmentRow({
  assignment,
  role,
  onPress,
  onAccept,
  onPass,
  responding,
}: {
  assignment: MobileAssignmentRecord;
  role?: MobileRole | null;
  onPress: () => void;
  onAccept?: () => void;
  onPass?: () => void;
  responding?: boolean;
}) {
  const status = assignment.status.toUpperCase();
  const isReview = REVIEW_STATUSES.has(status);
  const isCompleted = COMPLETED_STATUSES.has(status);
  const counterpart = role === 'FREELANCER' ? assignment.agencyName : assignment.freelancerName;
  const initials = counterpart
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');

  return (
    <View style={styles.assignmentOfferCard}>
    <Pressable style={({ pressed }) => [styles.assignmentRow, pressed && styles.rowPressed]} onPress={onPress}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{initials || 'GX'}</Text>
      </View>

      <View style={styles.assignmentBody}>
        <View style={styles.rowTitleLine}>
          <Text numberOfLines={1} style={styles.assignmentTitle}>
            {assignment.title}
          </Text>
          <Text style={[styles.statusText, isReview && styles.statusReview, isCompleted && styles.statusCompleted]}>
            {formatStatus(status)}
          </Text>
        </View>

        <Text numberOfLines={1} style={styles.counterpart}>
          {counterpart} - {assignment.category}
        </Text>

        <Text numberOfLines={1} style={styles.preview}>
          {assignment.brief || assignment.notes || 'Open work to review the brief.'}
        </Text>

        <View style={styles.metaLine}>
          <Text style={styles.metaText}>{formatCurrency(assignment.budgetAmount)}</Text>
          <Text style={styles.metaText}>/</Text>
          <Text style={styles.metaText}>{formatDate(assignment.deadline)}</Text>
          <Text style={styles.metaText}>/</Text>
          <Text style={styles.metaText}>{assignment.priority || 'Normal'}</Text>
        </View>
      </View>

      <View style={styles.nextPill}>
        <Text style={styles.nextText}>{getNextAction(assignment, role)}</Text>
      </View>
    </Pressable>
    {status === 'OFFERED' && onAccept && onPass ? (
      <View style={styles.offerActions}>
        <AppButton loading={responding} title="Accept offer" onPress={onAccept} />
        <AppButton disabled={responding} title="Pass" variant="secondary" onPress={onPass} />
        <AppButton disabled={responding} title="Open chat" variant="secondary" onPress={onPress} />
      </View>
    ) : null}
    </View>
  );
}

function formatStatus(status: string) {
  return status
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function CreateWorkPanel({
  form,
  loading,
  error,
  onCancel,
  onChange,
  onSubmit,
}: {
  form: MobileCreateWorkPostInput;
  loading: boolean;
  error?: unknown;
  onCancel: () => void;
  onChange: <K extends keyof MobileCreateWorkPostInput>(key: K, value: MobileCreateWorkPostInput[K]) => void;
  onSubmit: () => void;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const canSubmit = Boolean(form.title.trim());

  return (
    <AppCard style={styles.formCard}>
      <View style={styles.workCardHeader}>
        <View>
          <Text style={styles.eyebrow}>Post work for editors</Text>
          <Text style={styles.formTitle}>Create Work</Text>
        </View>
        <Pressable accessibilityRole="button" style={styles.closeButton} onPress={onCancel}>
          <Feather name="x" size={19} color={theme.colors.text} />
        </Pressable>
      </View>

      {/* 1. Essential Core Details (Compact & Clean) */}
      <AppInput
        label="Work title"
        placeholder="e.g. YouTube Video Editor Needed"
        value={form.title}
        onChangeText={(value) => onChange('title', value)}
      />

      <View style={styles.formGrid}>
        <AppInput
          label="Category"
          placeholder="Video Editing"
          value={form.category}
          onChangeText={(value) => onChange('category', value)}
        />
        <AppInput
          label="Expected output"
          placeholder="e.g. 1 video + revisions"
          value={form.expectedOutput}
          onChangeText={(value) => onChange('expectedOutput', value)}
        />
      </View>

      <View style={styles.formGrid}>
        <AppInput
          label="Budget min (₹)"
          placeholder="3000"
          keyboardType="number-pad"
          value={form.budgetMin}
          onChangeText={(value) => onChange('budgetMin', value)}
        />
        <AppInput
          label="Budget max (₹)"
          placeholder="5000"
          keyboardType="number-pad"
          value={form.budgetMax}
          onChangeText={(value) => onChange('budgetMax', value)}
        />
      </View>

      <AppInput
        label="Brief / description"
        multiline
        inputStyle={styles.textAreaSmall}
        placeholder="Describe editing requirements, raw footage, style..."
        value={form.description}
        onChangeText={(value) => onChange('description', value)}
      />

      <OptionChips label="Work type" options={WORK_TYPES} value={form.workType} onChange={(value) => onChange('workType', value)} />

      {/* 2. Collapsible Additional Details (Keeps UI short & effortless) */}
      <Pressable
        accessibilityRole="button"
        onPress={() => setShowDetails(v => !v)}
        style={styles.detailsToggle}
      >
        <Feather name={showDetails ? 'chevron-up' : 'chevron-down'} size={15} color={theme.colors.accent} />
        <Text style={styles.detailsToggleText}>
          {showDetails ? 'Hide additional options' : '+ Add skills, links & deadline (optional)'}
        </Text>
      </Pressable>

      {showDetails ? (
        <View style={{ gap: 12 }}>
          <AppInput
            label="Required skills"
            placeholder="e.g. Premiere Pro, Color Grading, Subtitles"
            value={form.skills}
            onChangeText={(value) => onChange('skills', value)}
          />
          <View style={styles.formGrid}>
            <AppInput
              label="Niche / industry"
              placeholder="e.g. YouTube, Podcast, Real Estate"
              value={form.niche}
              onChangeText={(value) => onChange('niche', value)}
            />
            <AppInput
              label="SEO / matching tags"
              placeholder="e.g. reels, shorts, podcast"
              value={form.tags}
              onChangeText={(value) => onChange('tags', value)}
            />
          </View>
          <View style={styles.formGrid}>
            <AppInput
              label="Deadline"
              placeholder="YYYY-MM-DD"
              value={form.deadline}
              onChangeText={(value) => onChange('deadline', value)}
            />
            <AppInput
              label="Editors needed"
              placeholder="1"
              keyboardType="number-pad"
              value={form.editorsNeeded}
              onChangeText={(value) => onChange('editorsNeeded', value)}
            />
          </View>
          <AppInput
            label="Sample/reference link"
            placeholder="e.g. https://youtube.com/..."
            value={form.sampleLink}
            onChangeText={(value) => onChange('sampleLink', value)}
          />
          <AppInput
            label="Attachment links"
            placeholder="Drive/Dropbox links, comma separated"
            value={form.attachmentLinks}
            onChangeText={(value) => onChange('attachmentLinks', value)}
          />

          <OptionChips label="Experience" options={EXPERIENCE_LEVELS} value={form.experienceLevel} onChange={(value) => onChange('experienceLevel', value)} />
          <OptionChips label="Visibility" options={VISIBILITIES} value={form.visibility} onChange={(value) => onChange('visibility', value)} />
        </View>
      ) : null}

      {error ? <QueryFeedback error={error} onRetry={onSubmit} /> : null}

      <AppButton
        disabled={!canSubmit}
        loading={loading}
        title="Publish work"
        icon={<Feather name="send" size={15} color={theme.colors.background} />}
        onPress={onSubmit}
      />
    </AppCard>
  );
}

function InviteCard({
  busyInviteId,
  invite,
  onUpdate,
}: {
  busyInviteId?: string;
  invite: MobileWorkInvite;
  onUpdate: (inviteId: string, status: 'ACCEPTED' | 'REJECTED') => void;
}) {
  return (
    <AppCard style={styles.inviteCard}>
      <View style={styles.workCardHeader}>
        <View style={styles.workHeading}>
          <Text style={styles.eyebrow}>Agency invite</Text>
          <Text style={styles.workTitle}>{invite.message}</Text>
        </View>
        <View style={styles.statusPill}>
          <Text style={styles.statusPillText}>{labelize(invite.status)}</Text>
        </View>
      </View>
      {invite.status === 'INVITED' ? (
        <View style={styles.actionRow}>
          <AppButton loading={busyInviteId === `${invite.inviteId}:ACCEPTED`} title="Accept" onPress={() => onUpdate(invite.inviteId, 'ACCEPTED')} />
          <AppButton
            loading={busyInviteId === `${invite.inviteId}:REJECTED`}
            title="Reject"
            variant="danger"
            onPress={() => onUpdate(invite.inviteId, 'REJECTED')}
          />
        </View>
      ) : null}
    </AppCard>
  );
}

export default function ProjectsTab() {
  const router = useRouter();
  const auth = useAuth();
  const role = auth.session?.role;
  const freelancer = role === 'FREELANCER';
  const assignmentsQuery = useAssignments();
  const workQuery = useWorkMatching(role);
  const servicesQuery = useServices(freelancer);
  const createWork = useCreateWorkPost();
  const updateInvite = useUpdateWorkInvite();
  const respond = useRespondConversationAssignment('freelancer');
  const [filter, setFilter] = useState<WorkFilter>('matching');
  const [openPost, setOpenPost] = useState<{ id: string; tab: 'brief' | 'applications' } | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(defaultCreateForm);
  const [actionError, setActionError] = useState<unknown>(null);
  useRefreshOnFocus(workQuery.refetch);
  useRefreshOnFocus(assignmentsQuery.refetch);
  const payload = workQuery.data;
  const allPosts = isAgencyPayload(payload) ? payload.workPosts : isEditorPayload(payload) ? payload.matchedWork : [];
  const posts = allPosts.filter(post => {
    if (post.status === 'FILLED' || post.status === 'CLOSED') return false;
    const acceptedCount = post.applications?.filter(item => item.status === 'ACCEPTED').length ?? 0;
    if (acceptedCount >= (post.editorsNeeded || 1)) return false;
    return true;
  });
  const assignments = assignmentsQuery.data?.assignments ?? [];
  const applications = isEditorPayload(payload) ? payload.applications : [];
  const applicationByPost = new Map(applications.map(item => [item.workPostId, item]));
  const selectedPost = allPosts.find(post => post.id === openPost?.id);
  const filtered = assignments.filter(item => assignmentMatchesFilter(item, filter));
  const filterOptions: Array<{ key: WorkFilter; label: string; count: number }> = [
    { key: 'matching', label: freelancer ? 'Discover' : 'Posts', count: posts.length },
    { key: 'assigned', label: freelancer ? 'Offers / assigned' : 'Assigned', count: assignments.filter(item => assignmentMatchesFilter(item, 'assigned')).length },
    { key: 'active', label: 'Active', count: assignments.filter(item => assignmentMatchesFilter(item, 'active')).length },
    { key: 'review', label: 'Review', count: assignments.filter(item => assignmentMatchesFilter(item, 'review')).length },
    { key: 'completed', label: 'Done', count: assignments.filter(item => assignmentMatchesFilter(item, 'completed')).length },
  ];
  function findEditors(id: string) { setOpenPost(null); router.push({ pathname: '/team', params: { workPostId: id } }); }
  async function publish() { try { setActionError(null); await createWork.mutateAsync(createForm); setCreateForm(defaultCreateForm); setCreateOpen(false); } catch (error) { setActionError(error); } }
  async function respondToOffer(conversationId: string, action: 'ACCEPT' | 'PASS') { try { setActionError(null); await respond.mutateAsync({ conversationId, action }); void assignmentsQuery.refetch(); } catch (error) { setActionError(error); } }
  const activeQuery = filter === 'matching' ? workQuery : assignmentsQuery;
  return <Screen scroll={false} contentStyle={{ paddingTop: 8, paddingBottom: 0 }}>
    <GigxomiHeader />
    <View style={[w.between, { marginBottom: 6 }]}><View style={w.grow}><Text style={w.eyebrow}>{freelancer ? 'YOUR NEXT OPPORTUNITY' : 'YOUR PRODUCTION DESK'}</Text><Text style={[w.title, { marginTop: 5 }]}>{freelancer ? 'Make your next move.' : 'Work, moving forward.'}</Text></View>{roleCanCreateWork(role) ? <Pressable accessibilityRole="button" accessibilityLabel="Create work" style={newStyles.create} onPress={() => { setFilter('matching'); setCreateOpen(value => !value); }}><Feather name={createOpen ? 'x' : 'plus'} size={16} color={theme.colors.background} /><Text style={newStyles.createText}>{createOpen ? 'Close' : 'Create'}</Text></Pressable> : null}</View>
    <Text style={w.body}>{freelancer ? 'Find work that fits. Keep every delivery on track.' : 'See what’s posted, who applied and what’s due.'}</Text>
    <View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={newStyles.tabs}>{filterOptions.map(item => <Pressable accessibilityRole="tab" accessibilityState={{ selected: filter === item.key }} key={item.key} style={[newStyles.tab, item.key === filter && newStyles.activeTab]} onPress={() => setFilter(item.key)}><Text style={filter === item.key ? w.link : w.meta}>{item.label} {item.count}</Text></Pressable>)}</ScrollView></View>
    {filter === 'matching' ? <FlatList data={posts} keyExtractor={post => post.id} contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled" ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
      ListHeaderComponent={<View style={{ gap: 12, marginBottom: 12 }}><QueryFeedback error={workQuery.error} onRetry={() => void workQuery.refetch()} />{createOpen ? <CreateWorkPanel form={createForm} loading={createWork.isPending} error={actionError} onCancel={() => { setActionError(null); setCreateOpen(false); }} onChange={(key, value) => { setActionError(null); setCreateForm(form => ({ ...form, [key]: value })); }} onSubmit={() => void publish()} /> : null}{isEditorPayload(payload) ? payload.invites.map(invite => <InviteCard key={invite.inviteId} invite={invite} busyInviteId={updateInvite.isPending ? updateInvite.variables?.inviteId + ':' + updateInvite.variables?.status : undefined} onUpdate={(inviteId, status) => updateInvite.mutate({ inviteId, status })} />) : null}</View>}
      renderItem={({ item }) => <WorkPostCard post={item} freelancer={freelancer} application={applicationByPost.get(item.id)} onOpen={tab => setOpenPost({ id: item.id, tab })} onFindEditors={() => findEditors(item.id)} />}
      refreshControl={<BrandedRefreshControl refreshing={workQuery.isRefetching} onRefresh={() => void workQuery.refetch()} />}
      ListEmptyComponent={!workQuery.error ? <QueryFeedback loading={workQuery.isLoading} empty title={freelancer ? 'No opportunities available yet' : 'Your next project starts here'} message={freelancer ? 'New work will appear here when agencies publish opportunities.' : 'Create a work post with a clear brief, budget and delivery date.'} /> : null} />
      : <FlatList data={filtered} keyExtractor={item => item.id} contentContainerStyle={styles.list} ItemSeparatorComponent={() => <View style={{ height: 12 }} />} ListHeaderComponent={<QueryFeedback error={assignmentsQuery.error || actionError} onRetry={() => { setActionError(null); void activeQuery.refetch(); }} />} renderItem={({ item }) => <AssignmentRow assignment={item} role={role} responding={respond.isPending && respond.variables?.conversationId === item.conversationId} onAccept={freelancer && item.source === 'CHAT' && item.conversationId ? () => void respondToOffer(item.conversationId!, 'ACCEPT') : undefined} onPass={freelancer && item.source === 'CHAT' && item.conversationId ? () => void respondToOffer(item.conversationId!, 'PASS') : undefined} onPress={() => item.source === 'CHAT' && item.conversationId ? router.push(`/chat/${encodeURIComponent(item.conversationId)}`) : router.push(`/assignment/${encodeURIComponent(item.id)}`)} />} refreshControl={<BrandedRefreshControl refreshing={assignmentsQuery.isRefetching} onRefresh={() => void assignmentsQuery.refetch()} />} ListEmptyComponent={!assignmentsQuery.error ? <QueryFeedback loading={assignmentsQuery.isLoading} empty title="No work in this stage" message="Assignments appear here as their status changes." /> : null} />}
    {openPost && selectedPost ? <WorkPostDetails key={selectedPost.id} post={selectedPost} role={role} application={applicationByPost.get(selectedPost.id)} services={servicesQuery.data?.services ?? []} servicesLoading={servicesQuery.isLoading} servicesError={servicesQuery.error} onRetryServices={() => void servicesQuery.refetch()} initialTab={openPost.tab} onClose={() => setOpenPost(null)} onFindEditors={() => findEditors(selectedPost.id)} /> : null}
  </Screen>;
}
const newStyles = StyleSheet.create({
  create: { minHeight: 44, borderRadius: 12, paddingHorizontal: 12, backgroundColor: theme.colors.accent, flexDirection: 'row', alignItems: 'center', gap: 4 },
  createText: { fontSize: 12, fontWeight: '700', color: theme.colors.background },
  tabs: { borderBottomWidth: 1, borderBottomColor: theme.colors.border, marginTop: 12, marginBottom: 8, gap: 14 },
  tab: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 4, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  activeTab: { borderBottomColor: theme.colors.accent },
});

const styles = StyleSheet.create({
  screen: {
    paddingBottom: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  titleBlock: {
    flex: 1,
  },
  eyebrow: {
    color: theme.colors.accent,
    fontSize: theme.typography.caption,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  title: {
    color: theme.colors.text,
    fontSize: 31,
    fontWeight: '900',
    marginTop: 2,
  },
  copy: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.small,
    lineHeight: 19,
    marginTop: 3,
  },
  countBadge: {
    minWidth: 62,
    alignItems: 'center',
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    backgroundColor: theme.colors.surfaceSoft,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
  },
  countValue: {
    color: theme.colors.text,
    fontSize: 22,
    fontWeight: '900',
  },
  countLabel: {
    color: theme.colors.mutedText,
    fontSize: theme.typography.caption,
    fontWeight: '800',
  },
  filters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  chipCount: {
    color: theme.colors.mutedText,
    fontSize: 11,
    fontWeight: '900',
  },
  chipCountActive: {
    color: theme.colors.accent,
  },
  error: {
    color: theme.colors.danger,
    fontSize: theme.typography.small,
    lineHeight: 19,
    marginBottom: theme.spacing.sm,
  },
  list: {
    paddingBottom: 148,
  },
  headerStack: {
    gap: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  metricStrip: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  metric: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.sm,
  },
  metricValue: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: '900',
  },
  metricLabel: {
    color: theme.colors.mutedText,
    fontSize: 11,
    fontWeight: '800',
    marginTop: 2,
  },
  gap: {
    height: theme.spacing.md,
  },
  divider: {
    height: 1,
    marginLeft: 68,
    backgroundColor: theme.colors.borderSubtle,
  },
  assignmentRow: {
    minHeight: 98,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xs,
  },
  assignmentOfferCard: {
    gap: theme.spacing.sm,
  },
  offerActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xs,
  },
  notAppliedBlock: {
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
  },
  rowPressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
  avatar: {
    width: 54,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 27,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    backgroundColor: theme.colors.surfaceRaised,
  },
  avatarText: {
    color: theme.colors.accent,
    fontSize: theme.typography.body,
    fontWeight: '900',
  },
  assignmentBody: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  rowTitleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  assignmentTitle: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  statusText: {
    color: theme.colors.mutedText,
    fontSize: 11,
    fontWeight: '900',
  },
  statusReview: {
    color: theme.colors.warning,
  },
  statusCompleted: {
    color: theme.colors.success,
  },
  counterpart: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.small,
    fontWeight: '800',
  },
  preview: {
    color: theme.colors.mutedText,
    fontSize: theme.typography.small,
  },
  metaLine: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  metaText: {
    color: theme.colors.mutedText,
    fontSize: theme.typography.caption,
    fontWeight: '700',
  },
  nextPill: {
    minWidth: 58,
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.accentBorder,
    backgroundColor: theme.colors.accentSoft,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
  },
  nextText: {
    color: theme.colors.text,
    fontSize: 11,
    fontWeight: '900',
  },
  workCard: {
    gap: theme.spacing.md,
  },
  inviteCard: {
    gap: theme.spacing.md,
  },
  workCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
  },
  workHeading: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  workTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.section,
    fontWeight: '900',
    lineHeight: 22,
  },
  workCopy: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.small,
    lineHeight: 20,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  smallTag: {
    overflow: 'hidden',
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.accentBorder,
    backgroundColor: theme.colors.accentSoft,
    color: theme.colors.accent,
    fontSize: 11,
    fontWeight: '900',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
  },
  statusPill: {
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surfaceSoft,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 5,
  },
  statusPillText: {
    color: theme.colors.textSecondary,
    fontSize: 11,
    fontWeight: '900',
  },
  scoreChip: {
    minWidth: 48,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.accentBorder,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.accentSoft,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 5,
  },
  scoreText: {
    color: theme.colors.accent,
    fontSize: 11,
    fontWeight: '900',
  },
  scoreChipLarge: {
    width: 66,
    height: 66,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.accentBorder,
    borderRadius: 33,
    backgroundColor: theme.colors.accentSoft,
  },
  scoreLarge: {
    color: theme.colors.accent,
    fontSize: 17,
    fontWeight: '900',
  },
  scoreLabel: {
    color: theme.colors.textSecondary,
    fontSize: 10,
    fontWeight: '800',
  },
  sectionBlock: {
    gap: theme.spacing.sm,
  },
  sectionLabel: {
    color: theme.colors.text,
    fontSize: theme.typography.small,
    fontWeight: '900',
  },
  miniCard: {
    gap: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceSoft,
    padding: theme.spacing.sm,
  },
  miniHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  miniAvatar: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 19,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    backgroundColor: theme.colors.surfaceRaised,
  },
  miniBody: {
    flex: 1,
    minWidth: 0,
  },
  miniTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.small,
    fontWeight: '900',
  },
  miniCopy: {
    color: theme.colors.mutedText,
    fontSize: theme.typography.caption,
    fontWeight: '700',
    lineHeight: 17,
  },
  applicationCard: {
    gap: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceSoft,
    padding: theme.spacing.sm,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  formCard: {
    gap: theme.spacing.md,
  },
  formTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.section,
    fontWeight: '900',
    marginTop: 2,
  },
  formGrid: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  textArea: {
    minHeight: 102,
    paddingTop: theme.spacing.sm,
    textAlignVertical: 'top',
  },
  textAreaSmall: {
    minHeight: 76,
    paddingTop: theme.spacing.sm,
    textAlignVertical: 'top',
  },
  optionBlock: {
    gap: theme.spacing.xs,
  },
  formLabel: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.small,
    fontWeight: '700',
  },
  optionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  servicePicker: {
    gap: theme.spacing.xs,
  },
  serviceOption: {
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceSoft,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
  },
  serviceOptionActive: {
    borderColor: theme.colors.accentBorder,
    backgroundColor: theme.colors.accentSoft,
  },
  serviceOptionTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.small,
    fontWeight: '900',
  },
  serviceOptionTitleActive: {
    color: theme.colors.accent,
  },
  serviceOptionMeta: {
    color: theme.colors.mutedText,
    fontSize: theme.typography.caption,
    fontWeight: '700',
    marginTop: 2,
  },
  detailsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: theme.radius.sm,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    marginTop: 4,
    marginBottom: 4,
  },
  detailsToggleText: {
    color: theme.colors.accent,
    fontSize: theme.typography.small,
    fontWeight: '700',
  },
  closeButton: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    borderRadius: 19,
    backgroundColor: theme.colors.surfaceSoft,
  },
  inlineForm: {
    gap: theme.spacing.sm,
  },
  noticeCard: {
    gap: theme.spacing.xs,
  },
  noticeTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.body,
    fontWeight: '900',
  },
  noticeCopy: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.small,
    lineHeight: 20,
  },
  emptyMini: {
    color: theme.colors.mutedText,
    fontSize: theme.typography.small,
    lineHeight: 19,
  },
  emptyState: {
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.xxl,
  },
  emptyTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.body,
    fontWeight: '900',
  },
  emptyCopy: {
    color: theme.colors.mutedText,
    fontSize: theme.typography.small,
    lineHeight: 19,
    textAlign: 'center',
  },
});
