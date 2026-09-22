import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from '@/src/lib/api';
import type {
  MobileAssignmentDetailResponse,
  MobileAssignmentMutationResponse,
  MobileAssignmentPaymentRequestResponse,
  MobileAssignmentsResponse,
  MobileDeliveryReviewResponse,
  MobileDeliverySubmissionResponse,
} from '@/src/types';
import { queryKeys } from './queryKeys';
import { useAuth, useStoredToken } from './useAuth';

type RespondInput = {
  assignmentId: string;
  action: 'ACCEPT' | 'DECLINE';
  note?: string;
};

type SubmitDeliveryInput = {
  assignmentId: string;
  deliveryLinks: string | string[];
  notes?: string;
};

type ReviewDeliveryInput = {
  submissionId: string;
  assignmentId: string;
  action: 'APPROVE' | 'REQUEST_REVISION';
  note?: string;
  revisionReason?: string;
  revisionDueDate?: string;
};

type RequestPaymentInput = {
  assignmentId: string;
  requestedAmount?: number;
  message?: string;
  chatThreadId?: string | null;
};

function assignmentPath(assignmentId: string, suffix = '') {
  return `/assignments/${encodeURIComponent(assignmentId)}${suffix}`;
}

async function invalidateAssignmentQueries(queryClient: ReturnType<typeof useQueryClient>, assignmentId?: string) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.assignments }),
    assignmentId ? queryClient.invalidateQueries({ queryKey: queryKeys.assignmentDetail(assignmentId) }) : Promise.resolve(),
    queryClient.invalidateQueries({ queryKey: queryKeys.notifications }),
    queryClient.invalidateQueries({ queryKey: queryKeys.orders }),
  ]);
}

export function useAssignments() {
  const auth = useAuth();
  const token = auth.token;
  return useQuery({
    queryKey: [...queryKeys.assignments, auth.session?.userId, auth.session?.tenantId],
    enabled: Boolean(token && auth.session),
    queryFn: () => apiRequest<MobileAssignmentsResponse>('/assignments', { token }),
  });
}

export function useAssignmentDetail(assignmentId: string | undefined) {
  const tokenQuery = useStoredToken();
  const token = tokenQuery.data ?? null;

  return useQuery({
    queryKey: queryKeys.assignmentDetail(assignmentId ?? ''),
    enabled: Boolean(token && assignmentId),
    queryFn: () => apiRequest<MobileAssignmentDetailResponse>(assignmentPath(assignmentId ?? ''), { token }),
  });
}

export function useRespondToAssignment() {
  const queryClient = useQueryClient();
  const tokenQuery = useStoredToken();

  return useMutation({
    mutationFn: ({ action, assignmentId, note }: RespondInput) =>
      apiRequest<MobileAssignmentMutationResponse>(assignmentPath(assignmentId, '/respond'), {
        method: 'POST',
        token: tokenQuery.data ?? null,
        body: { action, note },
      }),
    onSuccess: async (_, variables) => {
      await invalidateAssignmentQueries(queryClient, variables.assignmentId);
    },
  });
}

export function useSubmitAssignmentDelivery() {
  const queryClient = useQueryClient();
  const tokenQuery = useStoredToken();

  return useMutation({
    mutationFn: ({ assignmentId, deliveryLinks, notes }: SubmitDeliveryInput) =>
      apiRequest<MobileDeliverySubmissionResponse>(assignmentPath(assignmentId, '/delivery'), {
        method: 'POST',
        token: tokenQuery.data ?? null,
        body: { deliveryLinks, notes },
      }),
    onSuccess: async (_, variables) => {
      await invalidateAssignmentQueries(queryClient, variables.assignmentId);
    },
  });
}

export function useReviewDeliverySubmission() {
  const queryClient = useQueryClient();
  const tokenQuery = useStoredToken();

  return useMutation({
    mutationFn: ({ action, note, revisionDueDate, revisionReason, submissionId }: ReviewDeliveryInput) =>
      apiRequest<MobileDeliveryReviewResponse>(`/delivery-submissions/${encodeURIComponent(submissionId)}/review`, {
        method: 'POST',
        token: tokenQuery.data ?? null,
        body: { action, note, revisionDueDate, revisionReason },
      }),
    onSuccess: async (_, variables) => {
      await invalidateAssignmentQueries(queryClient, variables.assignmentId);
    },
  });
}

export function useRequestAssignmentPayment() {
  const queryClient = useQueryClient();
  const tokenQuery = useStoredToken();

  return useMutation({
    mutationFn: ({ assignmentId, chatThreadId, message, requestedAmount }: RequestPaymentInput) =>
      apiRequest<MobileAssignmentPaymentRequestResponse>(assignmentPath(assignmentId, '/payment-request'), {
        method: 'POST',
        token: tokenQuery.data ?? null,
        body: { chatThreadId, message, requestedAmount },
      }),
    onSuccess: async (_, variables) => {
      await invalidateAssignmentQueries(queryClient, variables.assignmentId);
    },
  });
}
