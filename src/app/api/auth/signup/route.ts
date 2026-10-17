import { route, body } from '@/lib/api';
import { signUp } from '@/lib/auth';
export const POST = route(async ({ user, req }) => {
  const b = await body<{ email: string; password: string; name?: string }>(req);
  await signUp(b.email || '', b.password || '', b.name || '', user);
  return { ok: true, upgraded: !!user.is_guest };
});
