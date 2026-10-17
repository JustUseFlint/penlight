import { getDb, now } from './db';
import { logActivity, checkAchievements } from './progress';
import { PROGRAMS, getProgram, programDays, requiredTasks, type ProgramDef } from './content/programs';

export function enroll(userId: string, programId: string) {
  if (!getProgram(programId)) throw new Error('Program not found');
  getDb().prepare('INSERT OR IGNORE INTO enrollments(user_id,program_id,started_at) VALUES(?,?,?)').run(userId, programId, now());
}

function doneSet(userId: string, programId: string) {
  const rows = getDb().prepare('SELECT task_id, score, completed_at FROM program_progress WHERE user_id=? AND program_id=?').all(userId, programId) as { task_id: string; score: number | null; completed_at: number }[];
  return new Map(rows.map((r) => [r.task_id, r]));
}

export function programProgress(userId: string, p: ProgramDef) {
  const done = doneSet(userId, p.id);
  const days = programDays(p);
  let completeDays = 0;
  let nextDay: number | null = null;
  const dayStatus = new Map<number, 'done' | 'current' | 'todo'>();
  for (const d of days) {
    const req = requiredTasks(d);
    const all = req.length > 0 && req.every((t) => done.has(t.id));
    if (all) { completeDays++; dayStatus.set(d.n, 'done'); }
    else if (nextDay === null) { nextDay = d.n; dayStatus.set(d.n, 'current'); }
    else dayStatus.set(d.n, 'todo');
  }
  const enrolled = !!getDb().prepare('SELECT 1 FROM enrollments WHERE user_id=? AND program_id=?').get(userId, p.id);
  return { done, completeDays, totalDays: days.length, nextDay, dayStatus, pct: Math.round((completeDays / days.length) * 100), enrolled };
}

export function listPrograms(userId: string) {
  return PROGRAMS.map((p) => {
    const pp = programProgress(userId, p);
    return {
      id: p.id, title: p.title, subtitle: p.subtitle, description: p.description, exam: p.exam, level: p.level, duration: p.duration, hue: p.hue, icon: p.icon, outcomes: p.outcomes,
      weeks: p.weeks.length, totalDays: pp.totalDays, completeDays: pp.completeDays, pct: pp.pct, enrolled: pp.enrolled, nextDay: pp.nextDay,
      minutesPerDay: Math.round(programDays(p).reduce((a, d) => a + d.tasks.filter((t) => !t.optional).reduce((x, t) => x + t.minutes, 0), 0) / pp.totalDays),
    };
  });
}

export function programDetail(userId: string, id: string) {
  const p = getProgram(id);
  if (!p) return null;
  const pp = programProgress(userId, p);
  return {
    ...listPrograms(userId).find((x) => x.id === id)!,
    weeklyPlan: p.weeks.map((w) => ({
      n: w.n, title: w.title, focus: w.focus,
      days: w.days.map((d) => ({
        n: d.n, title: d.title, status: pp.dayStatus.get(d.n)!,
        tasks: d.tasks.map((t) => ({ ...t, done: pp.done.has(t.id), score: pp.done.get(t.id)?.score ?? null })),
      })),
    })),
  };
}

/** Marks a task complete (idempotent). When it finishes the day's required tasks, awards the day XP once. */
export function completeProgramTask(userId: string, programId: string, taskId: string, score: number | null, tz = 'UTC') {
  const p = getProgram(programId);
  if (!p) throw new Error('Program not found');
  const day = programDays(p).find((d) => d.tasks.some((t) => t.id === taskId));
  if (!day) throw new Error('Task not found');
  const task = day.tasks.find((t) => t.id === taskId)!;
  const db = getDb();
  enroll(userId, programId);
  const before = doneSet(userId, programId);
  const dayDoneBefore = requiredTasks(day).every((t) => before.has(t.id));
  db.prepare('INSERT INTO program_progress(user_id,program_id,task_id,score,completed_at) VALUES(?,?,?,?,?) ON CONFLICT(user_id,program_id,task_id) DO UPDATE SET score=COALESCE(excluded.score, program_progress.score)')
    .run(userId, programId, taskId, score, now());
  let dayCompleted = false;
  if (!before.has(taskId) && task.kind === 'lesson') logActivity(userId, { kind: 'lesson', label: task.title.replace(/^Read: /, 'Read lesson: '), xp: 10, minutes: task.minutes, topic: null, meta: { programId, taskId } });
  const after = doneSet(userId, programId);
  if (!dayDoneBefore && requiredTasks(day).every((t) => after.has(t.id))) {
    dayCompleted = true;
    logActivity(userId, { kind: 'program_day', label: `${p.title}: Day ${day.n} complete`, xp: 40, minutes: 0, meta: { programId, day: day.n } });
  }
  const ach = checkAchievements(userId, tz);
  const progress = programProgress(userId, p);
  return { dayCompleted, day: day.n, pct: progress.pct, programComplete: progress.completeDays === progress.totalDays, newAchievements: ach };
}
