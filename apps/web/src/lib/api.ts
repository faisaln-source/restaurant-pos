/**
 * API client for the Express backend.
 * Handles JWT auth, token refresh, and base URL configuration.
 */

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '').trim();

// ── Token storage (in-memory + localStorage for refresh) ──────────────────
let accessToken: string | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getRefreshToken(): string | null {
  return localStorage.getItem('pos_refresh_token');
}

export function setRefreshToken(token: string | null): void {
  if (token) {
    localStorage.setItem('pos_refresh_token', token);
  } else {
    localStorage.removeItem('pos_refresh_token');
  }
}

export function clearTokens(): void {
  accessToken = null;
  localStorage.removeItem('pos_refresh_token');
}

// ── Refresh logic ─────────────────────────────────────────────────────────
let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refresh = getRefreshToken();
  if (!refresh) return null;

  // Deduplicate concurrent refresh attempts
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: refresh }),
      });

      if (!res.ok) {
        clearTokens();
        return null;
      }

      const { data } = await res.json();
      setAccessToken(data.accessToken);
      setRefreshToken(data.refreshToken);
      return data.accessToken as string;
    } catch {
      clearTokens();
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

// ── API Error class ───────────────────────────────────────────────────────
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public data?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// ── Core fetch wrapper ────────────────────────────────────────────────────
interface FetchOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  noAuth?: boolean;
}

async function apiFetch<T = unknown>(
  path: string,
  options: FetchOptions = {},
): Promise<T> {
  const { body, noAuth, ...rest } = options;

  const headers: Record<string, string> = {
    ...(rest.headers as Record<string, string>),
  };

  // Set content-type for JSON bodies
  if (body !== undefined && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  // Attach JWT
  if (!noAuth && accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...rest,
    headers,
    body: body instanceof FormData
      ? (body as BodyInit)
      : body !== undefined
        ? JSON.stringify(body)
        : undefined,
  });

  // Handle 401 — try refresh
  if (res.status === 401 && !noAuth) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers['Authorization'] = `Bearer ${newToken}`;
      const retry = await fetch(`${API_BASE}${path}`, {
        ...rest,
        headers,
        body: body instanceof FormData
          ? (body as BodyInit)
          : body !== undefined
            ? JSON.stringify(body)
            : undefined,
      });
      if (retry.ok) {
        const retryData = await retry.json();
        return retryData.data ?? retryData;
      }
    }
    // Refresh failed — fire a custom event so the app can navigate via React Router
    // instead of a hard reload (which would flash and lose in-memory state).
    clearTokens();
    window.dispatchEvent(new CustomEvent('auth:logout'));
    throw new ApiError(401, 'Session expired');
  }

  if (!res.ok) {
    let errorMessage = res.statusText;
    try {
      const errBody = await res.json();
      errorMessage = errBody.message || errBody.error || errorMessage;
    } catch { /* not JSON */ }
    throw new ApiError(res.status, errorMessage);
  }

  // Handle 204 No Content
  if (res.status === 204) return undefined as T;

  const json = await res.json();
  return (json.data ?? json) as T;
}

// ── Convenience methods ───────────────────────────────────────────────────
export const api = {
  get: <T = unknown>(path: string, opts?: FetchOptions) =>
    apiFetch<T>(path, { method: 'GET', ...opts }),

  post: <T = unknown>(path: string, body?: unknown, opts?: FetchOptions) =>
    apiFetch<T>(path, { method: 'POST', body, ...opts }),

  patch: <T = unknown>(path: string, body?: unknown, opts?: FetchOptions) =>
    apiFetch<T>(path, { method: 'PATCH', body, ...opts }),

  put: <T = unknown>(path: string, body?: unknown, opts?: FetchOptions) =>
    apiFetch<T>(path, { method: 'PUT', body, ...opts }),

  delete: <T = unknown>(path: string, opts?: FetchOptions) =>
    apiFetch<T>(path, { method: 'DELETE', ...opts }),
};

export default api;
