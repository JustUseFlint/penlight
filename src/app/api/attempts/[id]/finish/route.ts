import { route, body } from '@/lib/api';
import { finishAttempt } from '@/lib/practice';
export const POST = route<{ id: string }>(async ({ user, tz, req }, { id }) => {
  const b = await body<{ durationSec?: number }>(req);
  return finishAttempt(user.id, id, b.durationSec, tz);
});
