import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/src/components/AppButton';
import { BrandedRefreshControl } from '@/src/components/BrandedRefreshControl';
import { AppCard } from '@/src/components/AppCard';
import { AppChip } from '@/src/components/AppChip';
import { AppInput } from '@/src/components/AppInput';
import { Screen } from '@/src/components/Screen';
import { theme } from '@/src/constants/theme';
import {
  useAssignmentDetail,
  useRequestAssignmentPayment,
  useRespondToAssignment,
  useReviewDeliverySubmission,
  useSubmitAssignmentDelivery,
} from '@/src/hooks/useAssignments';
import { useAuth } from '@/src/hooks/useAuth';
import { useRefreshOnFocus } from '@/src/hooks/useRefreshOnFocus';
import type { MobileAssignmentRecord, MobileDeliverySubmission, MobileRevisionRequest, MobileRole } from '@/src/types';

const TIMELINE = [
  { key: 'ASSIGNED', label: 'Assigned' },
  { key: 'ACCEPTED', label: 'Accepted' },
  { key: 'SUBMITTED', label: 'Submitted' },
  { key: 'REVISION_REQUESTED', label: 'Revision' },
  { key: 'COMPLETED', label: 'Completed' },
] as const;

const STATUS_ORDER: Record<string, number> = {
  DRAFT: 0,
  ASSIGNED: 1,
  OFFERED: 1,
  ACCEPTED: 2,
  IN_PROGRESS: 2,
  SUBMITTED: 3,
  UNDER_REVIEW: 3,
  REVISION_REQUESTED: 4,
  COMPLETED: 5,
  PAYMENT_REQUESTED: 5,
  CANCELLED: 5,
};

function getParamValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatCurrency(amount?: number | null) {
  return `₹${Math.round(amount || 0).toLocaleString('en-IN')}`;
}

function formatDate(value?: string | null) {
  if (!value) {
    return 'Not set';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Not set';
  }

  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return 'Not yet';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Not yet';
  }

  return date.toLocaleString('en-IN', { day: 'numeric', hour: 'numeric', minute: '2-digit', month: 'short' });
}

function formatStatus(status?: string | null) {
  if (!status) return 'Submitted';
  return status
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function getChatAudience(role?: MobileRole | null) {
  if (role === 'FREELANCER') {
    return 'freelancer';
  }

  if (role === 'MANAGER') {
    return 'manager';
  }

  return 'admin';
}

function canSubmitDelivery(status?: string | null, role?: MobileRole | null) {
  return role === 'FREELANCER' && ['ACCEPTED', 'IN_PROGRESS', 'REVISION_REQUESTED'].includes((status || '').toUpperCase());
}

function canReviewDelivery(status?: string | null, role?: MobileRole | null, pendingSubmission?: MobileDeliverySubmission | null) {
  const isPrivileged = ['ADMIN', 'MANAGER', 'SUPER_ADMIN'].includes(role ?? '');
  if (!isPrivileged) return false;
  return Boolean(pendingSubmission) || ['SUBMITTED', 'UNDER_REVIEW'].includes((status || '').toUpperCase());
}

function canRequestPayment(status?: string | null, role?: MobileRole | null) {
  return role === 'FREELANCER' && (status || '').toUpperCase() === 'COMPLETED';
}

function getPendingSubmission(submissions: MobileDeliverySubmission[]) {
  return submissions.find((item) => ['SUBMITTED', 'RESUBMITTED'].includes((item.status || '').toUpperCase())) ?? submissions[0] ?? null;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text numberOfLines={1} style={styles.metricValue}>
        {value}
      </Text>
    </View>
  );
}

