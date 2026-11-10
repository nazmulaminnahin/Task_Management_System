import type { User } from '@/types';

const BASE = '/api';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = 'ERROR',
    public details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Access token lives only in memory (never localStorage) to reduce XSS blast radius.
 * It is re-minted silently from the http-only refresh cookie on boot / 401.
 */
let accessToken: string | null = null;
let onUnauthorized: (() => void) | null = null;
let refreshing: Promise<string | null> | null = null;

export const tokenStore = {
  get: () => accessToken,
  set: (token: string | null) => {
    accessToken = token;
  },
  setUnauthorizedHandler: (fn: () => void) => {
    onUnauthorized = fn;
  },
};

/** Single-flight refresh: concurrent 401s share one refresh request. */
async function refreshAccessToken(): Promise<string | null> {
  refreshing ??= (async () => {
    try {
      const res = await fetch(`${BASE}/auth/refresh`, { method: 'POST', credentials: 'include' });
      if (!res.ok) return null;
      const data = (await res.json()) as { accessToken: string };
      accessToken = data.accessToken;
      return data.accessToken;
    } catch {
      return null;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  retry?: boolean;
  raw?: boolean;
}

export async function api<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, retry = true, raw, headers, ...rest } = options;
  const isForm = body instanceof FormData;

  const res = await fetch(`${BASE}${path}`, {
    ...rest,
    credentials: 'include',
    headers: {
      ...(isForm ? {} : { 'Content-Type': 'application/json' }),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...headers,
    },
    body: isForm ? body : body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && retry && !path.startsWith('/auth/')) {
    const fresh = await refreshAccessToken();
    if (fresh) return api<T>(path, { ...options, retry: false });
    onUnauthorized?.();
    throw new ApiError(401, 'Session expired', 'UNAUTHORIZED');
  }

  if (!res.ok) {
    let payload: { error?: { message?: string; code?: string; details?: unknown } } = {};
    try {
      payload = await res.json();
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(
      res.status,
      payload.error?.message ?? res.statusText ?? 'Request failed',
      payload.error?.code ?? 'ERROR',
      payload.error?.details,
    );
  }

  if (res.status === 204) return undefined as T;
  if (raw) return res as unknown as T;
  return (await res.json()) as T;
}

export const authApi = {
  login: (email: string, password: string) =>
    api<{ accessToken: string; user: User }>('/auth/login', { method: 'POST', body: { email, password } }),
  register: (input: { email: string; password: string; name: string; role?: 'EMPLOYEE' | 'INDIVIDUAL' }) =>
    api<{ user: User }>('/auth/register', { method: 'POST', body: input }),
  refresh: () => api<{ accessToken: string; user: User }>('/auth/refresh', { method: 'POST' }),
  logout: () => api<void>('/auth/logout', { method: 'POST' }),
  me: () => api<{ user: User }>('/auth/me'),
};

export const refreshApi = refreshAccessToken;
