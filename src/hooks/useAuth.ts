import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ApiError, apiRequest, isNetworkError } from '@/src/lib/api';
import { deleteToken, getToken, saveToken } from '@/src/lib/authStorage';
import { unregisterDevicePushToken } from '@/src/lib/pushNotifications';
import { deleteSession, getSession, saveSession } from '@/src/lib/sessionStorage';
import type {
  MobileLoginResponse,
  MobileOtpChannelResponse,
  MobileOtpRequestResponse,
  MobileSessionResponse,
  MobileSignupResponse,
  MobileSubscribeResponse,
  ConnectedSignupActivateResponse,
  ConnectedSignupStartResponse,
  ConnectedSignupVerifyResponse,
} from '@/src/types';
import { queryKeys } from './queryKeys';
import { resetOnboardingDeferral } from '@/src/lib/onboarding-deferral';
import { resetAccountBoundary } from '@/src/lib/account-boundary';

async function acceptAuthenticatedSession(queryClient: ReturnType<typeof useQueryClient>, response: { token: string; session: MobileSessionResponse['session'] }) {
  resetAccountBoundary();
  resetOnboardingDeferral();
  await queryClient.cancelQueries();
  queryClient.removeQueries();
  await saveToken(response.token);
  await saveSession(response.session);
  queryClient.setQueryData(queryKeys.token, response.token);
  queryClient.setQueryData(queryKeys.session, { ok: true, session: response.session });
}

type PasswordLoginInput = {
  identifier: string;
  password: string;
  loginScope?: 'manager';
};

type OtpRequestInput = {
  phone: string;
  loginScope?: 'manager';
};

type OtpVerifyInput = {
  challengeId?: string;
  intentId?: string;
  phone?: string;
  code: string;
};

type SignupInput = {
  firstName: string;
  lastName: string;
  email?: string;
  phone: string;
  packageId: string;
  confirmPackageChange?: boolean;
};

type SignupVerifyInput = OtpVerifyInput & {
  intentId: string;
};

export function useStoredToken() {
  return useQuery({
    queryKey: queryKeys.token,
    queryFn: getToken,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function useAuth() {
  const queryClient = useQueryClient();
  const tokenQuery = useStoredToken();
  const token = tokenQuery.data ?? null;
  const sessionQuery = useQuery({
    queryKey: queryKeys.session,
    enabled: Boolean(token),
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 4000),
    queryFn: async () => {
      try {
        const response = await apiRequest<MobileSessionResponse>('/mobile/session', { token, timeoutMs: 15_000 });
        await saveSession(response.session);
        return response;
      } catch (error) {
        const authenticationRejected = error instanceof ApiError && (error.status === 401 || error.status === 403);
        if (!authenticationRejected) {
          const cachedSession = await getSession();
          if (cachedSession) {
            // If network is offline or temporarily failing, return cached session
            return { ok: true, session: cachedSession, offline: true } as MobileSessionResponse & { offline: true };
          }
        }

        throw error;
      }
    },
  });
  const logoutMutation = useMutation({
    mutationFn: async () => {
      resetOnboardingDeferral();
      resetAccountBoundary();
      await queryClient.cancelQueries();
      const activeToken = token ?? (await getToken());
      if (activeToken) {
        await unregisterDevicePushToken(activeToken).catch(() => undefined);
      }
      await deleteToken();
      await deleteSession();
    },
    onSuccess: async () => {
      queryClient.removeQueries();
      queryClient.setQueryData(queryKeys.token, null);
    },
  });

  return {
    token,
    tokenQuery,
    session: sessionQuery.data?.session ?? null,
    sessionQuery,
    sessionUnavailableOffline: Boolean(token && sessionQuery.error && isNetworkError(sessionQuery.error)),
    sessionExpired: Boolean(sessionQuery.error instanceof ApiError && (sessionQuery.error.status === 401 || sessionQuery.error.status === 403)),
    isAuthenticated: Boolean(token && sessionQuery.data?.session),
    isLoading: tokenQuery.isLoading || (Boolean(token) && sessionQuery.isLoading),
    logout: logoutMutation.mutateAsync,
  };
}

export function usePasswordLogin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: PasswordLoginInput) =>
      apiRequest<MobileLoginResponse>('/mobile/auth/login', {
        method: 'POST',
        body: input,
      }),
    onSuccess: async (response) => {
      await acceptAuthenticatedSession(queryClient, response);
    },
  });
}

export function useRequestOtp() {
  return useMutation({
    mutationFn: (input: OtpRequestInput) =>
      apiRequest<MobileOtpRequestResponse>('/mobile/auth/request-otp', {
        method: 'POST',
        body: input,
      }),
  });
}

