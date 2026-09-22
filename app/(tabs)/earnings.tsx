import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import { QueryFeedback } from '@/src/components/work/WorkPrimitives';
import { StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/src/components/AppButton';
import { BrandedRefreshControl } from '@/src/components/BrandedRefreshControl';
import { AppCard } from '@/src/components/AppCard';
import { GigxomiHeader } from '@/src/components/GigxomiHeader';
import { AppInput } from '@/src/components/AppInput';
import { Screen } from '@/src/components/Screen';
import { theme } from '@/src/constants/theme';
import { useAuth } from '@/src/hooks/useAuth';
import { useCreatePayoutRequest, useFreelancerWallet, usePaymentDetails, usePayoutRequests } from '@/src/hooks/useMoney';
import { useRefreshOnFocus } from '@/src/hooks/useRefreshOnFocus';

function formatCurrency(value?: number | null) {
  return `₹${Math.round(value || 0).toLocaleString('en-IN')}`;
}

function formatDate(value?: unknown) {
  if (typeof value !== 'string') return 'Pending';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Pending';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function getString(record: Record<string, unknown>, key: string, fallback = '') {
  const value = record[key];
  return typeof value === 'string' ? value : fallback;
}

function getNumber(record: Record<string, unknown>, key: string) {
  const value = Number(record[key] ?? 0);
  return Number.isFinite(value) ? value : 0;
}

export default function EarningsTab() {
  const auth = useAuth();
  const enabled = auth.session?.role === 'FREELANCER' || auth.session?.role === 'SUPER_ADMIN';
  const walletQuery = useFreelancerWallet(enabled);
  const paymentDetailsQuery = usePaymentDetails(enabled);
  const payoutRequestsQuery = usePayoutRequests(enabled);
  const createPayout = useCreatePayoutRequest();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [formError, setFormError] = useState('');

  useRefreshOnFocus(walletQuery.refetch, enabled);
  useRefreshOnFocus(payoutRequestsQuery.refetch, enabled);
  useRefreshOnFocus(paymentDetailsQuery.refetch, enabled);

  async function handleRequestPayout() {
    setFormError('');
    const requestedAmount = Number(amount);
    if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) { setFormError('Enter a payout amount greater than zero.'); return; }
    if (!walletQuery.isSuccess || !paymentDetailsQuery.isSuccess) { setFormError('Refresh your wallet and payment details before requesting a payout.'); return; }
    if (!paymentDetailsQuery.data?.paymentDetails) { setFormError('Add your payment details before requesting a payout.'); return; }
    if (requestedAmount > (walletQuery.data?.wallet.availableForWithdrawal ?? 0)) { setFormError('This amount exceeds your available balance.'); return; }
    try {
      await createPayout.mutateAsync({ amount: requestedAmount, note });
      setAmount(''); setNote('');
    } catch { /* The mutation error is displayed below; preserve the form for retry. */ }
  }

  const wallet = walletQuery.data?.wallet;
  const ledger = walletQuery.data?.ledger ?? [];
  const payoutRequests = payoutRequestsQuery.data?.payoutRequests ?? [];
  const paymentDetails = paymentDetailsQuery.data?.paymentDetails ?? null;

  if (!enabled) {
    return (
      <Screen>
        <GigxomiHeader />

        <View style={styles.header}>
          <Text style={styles.eyebrow}>Money</Text>
          <Text style={styles.title}>Earnings</Text>
          <Text style={styles.copy}>This page is for freelancer wallet and payout flows.</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen
      refreshControl={
        <BrandedRefreshControl
          tintColor={theme.colors.accent}
          refreshing={walletQuery.isFetching || payoutRequestsQuery.isFetching}
          onRefresh={() => {
            void walletQuery.refetch();
            void payoutRequestsQuery.refetch();
            void paymentDetailsQuery.refetch();
          }}
        />
      }
    >
      <GigxomiHeader />

      <View style={styles.header}>
        <Text style={styles.eyebrow}>Freelancer</Text>
        <Text style={styles.title}>Earnings</Text>
        <Text style={styles.copy}>Wallet, payout details, and payout requests are synced with the web app.</Text>
      </View>

      <QueryFeedback loading={walletQuery.isPending} error={walletQuery.error || paymentDetailsQuery.error || payoutRequestsQuery.error} onRetry={() => { void walletQuery.refetch(); void paymentDetailsQuery.refetch(); void payoutRequestsQuery.refetch(); }} />
      {formError ? <Text accessibilityRole="alert" style={styles.error}>{formError}</Text> : null}
      {createPayout.error ? <Text style={styles.error}>{createPayout.error.message}</Text> : null}

      <View style={styles.metrics}>
        <AppCard style={styles.metric}>
          <Text style={styles.metricValue}>{wallet ? formatCurrency(wallet.availableForWithdrawal) : '—'}</Text>
          <Text style={styles.metricLabel}>Available</Text>
        </AppCard>
        <AppCard style={styles.metric}>
          <Text style={styles.metricValue}>{wallet ? formatCurrency(wallet.pendingClearance) : '—'}</Text>
          <Text style={styles.metricLabel}>Pending</Text>
        </AppCard>
        <AppCard style={styles.metric}>
          <Text style={styles.metricValue}>{wallet ? formatCurrency(wallet.grossEarned) : '—'}</Text>
          <Text style={styles.metricLabel}>Gross earned</Text>
        </AppCard>
        <AppCard style={styles.metric}>
          <Text style={styles.metricValue}>{wallet ? formatCurrency(wallet.commissionDeducted) : '—'}</Text>
          <Text style={styles.metricLabel}>Commission</Text>
        </AppCard>
      </View>

      <AppCard style={styles.actionCard}>
        <View style={styles.sectionTop}>
          <Text style={styles.sectionTitle}>Request payout</Text>
          <Feather name="send" size={18} color={theme.colors.accent} />
        </View>
        <Text style={styles.metaText}>
          {paymentDetails ? 'Payment details are saved.' : 'Add payment details on web before requesting payout.'}
        </Text>
        <AppInput label="Amount" keyboardType="number-pad" value={amount} onChangeText={setAmount} />
        <AppInput label="Note" multiline inputStyle={styles.textArea} value={note} onChangeText={setNote} />
        <AppButton title="Submit payout request" loading={createPayout.isPending} onPress={() => void handleRequestPayout()} />
      </AppCard>

      <AppCard style={styles.listCard}>
        <View style={styles.sectionTop}>
          <Text style={styles.sectionTitle}>Ledger</Text>
          <Text style={styles.metaText}>{ledger.length} entries</Text>
        </View>
        {ledger.slice(0, 6).map((entry) => (
          <View key={entry.id} style={styles.row}>
            <View style={styles.rowText}>
              <Text numberOfLines={1} style={styles.rowTitle}>
                {entry.title}
              </Text>
              <Text style={styles.metaText}>{entry.status} · {formatDate(entry.createdAt)}</Text>
            </View>
            <Text style={styles.amount}>{formatCurrency(entry.net)}</Text>
          </View>
        ))}
        {ledger.length ? null : <Text style={styles.metaText}>Wallet credits appear after approved delivery payments.</Text>}
      </AppCard>

      <AppCard style={styles.listCard}>
        <View style={styles.sectionTop}>
          <Text style={styles.sectionTitle}>Payout requests</Text>
          <Text style={styles.metaText}>{payoutRequests.length} total</Text>
        </View>
        {payoutRequests.slice(0, 6).map((request) => (
          <View key={getString(request, 'id', JSON.stringify(request))} style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>{getString(request, 'status', 'Payout request')}</Text>
              <Text style={styles.metaText}>{formatDate(request.createdAt)}</Text>
            </View>
            <Text style={styles.amount}>{formatCurrency(getNumber(request, 'amount'))}</Text>
          </View>
        ))}
        {payoutRequests.length ? null : <Text style={styles.metaText}>No payout requests yet.</Text>}
      </AppCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.lg,
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
  },
  copy: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.small,
    lineHeight: 19,
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
    fontSize: 22,
    fontWeight: '900',
  },
  metricLabel: {
    color: theme.colors.mutedText,
    fontSize: theme.typography.caption,
    fontWeight: '800',
  },
  actionCard: {
    gap: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  listCard: {
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  sectionTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.section,
    fontWeight: '900',
  },
  metaText: {
    color: theme.colors.mutedText,
    fontSize: theme.typography.caption,
    fontWeight: '700',
  },
  textArea: {
    minHeight: 76,
    paddingTop: theme.spacing.md,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderSubtle,
    paddingTop: theme.spacing.sm,
  },
  rowText: {
    flex: 1,
    gap: 3,
  },
  rowTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.small,
    fontWeight: '900',
  },
  amount: {
    color: theme.colors.accent,
    fontSize: theme.typography.small,
    fontWeight: '900',
  },
});
