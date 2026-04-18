import { QueryClient } from '@tanstack/react-query';

let tokenGetter: (() => Promise<string | null>) | null = null;

export function setTokenGetter(getter: () => Promise<string | null>) {
  tokenGetter = getter;
}

export async function apiRequest(method: string, url: string, data?: unknown) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  if (tokenGetter) {
    const token = await tokenGetter();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: 'include',
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: { message: res.statusText } }));
    const error = new Error(body.error?.message || `Request failed: ${res.status}`);
    (error as any).status = res.status;
    (error as any).body = body;
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
