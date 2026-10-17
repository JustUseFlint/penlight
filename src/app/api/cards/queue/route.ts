import { route } from '@/lib/api';
import { buildQueue } from '@/lib/cards';
export const GET = route(async ({ user, tz, req }) => {
  const q = new URL(req.url).searchParams;
  const tags = q.get('tags')?.split(',').filter(Boolean);
  const scope = { deck: q.get('deck') || undefined, lectureId: q.get('lecture') || undefined, tags, topic: q.get('topic') || undefined, exam: q.get('exam') || undefined };
  const program = q.get('program') === '1';
  return buildQueue(user.id, scope, tz, { limit: Number(q.get('limit') || 60), newLimit: q.get('newLimit') ? Number(q.get('newLimit')) : undefined, ignoreDailyLimit: program });
});
