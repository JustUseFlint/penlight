import { route } from '@/lib/api';
import { getDb } from '@/lib/db';
export const GET = route<{ id: string }>(async ({ user }, { id }) => {
  const j = getDb().prepare('SELECT id,status,stage,progress,message,error,error_code,lecture_id,created_at,updated_at FROM jobs WHERE id=? AND user_id=?').get(id, user.id);
  if (!j) throw new Error('Job not found');
  return j;
});