export function useOtpChannel() {
  return useQuery({
    queryKey: ['mobile', 'auth', 'otp-channel'],
    queryFn: () => apiRequest<MobileOtpChannelResponse>('/mobile/auth/otp-channel'),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

export function useVerifyOtp() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: OtpVerifyInput) =>
      apiRequest<MobileLoginResponse>('/mobile/auth/verify-otp', {
        method: 'POST',
        body: input,
      }),
    onSuccess: async (response) => {
      await acceptAuthenticatedSession(queryClient, response);
    },
  });
}

export function useSignup() {
  return useMutation({
    mutationFn: (input: SignupInput) =>
      apiRequest<MobileSignupResponse>('/mobile/auth/signup', {
        method: 'POST',
        body: input,
      }),
  });
}

export function useVerifySignupOtp() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: SignupVerifyInput) =>
      apiRequest<MobileSubscribeResponse>('/mobile/auth/verify-signup-otp', {
        method: 'POST',
        body: input,
      }),
    onSuccess: async (response) => {
      await acceptAuthenticatedSession(queryClient, response);
    },
  });
}

export function useConnectedSignupStart() {
  return useMutation({
    mutationFn: (input: { role: 'AGENCY' | 'FREELANCER'; firstName: string; lastName: string; email?: string; phone: string }) =>
      apiRequest<ConnectedSignupStartResponse>('/mobile/v2/onboarding/start', { method: 'POST', body: input }),
  });
}

export function useConnectedSignupVerify() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { intentId: string; phone?: string; code: string }) =>
      apiRequest<ConnectedSignupVerifyResponse>('/mobile/v2/onboarding/verify', { method: 'POST', body: input }),
    onSuccess: async (response) => {
      await acceptAuthenticatedSession(queryClient, response);
    },
  });
}

export function useConnectedSignupActivate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      packageId: string;
      couponCode?: string;
      billingCycle?: 'MONTHLY' | 'YEARLY';
      distributionChannel?: 'DIRECT' | 'PLAY_READER';
      verifiedToken?: string;
    }) => {
      const { verifiedToken, ...body } = input;
      return apiRequest<ConnectedSignupActivateResponse>('/mobile/v2/onboarding/activate', {
        method: 'POST',
        body,
        token: verifiedToken || (await getToken()),
      });
    },
    onSuccess: async (response) => {
      await acceptAuthenticatedSession(queryClient, response);
    },
  });
}

export type CheckAuthStatusResponse = {
  ok: boolean;
  verified: boolean;
  token?: string;
  session?: MobileSessionResponse['session'];
  nextAction?: 'payment' | 'onboarding' | 'tabs' | 'package';
  packages?: any[];
  paymentPath?: string;
  paymentUrl?: string;
  status?: string;
  error?: string;
};

export async function checkAuthStatus(intentId: string, phone?: string): Promise<CheckAuthStatusResponse> {
  const params = new URLSearchParams();
  if (intentId) params.append('intentId', intentId);
  if (phone) params.append('phone', phone);
  try {
    const v2 = await apiRequest<CheckAuthStatusResponse>(`/mobile/v2/onboarding/verify?${params.toString()}`);
    if (v2 && v2.ok && v2.verified) {
      return v2;
    }
  } catch {
    // Fallback to check-status
  }
  return apiRequest<CheckAuthStatusResponse>(`/mobile/auth/check-status?${params.toString()}`);
}

export function useAutoAuthPoller(options: {
  intentId?: string | null;
  phone?: string | null;
  enabled: boolean;
  onVerified: (response: CheckAuthStatusResponse) => void | Promise<void>;
}) {
  const queryClient = useQueryClient();
  const { intentId, phone, enabled, onVerified } = options;

  useEffect(() => {
    if (!enabled || (!intentId && !phone)) {
      return;
    }

    let isMounted = true;
    let timer: any = null;
    let attempts = 0;
    const maxAttempts = 60; // Poll for up to 90 seconds (60 * 1.5s)

    const poll = async () => {
      if (!isMounted || attempts >= maxAttempts) return;
      attempts++;

      try {
        const result = await checkAuthStatus(intentId || '', phone || '');
        if (!isMounted) return;

        if (result.ok && result.verified) {
          if (result.token && result.session) {
            await acceptAuthenticatedSession(queryClient, { token: result.token, session: result.session });
          }
          await onVerified(result);
          return; // Verified! Stop polling.
        }
      } catch {
        // Silently retry on transient poll errors
      }

      if (isMounted && attempts < maxAttempts) {
        timer = setTimeout(poll, 1500);
      }
    };

    timer = setTimeout(poll, 1500);

    return () => {
      isMounted = false;
      if (timer) clearTimeout(timer);
    };
  }, [enabled, intentId, phone]);
}

