import { route, body } from '@/lib/api';
import { getDb } from '@/lib/db';
import { publicLlmStatus } from '@/lib/llm/config';
import { dueCounts } from '@/lib/cards';

const view = (u: import('@/lib/auth').User) => ({ id: u.id, email: u.email, name: u.name, isGuest: !!u.is_guest, targetExam: u.target_exam, examDate: u.exam_date, weeklyGoalMin: u.weekly_goal_min, theme: u.theme });

export const GET = route(async ({ user, tz }) => ({ user: view(user), llm: publicLlmStatus(), due: dueCounts(user.id, tz), timeTravel: process.env.ALLOW_TIME_TRAVEL === '1' }));
export const PATCH = route(async ({ user, req }) => {
  const b = await body<{ name?: string; theme?: string; weeklyGoalMin?: number; targetExam?: string; examDate?: string | null }>(req);
  const db = getDb();
  if (b.name !== undefined) db.prepare('UPDATE users SET name=? WHERE id=?').run(b.name.trim().slice(0, 60) || user.name, user.id);
  if (b.theme && ['light', 'dark'].includes(b.theme)) db.prepare('UPDATE users SET theme=? WHERE id=?').run(b.theme, user.id);
  if (b.weeklyGoalMin !== undefined) db.prepare('UPDATE users SET weekly_goal_min=? WHERE id=?').run(Math.max(30, Math.min(1200, Math.round(b.weeklyGoalMin))), user.id);
  if (b.targetExam && ['teas', 'nclex', 'both'].includes(b.targetExam)) db.prepare('UPDATE users SET target_exam=? WHERE id=?').run(b.targetExam, user.id);
  if (b.examDate !== undefined) db.prepare('UPDATE users SET exam_date=? WHERE id=?').run(b.examDate && /^\d{4}-\d{2}-\d{2}$/.test(b.examDate) ? b.examDate : null, user.id);
  return { ok: true };
});
