import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/src/components/AppButton';
import { BrandedRefreshControl } from '@/src/components/BrandedRefreshControl';
import { AppCard } from '@/src/components/AppCard';
import { GigxomiHeader } from '@/src/components/GigxomiHeader';
import { Screen } from '@/src/components/Screen';
import { StableAvatar } from '@/src/components/StableAvatar';
import { theme } from '@/src/constants/theme';
import { useAuth } from '@/src/hooks/useAuth';
import { useAccountingRequests, useFreelancerWallet } from '@/src/hooks/useMoney';
import { useRefreshOnFocus } from '@/src/hooks/useRefreshOnFocus';

type PaymentFilter = 'all' | 'pending' | 'paid';

function formatCurrency(value?: number | null) {
  return `₹${Math.round(value || 0).toLocaleString('en-IN')}`;
}

function formatDate(value?: string) {
  if (!value) return 'Pending';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Pending';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export default function MoneyTab() {
  const router = useRouter();
  const auth = useAuth();
  const role = auth.session?.role;
  const isFreelancer = role === 'FREELANCER';
  const audience = isFreelancer ? 'editor' : 'agency';
  const accountingQuery = useAccountingRequests(audience, Boolean(role));
  const walletQuery = useFreelancerWallet(isFreelancer);
  const summary = accountingQuery.data?.summary;
  const records = accountingQuery.data?.records ?? [];
  const [filter, setFilter] = useState<PaymentFilter>('all');

  useRefreshOnFocus(accountingQuery.refetch);
  useRefreshOnFocus(walletQuery.refetch);

  const filteredRecords = records.filter((r) => {
    const status = String(r.status || '').toLowerCase();
    if (filter === 'pending') {
      return status.includes('pending') || status.includes('requested') || status.includes('review');
    }
    if (filter === 'paid') {
      return status.includes('paid') || status.includes('credited') || status.includes('completed');
    }
    return true;
  });

  function openPaymentLink(link?: string | null) {
    if (!link) {
      Alert.alert('Payment Link', 'Please use manual UPI / bank transfer or configure PhonePe in settings.');
      return;
    }
    Linking.openURL(link).catch(() => {
      Alert.alert('Error', 'Unable to open payment link.');
    });
  }

  return (
    <Screen
      refreshControl={
        <BrandedRefreshControl
          tintColor={theme.colors.accent}
          refreshing={accountingQuery.isFetching}
          onRefresh={() => {
            void accountingQuery.refetch();
            if (isFreelancer) void walletQuery.refetch();
          }}
        />
      }
    >
      <GigxomiHeader />

      <View style={styles.header}>
        <Text style={styles.eyebrow}>{isFreelancer ? 'Freelancer Earnings' : role === 'SUPER_ADMIN' ? 'Platform Billing' : 'Agency Payouts & Money'}</Text>
        <Text style={styles.title}>Money & Payments</Text>
        <Text style={styles.copy}>
          {isFreelancer
            ? 'Track earnings, project milestones, and payout requests.'
            : 'Track which editors to pay, for which projects, and pending disbursements.'}
        </Text>
      </View>

      {accountingQuery.error ? <Text style={styles.error}>{accountingQuery.error.message}</Text> : null}

      {/* Metrics Summary Grid */}
      <View style={styles.metrics}>
        <AppCard style={styles.metric}>
          <Text style={styles.metricValue}>{summary?.pending ?? 0}</Text>
          <Text style={styles.metricLabel}>Pending Payouts</Text>
        </AppCard>
        <AppCard style={styles.metric}>
          <Text style={styles.metricValue}>{summary?.paid ?? 0}</Text>
          <Text style={styles.metricLabel}>Paid Disbursed</Text>
        </AppCard>
        <AppCard style={styles.metric}>
          <Text style={[styles.metricValue, { color: theme.colors.accent }]}>
            {formatCurrency(summary?.pendingAmount)}
          </Text>
          <Text style={styles.metricLabel}>Amount Due</Text>
        </AppCard>
        <AppCard style={styles.metric}>
          <Text style={styles.metricValue}>{formatCurrency(summary?.platformCommissionAmount)}</Text>
          <Text style={styles.metricLabel}>Commission</Text>
        </AppCard>
      </View>

      {/* Itemized Payout Breakdown */}
      <View style={styles.sectionHeaderRow}>
        <View>
          <Text style={styles.sectionTitle}>
            {isFreelancer ? 'Project Payments & Earnings' : 'Editor Payout Ledger'}
          </Text>
          <Text style={styles.metaSubtitle}>
            {isFreelancer
              ? 'Itemized view of approved assignments and received payouts'
              : 'Detailed breakdown of editors, projects, amounts, and statuses'}
          </Text>
        </View>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterTabs}>
        <Pressable
          style={[styles.filterTab, filter === 'all' && styles.filterTabActive]}
          onPress={() => setFilter('all')}
        >
          <Text style={[styles.filterTabText, filter === 'all' && styles.filterTabTextActive]}>
            All ({records.length})
          </Text>
        </Pressable>
        <Pressable
          style={[styles.filterTab, filter === 'pending' && styles.filterTabActive]}
          onPress={() => setFilter('pending')}
        >
          <Text style={[styles.filterTabText, filter === 'pending' && styles.filterTabTextActive]}>
            Pending ({summary?.pending ?? 0})
          </Text>
        </Pressable>
        <Pressable
          style={[styles.filterTab, filter === 'paid' && styles.filterTabActive]}
          onPress={() => setFilter('paid')}
        >
          <Text style={[styles.filterTabText, filter === 'paid' && styles.filterTabTextActive]}>
            Paid ({summary?.paid ?? 0})
          </Text>
        </Pressable>
      </View>

      {/* Itemized Cards List */}
      <View style={styles.ledgerList}>
        {filteredRecords.length === 0 ? (
          <AppCard style={styles.emptyLedger}>
            <Feather name="credit-card" size={32} color={theme.colors.mutedText} />
            <Text style={styles.emptyLedgerTitle}>No records in this tab</Text>
            <Text style={styles.emptyLedgerText}>
              {filter === 'pending'
                ? 'All pending editor payouts have been settled!'
                : 'Payment history will appear here once projects begin.'}
            </Text>
          </AppCard>
        ) : (
          filteredRecords.map((record) => {
            const statusStr = String(record.status || 'Pending').toLowerCase();
            const isPaid = statusStr.includes('paid') || statusStr.includes('credited') || statusStr.includes('completed');
            const isPending = statusStr.includes('pending') || statusStr.includes('requested');

            return (
              <AppCard key={record.id} style={styles.recordCard}>
                <View style={styles.recordTopRow}>
                  <View style={styles.editorIdentity}>
                    <StableAvatar size={38} label={record.customerName || (isFreelancer ? 'Agency' : 'Editor')} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.recipientName}>
                        {record.customerName || (isFreelancer ? 'Agency Client' : 'Assigned Editor')}
                      </Text>
                      <Text style={styles.roleSubtext}>
                        {isFreelancer ? 'Client Workspace' : 'Video Editor'}
                      </Text>
                    </View>
                  </View>
                  <View
                    style={[
                      styles.statusPill,
                      isPaid ? styles.statusPillPaid : isPending ? styles.statusPillPending : styles.statusPillOther,
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusText,
                        isPaid ? styles.statusTextPaid : isPending ? styles.statusTextPending : styles.statusTextOther,
                      ]}
                    >
                      {record.status}
                    </Text>
                  </View>
                </View>

                {/* Project Details Block */}
                <View style={styles.projectInfoBox}>
                  <View style={styles.projectInfoRow}>
                    <Feather name="folder" size={14} color={theme.colors.accent} />
                    <Text style={styles.projectLabel}>Project:</Text>
                    <Text numberOfLines={1} style={styles.projectTitleText}>
                      {record.projectTitle || record.title || 'Video Editing Deliverable'}
                    </Text>
                  </View>
                  <View style={styles.projectInfoRow}>
                    <Feather name="calendar" size={14} color={theme.colors.mutedText} />
                    <Text style={styles.dateLabel}>Date: {formatDate(record.createdAt)}</Text>
                  </View>
                </View>

                {/* Amount & Actions */}
                <View style={styles.payoutActionRow}>
                  <View>
                    <Text style={styles.amountLabel}>{isFreelancer ? 'Payout Amount' : 'Amount to Pay'}</Text>
                    <Text style={styles.amountValue}>{formatCurrency(record.amount)}</Text>
                  </View>

                  {!isFreelancer && isPending ? (
                    <AppButton
                      title="Pay Editor →"
                      variant="primary"
                      onPress={() => openPaymentLink(record.paymentLink)}
                    />
                  ) : isPaid ? (
                    <View style={styles.completedBadge}>
                      <Feather name="check" size={14} color={theme.colors.success} />
                      <Text style={styles.completedText}>Settled</Text>
                    </View>
                  ) : null}
                </View>
              </AppCard>
            );
          })
        )}
      </View>

      {/* PhonePe / UPI Settings Card */}
      <AppCard style={styles.noteCard}>
        <View style={styles.sectionTop}>
          <Text style={styles.sectionTitle}>Payment & UPI Setup</Text>
          <Feather name="shield" size={18} color={theme.colors.accent} />
        </View>
        <Text style={styles.copy}>
          PhonePe gateway, automated payouts, and UPI handles are securely managed by the Gigxomi backend.
        </Text>
        <AppButton title="Manage Payment Settings" variant="secondary" onPress={() => router.push('/settings')} />
      </AppCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.md,
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
  },
  copy: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.small,
    lineHeight: 19,
    marginTop: 2,
  },
  error: {
    color: theme.colors.danger,
    fontSize: theme.typography.small,
    marginBottom: theme.spacing.sm,
  },
  metrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  metric: {
    width: '48%',
    minHeight: 82,
    justifyContent: 'center',
    gap: 4,
  },
  metricValue: {
    color: theme.colors.text,
    fontSize: 21,
    fontWeight: '900',
  },
  metricLabel: {
    color: theme.colors.mutedText,
    fontSize: theme.typography.caption,
    fontWeight: '800',
  },
  sectionHeaderRow: {
    marginTop: 8,
    marginBottom: 10,
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  metaSubtitle: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  filterTabs: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  filterTab: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  filterTabActive: {
    backgroundColor: theme.colors.accentSoft,
    borderColor: theme.colors.accentBorder,
  },
  filterTabText: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.mutedText,
  },
  filterTabTextActive: {
    color: theme.colors.accent,
    fontWeight: '800',
  },
  ledgerList: {
    gap: 12,
    marginBottom: 20,
  },
  emptyLedger: {
    alignItems: 'center',
    padding: 24,
    gap: 8,
  },
  emptyLedgerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: theme.colors.text,
    marginTop: 6,
  },
  emptyLedgerText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  recordCard: {
    gap: 12,
    padding: 14,
    borderColor: theme.colors.borderSubtle,
  },
  recordTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  editorIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  recipientName: {
    fontSize: 15,
    fontWeight: '800',
    color: theme.colors.text,
  },
  roleSubtext: {
    fontSize: 11,
    color: theme.colors.mutedText,
    marginTop: 1,
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  statusPillPending: {
    backgroundColor: 'rgba(234, 179, 8, 0.12)',
    borderColor: 'rgba(234, 179, 8, 0.4)',
  },
  statusPillPaid: {
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
    borderColor: 'rgba(34, 197, 94, 0.4)',
  },
  statusPillOther: {
    backgroundColor: theme.colors.surfaceRaised,
    borderColor: theme.colors.borderSubtle,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  statusTextPending: { color: '#EAB308' },
  statusTextPaid: { color: '#22C55E' },
  statusTextOther: { color: theme.colors.textSecondary },
  projectInfoBox: {
    backgroundColor: theme.colors.surfaceRaised,
    borderRadius: 10,
    padding: 10,
    gap: 6,
  },
  projectInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  projectLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: theme.colors.accent,
  },
  projectTitleText: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.text,
    flex: 1,
  },
  dateLabel: {
    fontSize: 11,
    color: theme.colors.mutedText,
  },
  payoutActionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 4,
  },
  amountLabel: {
    fontSize: 11,
    color: theme.colors.mutedText,
    fontWeight: '700',
  },
  amountValue: {
    fontSize: 19,
    fontWeight: '900',
    color: theme.colors.accent,
    marginTop: 2,
  },
  completedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  completedText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#22C55E',
  },
  sectionTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  noteCard: {
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.xl,
  },
});