function Timeline({ assignment }: { assignment: MobileAssignmentRecord }) {
  const status = assignment.status.toUpperCase();
  const currentOrder = STATUS_ORDER[status] ?? 0;

  return (
    <AppCard style={styles.timelineCard}>
      <Text style={styles.sectionTitle}>Progress</Text>
      <View style={styles.timeline}>
        {TIMELINE.map((item) => {
          const order = STATUS_ORDER[item.key] ?? 0;
          const reached = currentOrder >= order;
          const current = status === item.key || (item.key === 'ACCEPTED' && status === 'IN_PROGRESS') || (item.key === 'SUBMITTED' && status === 'UNDER_REVIEW');

          return (
            <View key={item.key} style={styles.timelineItem}>
              <View style={[styles.timelineDot, reached && styles.timelineDotReached, current && styles.timelineDotCurrent]} />
              <Text style={[styles.timelineText, reached && styles.timelineTextReached]}>{item.label}</Text>
            </View>
          );
        })}
      </View>
    </AppCard>
  );
}

function DeliverySubmissionCard({ submission }: { submission: MobileDeliverySubmission }) {
  return (
    <AppCard style={styles.compactCard}>
      <View style={styles.cardTopLine}>
        <Text style={styles.cardTitle}>Delivery v{submission.version}</Text>
        <AppChip label={formatStatus(submission.status)} />
      </View>
      <Text style={styles.metaText}>Submitted {formatDateTime(submission.createdAt || submission.submittedAt)}</Text>
      {submission.notes ? <Text style={styles.bodyCopy}>{submission.notes}</Text> : null}
      {submission.deliveryLinks.map((link) => (
        <Pressable key={link} style={styles.linkRow} onPress={() => void Linking.openURL(link)}>
          <Feather name="external-link" size={15} color={theme.colors.accent} />
          <Text numberOfLines={1} style={styles.linkText}>
            {link}
          </Text>
        </Pressable>
      ))}
      {submission.reviewNote ? <Text style={styles.reviewNote}>Review: {submission.reviewNote}</Text> : null}
    </AppCard>
  );
}

function RevisionCard({ revision }: { revision: MobileRevisionRequest }) {
  return (
    <AppCard style={styles.compactCard}>
      <View style={styles.cardTopLine}>
        <Text style={styles.cardTitle}>Revision requested</Text>
        <AppChip label={formatStatus(revision.status)} />
      </View>
      <Text style={styles.bodyCopy}>{revision.reason}</Text>
      <Text style={styles.metaText}>Due {formatDate(revision.dueDate)}</Text>
      {revision.notes ? <Text style={styles.reviewNote}>{revision.notes}</Text> : null}
    </AppCard>
  );
}

