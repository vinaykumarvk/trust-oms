import { QueryClient } from '@tanstack/react-query';

let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;

async function tryRefreshToken(): Promise<boolean> {
  try {
    const res = await fetch('/api/v1/auth/refresh', {
      method: 'POST',
      credentials: 'include',
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function refreshOnce(): Promise<boolean> {
  if (isRefreshing && refreshPromise) return refreshPromise;
  isRefreshing = true;
  refreshPromise = tryRefreshToken().finally(() => {
    isRefreshing = false;
    refreshPromise = null;
  });
  return refreshPromise;
}

export async function apiRequest(method: string, url: string, data?: unknown) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  // Tokens are sent automatically via httpOnly cookies (credentials: 'include')
  let res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: 'include',
  });

  // On 401, attempt silent token refresh and retry once
  if (res.status === 401 && !url.includes('/auth/')) {
    const refreshed = await refreshOnce();
    if (refreshed) {
      res = await fetch(url, {
        method,
        headers,
        body: data ? JSON.stringify(data) : undefined,
        credentials: 'include',
      });
    } else {
      // Refresh failed — clear user state and redirect to login
      localStorage.removeItem('trustoms-user');
      window.location.href = '/login?sessionExpired=1';
      throw new Error('Session expired');
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: { message: res.statusText } }));
    const error: Error & { status?: number; body?: unknown } = new Error(
      body.error?.message || `Request failed: ${res.status}`,
    );
    error.status = res.status;
    error.body = body;
    throw error;
  }

  if (res.status === 204) return null;
  return res.json();
}

export function getQueryFn<T>(url: string) {
  return async (): Promise<T> => {
    return apiRequest('GET', url);
  };
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
