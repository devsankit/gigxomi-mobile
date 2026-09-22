import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from '@/src/lib/api';
import type {
  MobileAccountingRequestsResponse,
  MobilePaymentDetailsResponse,
  MobilePayoutRequestsResponse,
  MobileWalletResponse,
} from '@/src/types';
import { queryKeys } from './queryKeys';
import { useStoredToken } from './useAuth';

type PayoutRequestInput = {
  amount: number;
  note?: string;
};

export function useFreelancerWallet(enabled = true) {
  const tokenQuery = useStoredToken();
  const token = tokenQuery.data ?? null;

  return useQuery({
    queryKey: queryKeys.wallet,
    enabled: Boolean(token && enabled),
    queryFn: () => apiRequest<MobileWalletResponse>('/freelancer/wallet', { token }),
  });
}

export function usePaymentDetails(enabled = true) {
  const tokenQuery = useStoredToken();
  const token = tokenQuery.data ?? null;

  return useQuery({
    queryKey: queryKeys.paymentDetails,
    enabled: Boolean(token && enabled),
    queryFn: () => apiRequest<MobilePaymentDetailsResponse>('/freelancer/payment-details', { token }),
  });
}

export function usePayoutRequests(enabled = true) {
  const tokenQuery = useStoredToken();
  const token = tokenQuery.data ?? null;

  return useQuery({
    queryKey: queryKeys.payoutRequests,
    enabled: Boolean(token && enabled),
    queryFn: () => apiRequest<MobilePayoutRequestsResponse>('/freelancer/payout-requests', { token }),
  });
}

export function useCreatePayoutRequest() {
  const queryClient = useQueryClient();
  const tokenQuery = useStoredToken();

  return useMutation({
    mutationFn: (input: PayoutRequestInput) =>
      apiRequest<MobilePayoutRequestsResponse>('/freelancer/payout-requests', {
        method: 'POST',
        token: tokenQuery.data ?? null,
        body: input,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.payoutRequests });
      await queryClient.invalidateQueries({ queryKey: queryKeys.wallet });
    },
  });
}

export function useAccountingRequests(audience: 'agency' | 'editor', enabled = true) {
  const tokenQuery = useStoredToken();
  const token = tokenQuery.data ?? null;

  return useQuery({
    queryKey: queryKeys.accountingRequests(audience),
    enabled: Boolean(token && enabled),
    queryFn: () => apiRequest<MobileAccountingRequestsResponse>(`/accounting/requests?audience=${audience}`, { token }),
  });
}
