import { route } from '@/lib/api';
import { getDb } from '@/lib/db';
export const GET = route<{ id: string }>(async ({ user }, { id }) => {
  const j = getDb().prepare('SELECT id,status,stage,progress,message,error,error_code,lecture_id,input_json,created_at,updated_at FROM jobs WHERE id=? AND user_id=?').get(id, user.id);
  if (!j) throw new Error('Job not found');
  const { input_json, ...rest } = j as { input_json: string | null } & Record<string, unknown>;
  let url: string | null = null;
  try { url = (JSON.parse(input_json || '{}') as { url?: string }).url ?? null; } catch { /* ignore */ }
  return { ...rest, url };
});
