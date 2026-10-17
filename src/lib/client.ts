'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

export class ApiError extends Error { constructor(msg: string, public status: number) { super(msg); } }

export async function api<T = unknown>(url: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(url, { method: opts.method || (opts.body !== undefined ? 'POST' : 'GET'), headers: opts.body !== undefined ? { 'content-type': 'application/json' } : undefined, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined, cache: 'no-store' });
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
