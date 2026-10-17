/**
 * Spaced repetition: SM-2 variant with four grades and day-granular intervals.
 *  grade: 0 = Again (still learning), 1 = Hard, 2 = Good (know it), 3 = Easy
 * Pure functions so they are trivially testable.
 */
export interface CardState {
  ease: number;
  interval_days: number;
  reps: number;
  lapses: number;
}
export const DAY = 86_400_000;
export const NEW_STATE: CardState = { ease: 2.5, interval_days: 0, reps: 0, lapses: 0 };
export type Grade = 0 | 1 | 2 | 3;

export function schedule(prev: CardState, grade: Grade, nowMs: number): CardState & { due_at: number } {
  let { ease, interval_days, reps, lapses } = prev;
  if (grade === 0) {
    lapses += 1;
    reps = 0;
    ease = Math.max(1.3, ease - 0.2);
    // relearn again in 10 minutes
    return { ease, interval_days: 0, reps, lapses, due_at: nowMs + 10 * 60_000 };
  }
  if (reps === 0) interval_days = grade === 1 ? 1 : grade === 2 ? 1 : 3;
  else if (reps === 1) interval_days = grade === 1 ? 3 : grade === 2 ? 6 : 8;
  else {
    const mult = grade === 1 ? 1.2 : grade === 2 ? ease : ease * 1.3;
    interval_days = Math.max(interval_days + 1, Math.round(interval_days * mult));
  }
  if (grade === 1) ease = Math.max(1.3, ease - 0.15);
  if (grade === 3) ease = ease + 0.15;
  reps += 1;
  return { ease: Math.round(ease * 100) / 100, interval_days, reps, lapses, due_at: nowMs + interval_days * DAY };
}

/** Human-friendly label of what each grade would do next (for button hints). */
export function previewIntervals(prev: CardState, nowMs = 0): Record<Grade, string> {
  const fmt = (g: Grade) => {
    const s = schedule(prev, g, nowMs);
    const mins = (s.due_at - nowMs) / 60_000;
    if (mins < 60) return `${Math.round(mins)}m`;
    const days = mins / 1440;
    if (days < 30) return `${Math.round(days)}d`;
    return `${Math.round(days / 30)}mo`;
  };
  return { 0: fmt(0), 1: fmt(1), 2: fmt(2), 3: fmt(3) };
}

export function masteryOf(s: { reps: number; interval_days: number } | undefined): 'new' | 'learning' | 'young' | 'mature' {
  if (!s || s.reps === 0) return s ? 'learning' : 'new';
  return s.interval_days >= 21 ? 'mature' : 'young';
}
