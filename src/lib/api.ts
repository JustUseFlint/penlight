import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { AuthError, requireUser, type User } from './auth';

export interface Ctx { user: User; tz: string; req: Request }

export async function tzFromCookie(): Promise<string> {
  const tz = (await cookies()).get('penlight_tz')?.value;
  try { if (tz) { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return tz; } } catch { /* fall through */ }
  return 'UTC';
}

export function route<P = Record<string, string>>(fn: (ctx: Ctx, params: P) => Promise<unknown> | unknown) {
  return async (req: Request, { params }: { params: Promise<P> }) => {
    try {
      const user = await requireUser();
      const tz = await tzFromCookie();
      const out = await fn({ user, tz, req }, await params);
      if (out instanceof Response) return out;
      return NextResponse.json(out ?? { ok: true });
    } catch (e) {
      const msg = (e as Error).message || 'Something went wrong';
      const status = e instanceof AuthError ? 400 : /not found/i.test(msg) ? 404 : /only edit|read-only/i.test(msg) ? 403 : 400;
      if (status === 400 && !(e instanceof AuthError) && !/^(No |Nothing|Both|The front|Enter|Pick|Bad|Unknown|Already|This test|You )/.test(msg)) console.error('[api]', req.url, e);
      return NextResponse.json({ error: msg }, { status });
    }
  };
}

export async function body<T = Record<string, unknown>>(req: Request): Promise<T> {
  try { return (await req.json()) as T; } catch { return {} as T; }
}
