import { route, body } from '@/lib/api';
import { logIn } from '@/lib/auth';
export const POST = route(async ({ req }) => {
  const b = await body<{ email: string; password: string }>(req);
  await logIn(b.email || '', b.password || '');
  return { ok: true };
});
