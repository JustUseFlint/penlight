import { route, body } from '@/lib/api';
import { createJob } from '@/lib/ingest/pipeline';
export const POST = route<{ id: string }>(async ({ user, req }, { id }) => {
  const b = await body<{ mode: 'lite' | 'ai' }>(req);
  return createJob(user.id, { kind: 'regenerate', lectureId: id, mode: b.mode === 'ai' ? 'ai' : 'lite' });
});
