import { route, body } from '@/lib/api';
import { createAttempt, listAttempts, type Scope } from '@/lib/practice';
export const GET = route(async ({ user }) => ({ attempts: listAttempts(user.id) }));
export const POST = route(async ({ user, req }) => {
  const b = await body<{ title?: string; scope?: Scope; count?: number; mode?: 'tutor' | 'exam'; timed?: boolean }>(req);
  const count = Math.max(1, Math.min(40, Math.round(b.count || 10)));
  return createAttempt(user.id, { title: b.title, scope: b.scope || {}, count, mode: b.mode === 'exam' ? 'exam' : 'tutor', timed: !!b.timed });
});
