import { getAccountGeneration } from './account-boundary';
import { assertQaRequestUrl } from './qa-boundary';

type ApiRequestOptions = Omit<RequestInit, 'body'> & {
  body?: unknown;
  token?: string | null;
  timeoutMs?: number;
};

const DEFAULT_API_BASE_URL = 'https://www.gigxomi.com/api';
function canonicalizeApiBaseUrl(value: string) {
  return value.replace(/^https:\/\/gigxomi\.com(?=\/|$)/i, 'https://www.gigxomi.com');
}
const API_BASE_URL = canonicalizeApiBaseUrl(process.env.EXPO_PUBLIC_API_URL?.trim() || DEFAULT_API_BASE_URL);
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;

export class ApiError extends Error {
  status: number;
  payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

export class ApiNetworkError extends Error {
  constructor(message = 'No internet connection. Showing saved data where available.') {
    super(message);
    this.name = 'ApiNetworkError';
  }
}

export function isNetworkError(error: unknown): error is ApiNetworkError {
  return error instanceof ApiNetworkError || (error instanceof Error && error.name === 'ApiNetworkError');
}

export function getApiBaseUrl() {
  assertQaRequestUrl(API_BASE_URL, process.env.EXPO_PUBLIC_QA_MODE === '1', process.env.EXPO_PUBLIC_API_URL);
  return API_BASE_URL;
}

export function getSiteBaseUrl() {
  return getApiBaseUrl().replace(/\/api\/?$/, '');
}

function buildUrl(path: string) {
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }

  const baseUrl = API_BASE_URL.replace(/\/$/, '');
  const normalizedPath = path.replace(/^\//, '');

  return `${baseUrl}/${normalizedPath}`;
}

function readErrorMessage(payload: unknown) {
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    const error = record.error;
    const message = record.message;
    const stage = record.stage;

    if (typeof error === 'string' && typeof message === 'string' && message.trim() && /^[a-z0-9_]+$/i.test(error.trim())) {
      return typeof stage === 'string' && stage.trim() ? `${message.trim()} (${stage.trim()})` : message.trim();
    }

    if (typeof error === 'string' && error.trim()) {
      return error.trim();
    }

    if (typeof message === 'string' && message.trim()) {
      return message;
    }
  }

  return null;
}

function parseJsonResponse(text: string, status: number) {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiError('Gigxomi could not load this information. Please retry shortly.', status, { code: 'INVALID_API_RESPONSE' });
  }
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { body, headers, token, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS, ...requestOptions } = options;
  const url = buildUrl(path);
  assertQaRequestUrl(url, process.env.EXPO_PUBLIC_QA_MODE === '1', process.env.EXPO_PUBLIC_API_URL);
  const accountGeneration = getAccountGeneration();
  const requestHeaders = new Headers(headers);
  const method = String(requestOptions.method ?? 'GET').toUpperCase();
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), Math.max(1_000, timeoutMs));
  const externalSignal = requestOptions.signal;
  const abortFromExternalSignal = () => timeoutController.abort();
  externalSignal?.addEventListener('abort', abortFromExternalSignal, { once: true });
  if (externalSignal?.aborted) timeoutController.abort();

  requestHeaders.set('Accept', 'application/json');

  const hasJsonBody = body !== undefined && !(typeof FormData !== 'undefined' && body instanceof FormData);

  if (hasJsonBody && !requestHeaders.has('Content-Type')) {
    requestHeaders.set('Content-Type', 'application/json');
  }

  if (token) {
    requestHeaders.set('Authorization', `Bearer ${token}`);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      ...requestOptions,
      cache: requestOptions.cache ?? (method === 'GET' ? 'no-store' : undefined),
      headers: requestHeaders,
      body: hasJsonBody ? JSON.stringify(body) : (body as BodyInit | undefined),
      signal: timeoutController.signal,
    });
    const text = await response.text();
    // A late response from a logged-out account must never repopulate its cache.
    if (token && accountGeneration !== getAccountGeneration()) {
      const error = new Error('Account changed. This request was cancelled.');
      error.name = 'AbortError';
      throw error;
    }
    const payload = parseJsonResponse(text, response.status);
    if (!response.ok) {
      const message = response.status >= 500
        ? 'Gigxomi is temporarily unavailable. Please retry shortly.'
        : readErrorMessage(payload) ?? 'We could not complete this request. Please check your details and retry.';
      throw new ApiError(message, response.status, payload);
    }
    return payload as T;
  } catch (error) {
    if (token && accountGeneration !== getAccountGeneration()) {
      const cancelled = new Error('Account changed. This request was cancelled.');
      cancelled.name = 'AbortError';
      throw cancelled;
    }
    if (timeoutController.signal.aborted) {
      if (externalSignal?.aborted) { const cancelled = new Error('Request cancelled.'); cancelled.name = 'AbortError'; throw cancelled; }
      throw new ApiNetworkError('Gigxomi is taking too long to respond. Showing saved data where available.');
    }
    if (error instanceof TypeError || (error instanceof Error && /network|internet|offline|failed to fetch/i.test(error.message))) {
      throw new ApiNetworkError();
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
    externalSignal?.removeEventListener('abort', abortFromExternalSignal);
  }

}
