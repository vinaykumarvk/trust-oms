export function authHeaders(): Record<string, string> {
  return { 'Content-Type': 'application/json' };
}

export function fetcher(url: string) {
  return fetch(url, { headers: authHeaders(), credentials: 'include' }).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });
}

export async function mutationFn(method: string, url: string, data?: unknown) {
  const res = await fetch(url, {
    method,
    headers: authHeaders(),
    credentials: 'include',
    body: data ? JSON.stringify(data) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error?.message || err.error || 'Request failed');
  }
  return res.json();
}
