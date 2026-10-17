import { route, body } from '@/lib/api';
import { completeProgramTask } from '@/lib/programs-db';
export const POST = route<{ id: string }>(async ({ user, tz, req }, { id }) => {
  const b = await body<{ taskId: string; score?: number }>(req);
  return completeProgramTask(user.id, id, b.taskId, b.score ?? null, tz);
});