export default function AssignmentDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const assignmentId = getParamValue(params.id);
  const auth = useAuth();
  const role = auth.session?.role;
  const assignmentQuery = useAssignmentDetail(assignmentId);
  const respondMutation = useRespondToAssignment();
  const submitDeliveryMutation = useSubmitAssignmentDelivery();
  const reviewMutation = useReviewDeliverySubmission();
  const paymentMutation = useRequestAssignmentPayment();

  const [responseNote, setResponseNote] = useState('');
  const [deliveryLinks, setDeliveryLinks] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [reviewNote, setReviewNote] = useState('');
  const [revisionReason, setRevisionReason] = useState('');
  const [paymentAmount, setPaymentAmount] = useState<string | null>(null);
  const [paymentMessage, setPaymentMessage] = useState('');

  useRefreshOnFocus(assignmentQuery.refetch, Boolean(assignmentId));

  const assignment = assignmentQuery.data?.assignment ?? null;
  const submissions = useMemo(() => assignmentQuery.data?.submissions ?? [], [assignmentQuery.data?.submissions]);
  const revisions = useMemo(() => assignmentQuery.data?.revisions ?? [], [assignmentQuery.data?.revisions]);
  const pendingSubmission = useMemo(() => getPendingSubmission(submissions), [submissions]);
  const paymentAmountValue = paymentAmount ?? (assignment ? String(assignment.budgetAmount) : '');

  function goBack() {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace('/projects');
  }

  async function handleRespond(action: 'ACCEPT' | 'DECLINE') {
    if (!assignmentId) return;
    await respondMutation.mutateAsync({ action, assignmentId, note: responseNote });
    setResponseNote('');
  }

  async function handleSubmitDelivery() {
    if (!assignmentId) return;
    await submitDeliveryMutation.mutateAsync({ assignmentId, deliveryLinks, notes: deliveryNotes });
    setDeliveryLinks('');
    setDeliveryNotes('');
  }

  async function handleReview(action: 'APPROVE' | 'REQUEST_REVISION') {
    if (!assignmentId || !pendingSubmission) return;
    await reviewMutation.mutateAsync({
      action,
      assignmentId,
      note: reviewNote,
      revisionReason: revisionReason || reviewNote,
      submissionId: pendingSubmission.id,
    });
    setReviewNote('');
    setRevisionReason('');
  }

  async function handleRequestPayment() {
    if (!assignmentId) return;
    const requestedAmount = Number(paymentAmountValue);
    await paymentMutation.mutateAsync({
      assignmentId,
      chatThreadId: assignment?.chatThreadId ?? null,
      message: paymentMessage,
      requestedAmount: Number.isFinite(requestedAmount) ? requestedAmount : undefined,
    });
    setPaymentMessage('');
  }

  const actionError =
    respondMutation.error?.message ??
    submitDeliveryMutation.error?.message ??
    reviewMutation.error?.message ??
    paymentMutation.error?.message ??
    null;

  if (!assignmentId) {
    return (
      <Screen>
        <Text style={styles.error}>Assignment id is missing.</Text>
        <AppButton title="Back to work" variant="secondary" onPress={() => router.replace('/projects')} />
      </Screen>
    );
  }

  return (
    <Screen
      refreshControl={
        <BrandedRefreshControl
          tintColor={theme.colors.accent}
          refreshing={assignmentQuery.isFetching}
          onRefresh={() => {
            void assignmentQuery.refetch();
          }}
        />
      }
      contentStyle={styles.screen}
    >
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={goBack}>
          <Feather name="arrow-left" size={22} color={theme.colors.text} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>Assignment</Text>
          <Text numberOfLines={2} style={styles.title}>
            {assignment?.title ?? 'Loading work'}
          </Text>
          <Text style={styles.subtitle}>{assignment ? formatStatus(assignment.status) : 'Syncing from Gigxomi'}</Text>
        </View>
      </View>

      {assignmentQuery.error ? <Text style={styles.error}>{assignmentQuery.error.message}</Text> : null}
      {actionError ? <Text style={styles.error}>{actionError}</Text> : null}

      {assignment ? (
        <>
          <View style={styles.metricsGrid}>
            <Metric label="Budget" value={formatCurrency(assignment.budgetAmount)} />
            <Metric label="Deadline" value={formatDate(assignment.deadline)} />
            <Metric label="Priority" value={assignment.priority || 'Normal'} />
          </View>

          <AppCard style={styles.summaryCard}>
            <View style={styles.cardTopLine}>
              <View style={styles.summaryTitleBlock}>
                <Text style={styles.sectionTitle}>{assignment.category}</Text>
                <Text style={styles.metaText}>
                  {role === 'FREELANCER' ? assignment.agencyName : assignment.freelancerName}
                </Text>
              </View>
              <AppChip label={formatStatus(assignment.status)} active />
            </View>
            <Text style={styles.bodyCopy}>{assignment.brief}</Text>
            {assignment.notes ? <Text style={styles.reviewNote}>{assignment.notes}</Text> : null}
            {assignment.chatThreadId ? (
              <AppButton
                title="Open chat"
                variant="secondary"
                icon={<Feather name="message-circle" size={16} color={theme.colors.text} />}
                onPress={() => router.push(`/chat/${encodeURIComponent(assignment.chatThreadId ?? '')}?audience=${getChatAudience(role)}`)}
              />
            ) : null}
          </AppCard>

          <Timeline assignment={assignment} />

          {role === 'FREELANCER' && ['ASSIGNED', 'OFFERED'].includes(assignment.status.toUpperCase()) ? (
            <AppCard style={styles.actionCard}>
              <Text style={styles.sectionTitle}>Respond to assignment</Text>
              <AppInput
                label="Optional note"
                multiline
                inputStyle={styles.textArea}
                placeholder="Add a note for the agency"
                value={responseNote}
                onChangeText={setResponseNote}
              />
              <View style={styles.actionRow}>
                <AppButton title="Decline" variant="secondary" loading={respondMutation.isPending} onPress={() => void handleRespond('DECLINE')} />
                <AppButton title="Accept" loading={respondMutation.isPending} onPress={() => void handleRespond('ACCEPT')} />
              </View>
            </AppCard>
          ) : null}

          {canSubmitDelivery(assignment.status, role) ? (
            <AppCard style={styles.actionCard}>
              <Text style={styles.sectionTitle}>Submit delivery</Text>
              <Text style={styles.metaText}>Paste Drive, YouTube, or review links. Use one link per line.</Text>
              <AppInput
                label="Delivery links"
                multiline
                inputStyle={styles.textArea}
                placeholder="https://drive.google.com/..."
                value={deliveryLinks}
                onChangeText={setDeliveryLinks}
              />
              <AppInput
                label="Notes"
                multiline
                inputStyle={styles.textAreaSmall}
                placeholder="What changed in this delivery?"
                value={deliveryNotes}
                onChangeText={setDeliveryNotes}
              />
              <AppButton
                title="Submit for review"
                loading={submitDeliveryMutation.isPending}
                icon={<Feather name="upload-cloud" size={16} color={theme.colors.background} />}
                onPress={() => void handleSubmitDelivery()}
              />
            </AppCard>
          ) : null}

          {canReviewDelivery(assignment.status, role, pendingSubmission) && pendingSubmission ? (
            <AppCard style={styles.actionCard}>
              <Text style={styles.sectionTitle}>Review delivery</Text>
              <Text style={styles.metaText}>Latest submission: v{pendingSubmission.version}</Text>
              <AppInput
                label="Review note"
                multiline
                inputStyle={styles.textAreaSmall}
                placeholder="Add feedback for the freelancer"
                value={reviewNote}
                onChangeText={setReviewNote}
              />
              <AppInput
                label="Revision reason"
                multiline
                inputStyle={styles.textAreaSmall}
                placeholder="Required only when requesting revision"
                value={revisionReason}
                onChangeText={setRevisionReason}
              />
              <View style={styles.actionRow}>
                <AppButton
                  title="Revision"
                  variant="secondary"
                  loading={reviewMutation.isPending}
                  onPress={() => void handleReview('REQUEST_REVISION')}
                />
                <AppButton title="Approve" loading={reviewMutation.isPending} onPress={() => void handleReview('APPROVE')} />
              </View>
            </AppCard>
          ) : null}

          {canRequestPayment(assignment.status, role) ? (
            <AppCard style={styles.actionCard}>
              <Text style={styles.sectionTitle}>Request payment</Text>
              <Text style={styles.metaText}>Payment request uses the same PhonePe/editor payout flow as the website.</Text>
              <AppInput label="Amount" keyboardType="number-pad" value={paymentAmountValue} onChangeText={setPaymentAmount} />
              <AppInput
                label="Message"
                multiline
                inputStyle={styles.textAreaSmall}
                placeholder="Optional payment note"
                value={paymentMessage}
                onChangeText={setPaymentMessage}
              />
              <AppButton
                title="Request payment"
                loading={paymentMutation.isPending}
                icon={<Feather name="credit-card" size={16} color={theme.colors.background} />}
                onPress={() => void handleRequestPayment()}
              />
            </AppCard>
          ) : null}

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Deliveries</Text>
            <Text style={styles.metaText}>{submissions.length} submitted</Text>
          </View>
          {submissions.length ? (
            submissions.map((submission) => <DeliverySubmissionCard key={submission.id} submission={submission} />)
          ) : (
            <AppCard style={styles.compactCard}>
              <Text style={styles.cardTitle}>No delivery submitted yet</Text>
              <Text style={styles.metaText}>Delivery submissions will appear here after the freelancer sends review links.</Text>
            </AppCard>
          )}

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Revisions</Text>
            <Text style={styles.metaText}>{revisions.length} requests</Text>
          </View>
          {revisions.length ? (
            revisions.map((revision) => <RevisionCard key={revision.id} revision={revision} />)
          ) : (
            <AppCard style={styles.compactCard}>
              <Text style={styles.cardTitle}>No revision requests</Text>
              <Text style={styles.metaText}>Revision history stays synced with the web app.</Text>
            </AppCard>
          )}
        </>
      ) : (
        <AppCard style={styles.compactCard}>
          <Text style={styles.cardTitle}>{assignmentQuery.isLoading ? 'Loading assignment...' : 'Assignment not found'}</Text>
          <Text style={styles.metaText}>Pull to refresh this work item from Gigxomi.</Text>
        </AppCard>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    gap: theme.spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.md,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    backgroundColor: theme.colors.surfaceSoft,
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  eyebrow: {
    color: theme.colors.accent,
    fontSize: theme.typography.caption,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  title: {
    color: theme.colors.text,
    fontSize: 26,
    fontWeight: '900',
    lineHeight: 31,
  },
  subtitle: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.small,
    fontWeight: '700',
  },
  error: {
    color: theme.colors.danger,
    fontSize: theme.typography.small,
    lineHeight: 19,
  },
  metricsGrid: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  metric: {
    flex: 1,
    minHeight: 72,
    justifyContent: 'center',
    gap: 4,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing.sm,
  },
  metricLabel: {
    color: theme.colors.mutedText,
    fontSize: theme.typography.caption,
    fontWeight: '800',
  },
  metricValue: {
    color: theme.colors.text,
    fontSize: theme.typography.small,
    fontWeight: '900',
  },
  summaryCard: {
    gap: theme.spacing.md,
  },
  summaryTitleBlock: {
    flex: 1,
    gap: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: theme.spacing.xs,
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.section,
    fontWeight: '900',
  },
  bodyCopy: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.small,
    lineHeight: 20,
  },
  metaText: {
    color: theme.colors.mutedText,
    fontSize: theme.typography.caption,
    fontWeight: '700',
  },
  reviewNote: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.small,
    lineHeight: 19,
  },
  timelineCard: {
    gap: theme.spacing.md,
  },
  timeline: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: theme.spacing.xs,
  },
  timelineItem: {
    flex: 1,
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  timelineDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceSoft,
  },
  timelineDotReached: {
    borderColor: theme.colors.accentBorder,
    backgroundColor: theme.colors.accentSoft,
  },
  timelineDotCurrent: {
    backgroundColor: theme.colors.accent,
  },
  timelineText: {
    color: theme.colors.mutedText,
    fontSize: 10,
    fontWeight: '800',
    textAlign: 'center',
  },
  timelineTextReached: {
    color: theme.colors.textSecondary,
  },
  actionCard: {
    gap: theme.spacing.md,
  },
  textArea: {
    minHeight: 96,
    paddingTop: theme.spacing.md,
    textAlignVertical: 'top',
  },
  textAreaSmall: {
    minHeight: 76,
    paddingTop: theme.spacing.md,
    textAlignVertical: 'top',
  },
  actionRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  compactCard: {
    gap: theme.spacing.sm,
  },
  cardTopLine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  cardTitle: {
    flex: 1,
    color: theme.colors.text,
    fontSize: theme.typography.body,
    fontWeight: '900',
  },
  linkRow: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.surfaceSoft,
    paddingHorizontal: theme.spacing.sm,
  },
  linkText: {
    flex: 1,
    color: theme.colors.textSecondary,
    fontSize: theme.typography.caption,
    fontWeight: '800',
  },
});
