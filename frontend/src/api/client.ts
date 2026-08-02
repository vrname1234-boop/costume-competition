import type { SessionResponse } from './types';

export const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000').replace(
  /\/$/,
  '',
);

/**
 * The access token is held in memory only. It is never written to
 * localStorage, so a page reload deliberately loses it and the refresh token
 * is exchanged for a new one instead.
 */
let accessToken: string | null = null;
let onSessionChange: ((session: SessionResponse | null) => void) | null = null;

const REFRESH_KEY = 'cc.refresh';

export const setAccessToken = (token: string | null) => {
  accessToken = token;
};

export const getRefreshToken = () => localStorage.getItem(REFRESH_KEY);

export const setRefreshToken = (token: string | null) => {
  if (token) localStorage.setItem(REFRESH_KEY, token);
  else localStorage.removeItem(REFRESH_KEY);
};

export const setSessionListener = (fn: ((session: SessionResponse | null) => void) | null) => {
  onSessionChange = fn;
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fieldErrors: Record<string, string>;

  constructor(status: number, code: string, message: string, fieldErrors: Record<string, string>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

interface ErrorBody {
  error?: {
    code?: string;
    message?: string;
    details?: { field?: string; message?: string }[];
  };
}

async function toApiError(response: Response): Promise<ApiError> {
  let body: ErrorBody = {};
  try {
    body = (await response.json()) as ErrorBody;
  } catch {
    // Non-JSON error responses fall back to the status text.
  }
  const fieldErrors: Record<string, string> = {};
  for (const detail of body.error?.details ?? []) {
    if (detail.field && detail.message) fieldErrors[detail.field] = detail.message;
  }
  return new ApiError(
    response.status,
    body.error?.code ?? 'error',
    body.error?.message ?? 'Something went wrong. Please try again.',
    fieldErrors,
  );
}

let refreshInFlight: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  refreshInFlight ??= (async () => {
    try {
      const response = await fetch(`${API_BASE}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!response.ok) {
        setRefreshToken(null);
        setAccessToken(null);
        onSessionChange?.(null);
        return false;
      }
      const session = (await response.json()) as SessionResponse;
      setAccessToken(session.accessToken);
      setRefreshToken(session.refreshToken);
      onSessionChange?.(session);
      return true;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  formData?: FormData;
  signal?: AbortSignal;
}

async function send<T>(path: string, options: RequestOptions, retry = true): Promise<T> {
  const headers: Record<string, string> = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.formData ?? (options.body === undefined ? undefined : JSON.stringify(options.body)),
    signal: options.signal ?? null,
  });

  if (response.status === 401 && retry && (await refreshSession())) {
    return send<T>(path, options, false);
  }

  if (!response.ok) throw await toApiError(response);
  if (response.status === 204) return undefined as T;

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) return (await response.text()) as unknown as T;
  return (await response.json()) as T;
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => send<T>(path, { signal }),
  post: <T>(path: string, body?: unknown) => send<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => send<T>(path, { method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown) => send<T>(path, { method: 'PUT', body }),
  delete: <T>(path: string, body?: unknown) => send<T>(path, { method: 'DELETE', body }),
  upload: <T>(path: string, formData: FormData, method: 'POST' | 'PUT' = 'POST') =>
    send<T>(path, { method, formData }),
  refreshSession,
};

/** Downloads through fetch so the Authorization header can be attached. */
export async function downloadCsv(path: string, filename: string): Promise<void> {
  const text = await api.get<string>(path);
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
