'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

export class ApiError extends Error { constructor(msg: string, public status: number) { super(msg); } }

export async function api<T = unknown>(url: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const init: RequestInit = { method: opts.method || (opts.body !== undefined ? 'POST' : 'GET'), headers: opts.body !== undefined ? { 'content-type': 'application/json' } : undefined, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined, cache: 'no-store' };
  // The free host sleeps when idle and answers 502/503/504 (or drops the connection) for a few seconds while it wakes up.
  // Those never reached the app, so retrying is safe for every method.
  let res: Response | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    try { res = await fetch(url, init); } catch { res = null; }
    if (res && ![502, 503, 504].includes(res.status)) break;
    if (attempt < 4) await new Promise((r) => setTimeout(r, 1500 + attempt * 1500));
  }
  if (!res) throw new ApiError('Could not reach the server. Check your connection and try again.', 0);
  if ([502, 503, 504].includes(res.status)) throw new ApiError('The server is still waking up (the free host sleeps when idle). Wait a few seconds and try again.', res.status);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError((data as { error?: string }).error || `Request failed (${res.status})`, res.status);
  return data as T;
}

export function useApi<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!url);
  const seq = useRef(0);
  const load = useCallback(async () => {
    if (!url) return;
    const id = ++seq.current;
    setLoading(true);
    try { const d = await api<T>(url); if (id === seq.current) { setData(d); setError(null); } }
    catch (e) { if (id === seq.current) setError((e as Error).message); }
    finally { if (id === seq.current) setLoading(false); }
  }, [url]);
  useEffect(() => { setData(null); load(); }, [load]);
  return { data, error, loading, reload: load, setData };
}

export const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(' ');
export const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);
export function timeAgo(ts: number) {
  const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}
export const fmtDur = (sec: number | null | undefined) => { if (!sec) return ''; const m = Math.round(sec / 60); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`; };
