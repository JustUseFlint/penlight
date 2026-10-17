import { getDb, now } from './db';

export const DAY_MS = 86_400_000;

export function levelFor(xp: number) {
  // level n starts at 50*(n-1)*n XP: 0, 100, 300, 600, 1000, 1500…
  let level = 1;
  while (xp >= 50 * level * (level + 1)) level++;
  const floor = 50 * (level - 1) * level;
  const next = 50 * level * (level + 1);
  return { level, xp, floor, next, pct: Math.round(((xp - floor) / (next - floor)) * 100) };
}

export function dayKey(ts: number, tz = 'UTC'): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ts));
  } catch {
    return new Date(ts).toISOString().slice(0, 10);
  }
}
const shiftDay = (key: string, delta: number) => {
  const d = new Date(key + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
};
export function endOfLocalDay(ts: number, tz = 'UTC'): number {
  // find the first instant whose local day differs from ts's day
  const k = dayKey(ts, tz);
  let lo = ts, hi = ts + 26 * 3600_000;
  while (hi - lo > 1000) {
    const mid = (lo + hi) / 2;
    if (dayKey(mid, tz) === k) lo = mid; else hi = mid;
  }
  return Math.ceil(hi);
}

export interface ActivityInput { kind: string; label: string; xp?: number; minutes?: number; topic?: string | null; meta?: unknown }
export function logActivity(userId: string, a: ActivityInput) {
  getDb().prepare('INSERT INTO activity(user_id,kind,label,xp,minutes,topic,meta_json,ts) VALUES(?,?,?,?,?,?,?,?)').run(userId, a.kind, a.label, Math.round(a.xp || 0), a.minutes || 0, a.topic ?? null, a.meta ? JSON.stringify(a.meta) : null, now());
}
export function logAnswers(userId: string, rows: { questionId?: string | null; exam: string; topic: string; correct: boolean }[], source: string) {
  const db = getDb();
  const ins = db.prepare('INSERT INTO answer_log(user_id,question_id,exam,topic,correct,source,ts) VALUES(?,?,?,?,?,?,?)');
  const t = now();
  db.transaction(() => { for (const r of rows) ins.run(userId, r.questionId ?? null, r.exam, r.topic, r.correct ? 1 : 0, source, t); })();
}

export function totalXp(userId: string): number {
  return (getDb().prepare('SELECT COALESCE(SUM(xp),0) x FROM activity WHERE user_id=?').get(userId) as { x: number }).x;
}

export function streakInfo(userId: string, tz: string) {
  const rows = getDb().prepare('SELECT DISTINCT ts FROM activity WHERE user_id=? AND (xp>0 OR minutes>0)').all(userId) as { ts: number }[];
  const days = new Set(rows.map((r) => dayKey(r.ts, tz)));
  const today = dayKey(now(), tz);
  let cursor = days.has(today) ? today : shiftDay(today, -1);
  let current = 0;
  while (days.has(cursor)) { current++; cursor = shiftDay(cursor, -1); }
  const sorted = [...days].sort();
  let longest = 0, run = 0, prev = '';
  for (const d of sorted) { run = prev && shiftDay(prev, 1) === d ? run + 1 : 1; longest = Math.max(longest, run); prev = d; }
  return { current, longest, activeToday: days.has(today), days };
}

// ---------------- mastery / readiness ----------------
export const TEAS_SECTIONS = ['Reading', 'Math', 'Science', 'English & Language'];
export const NCLEX_CATEGORIES = [
  'Management of Care', 'Safety & Infection Control', 'Health Promotion & Maintenance', 'Psychosocial Integrity',
  'Basic Care & Comfort', 'Pharmacological & Parenteral Therapies', 'Reduction of Risk Potential', 'Physiological Adaptation',
];

interface TopicStat { topic: string; exam: string; answered: number; correct: number; mastery: number }

export function topicStats(userId: string): TopicStat[] {
  const rows = getDb().prepare(`
    SELECT exam, topic, COUNT(*) n, SUM(correct) c FROM (
      SELECT exam, topic, correct, ROW_NUMBER() OVER (PARTITION BY exam, topic ORDER BY ts DESC) rn FROM answer_log WHERE user_id=?
    ) WHERE rn<=60 GROUP BY exam, topic`).all(userId) as { exam: string; topic: string; n: number; c: number }[];
  // Bayesian shrinkage toward 50% so one lucky answer doesn't read as mastery
  return rows.map((r) => ({ exam: r.exam, topic: r.topic, answered: r.n, correct: r.c, mastery: Math.round(((r.c + 1.5) / (r.n + 3)) * 100) }));
}

export interface Readiness { exam: 'teas' | 'nclex'; pct: number | null; band: string; sections: { name: string; pct: number | null; answered: number }[]; answered: number; note: string }

function band(p: number) { return p >= 82 ? 'Strong' : p >= 70 ? 'Approaching' : p >= 55 ? 'Developing' : 'Building'; }

export function readiness(stats: TopicStat[]): { teas: Readiness; nclex: Readiness } {
  const build = (exam: 'teas' | 'nclex', names: string[]): Readiness => {
    const secs = names.map((name) => {
      const st = stats.filter((s) => s.exam === exam && s.topic === name);
      const n = st.reduce((a, b) => a + b.answered, 0);
      const c = st.reduce((a, b) => a + b.correct, 0);
      return { name, answered: n, pct: n >= 5 ? Math.round(((c + 1.5) / (n + 3)) * 100) : null };
    });
    const have = secs.filter((s) => s.pct !== null);
    const answered = secs.reduce((a, b) => a + b.answered, 0);
    // need at least half of the sections with data to show a gauge
    const pct = have.length >= Math.ceil(names.length / 2) ? Math.round(have.reduce((a, b) => a + (b.pct as number), 0) / have.length) : null;
    return {
      exam, pct, band: pct === null ? 'Not enough data' : band(pct), sections: secs, answered,
      note: pct === null ? `Answer at least 5 questions in ${Math.ceil(names.length / 2)} or more sections to see an estimate.` : `Average of your recent accuracy across ${have.length} of ${names.length} sections (last 60 answers each, nudged toward 50% when you have few answers).`,
    };
  };
  return { teas: build('teas', TEAS_SECTIONS), nclex: build('nclex', NCLEX_CATEGORIES) };
}

// ---------------- achievements ----------------
export const ACHIEVEMENTS: { key: string; title: string; desc: string; icon: string }[] = [
  { key: 'first_set', title: 'First Study Set', desc: 'Turn a lecture into a study set', icon: 'sparkles' },
  { key: 'first_review', title: 'Card Shark', desc: 'Review your first flashcard', icon: 'layers' },
  { key: 'cards_50', title: 'Deck Builder', desc: 'Review 50 flashcards', icon: 'library' },
  { key: 'first_test', title: 'Test Taker', desc: 'Finish a practice test', icon: 'clipboard' },
  { key: 'perfect_test', title: 'Flawless', desc: 'Score 100% on a test of 5+ questions', icon: 'target' },
  { key: 'q_100', title: 'Century', desc: 'Answer 100 practice questions', icon: 'zap' },
  { key: 'streak_3', title: 'On a Roll', desc: 'Study 3 days in a row', icon: 'flame' },
  { key: 'streak_7', title: 'Week Warrior', desc: 'Study 7 days in a row', icon: 'flame' },
  { key: 'all_games', title: 'Game Night', desc: 'Play all four learning games', icon: 'gamepad' },
  { key: 'program_day', title: 'Day One Done', desc: 'Complete a day in a study program', icon: 'map' },
  { key: 'dosage_10', title: 'Math Whiz', desc: 'Answer 10 dosage problems correctly', icon: 'calculator' },
  { key: 'level_5', title: 'Level 5', desc: 'Reach level 5', icon: 'trophy' },
];

export function checkAchievements(userId: string, tz = 'UTC'): string[] {
  const db = getDb();
  const have = new Set((db.prepare('SELECT key FROM achievements WHERE user_id=?').all(userId) as { key: string }[]).map((r) => r.key));
  const one = (sql: string, ...a: unknown[]) => (db.prepare(sql).get(userId, ...a) as { n: number }).n;
  const earned: string[] = [];
  const check = (key: string, cond: () => boolean) => { if (!have.has(key) && cond()) earned.push(key); };
  check('first_set', () => one("SELECT COUNT(*) n FROM lectures WHERE user_id=? AND status='ready'") > 0);
  check('first_review', () => one("SELECT COUNT(*) n FROM activity WHERE user_id=? AND kind='review'") > 0);
  check('cards_50', () => one("SELECT COALESCE(SUM(CAST(json_extract(meta_json,'$.cards') AS INTEGER)),0) n FROM activity WHERE user_id=? AND kind='review'") >= 50);
  check('first_test', () => one("SELECT COUNT(*) n FROM attempts WHERE user_id=? AND status='finished'") > 0);
  check('perfect_test', () => one("SELECT COUNT(*) n FROM attempts WHERE user_id=? AND status='finished' AND total>=5 AND score=total") > 0);
  check('q_100', () => one("SELECT COUNT(*) n FROM answer_log WHERE user_id=?") >= 100);
  check('streak_3', () => streakInfo(userId, tz).longest >= 3);
  check('streak_7', () => streakInfo(userId, tz).longest >= 7);
  check('all_games', () => one('SELECT COUNT(DISTINCT game) n FROM game_sessions WHERE user_id=?') >= 4);
  check('program_day', () => one("SELECT COUNT(*) n FROM activity WHERE user_id=? AND kind='program_day'") > 0);
  check('dosage_10', () => one("SELECT COUNT(*) n FROM answer_log WHERE user_id=? AND exam='dosage' AND correct=1") >= 10);
  check('level_5', () => levelFor(totalXp(userId)).level >= 5);
  const ins = db.prepare('INSERT OR IGNORE INTO achievements(user_id,key,unlocked_at) VALUES(?,?,?)');
  for (const k of earned) ins.run(userId, k, now());
  return earned;
}

// ---------------- dashboard ----------------
export function dashboard(userId: string, tz: string, weeklyGoalMin: number) {
  const db = getDb();
  const t = now();
  const xp = totalXp(userId);
  const streak = streakInfo(userId, tz);
  const todayKey = dayKey(t, tz);
  const weekStartKey = shiftDay(todayKey, -((new Date(todayKey + 'T12:00:00Z').getUTCDay() + 6) % 7)); // Monday
  const acts = db.prepare('SELECT ts, xp, minutes FROM activity WHERE user_id=? AND ts>?').all(userId, t - 130 * DAY_MS) as { ts: number; xp: number; minutes: number }[];
  const heat: Record<string, number> = {};
  let weekMin = 0, todayMin = 0, todayXp = 0;
  for (const a of acts) {
    const k = dayKey(a.ts, tz);
    heat[k] = (heat[k] || 0) + a.xp;
    if (k >= weekStartKey) weekMin += a.minutes;
    if (k === todayKey) { todayMin += a.minutes; todayXp += a.xp; }
  }
  const eod = endOfLocalDay(t, tz);
  const due = (db.prepare('SELECT COUNT(*) n FROM card_state WHERE user_id=? AND due_at<=? AND (reps>0 OR lapses>0)').get(userId, eod) as { n: number }).n;
  const newCards = (db.prepare('SELECT COUNT(*) n FROM card_state WHERE user_id=? AND reps=0 AND lapses=0').get(userId) as { n: number }).n;
  const stats = topicStats(userId);
  const attempts = db.prepare("SELECT id,title,score,total,finished_at,mode FROM attempts WHERE user_id=? AND status='finished' ORDER BY finished_at DESC LIMIT 30").all(userId) as { id: string; title: string; score: number; total: number; finished_at: number; mode: string }[];
  const weak = stats.filter((s) => s.answered >= 3 && s.mastery < 70).sort((a, b) => a.mastery - b.mastery).slice(0, 5);
  const recent = db.prepare('SELECT kind,label,xp,minutes,ts FROM activity WHERE user_id=? ORDER BY ts DESC, id DESC LIMIT 8').all(userId);
  const unlocked = db.prepare('SELECT key,unlocked_at FROM achievements WHERE user_id=?').all(userId) as { key: string; unlocked_at: number }[];
  return {
    xp: levelFor(xp),
    streak: { current: streak.current, longest: streak.longest, activeToday: streak.activeToday },
    today: { minutes: Math.round(todayMin), xp: todayXp },
    week: { minutes: Math.round(weekMin), goal: weeklyGoalMin },
    cards: { due, new: newCards },
    heatmap: heat,
    mastery: stats.sort((a, b) => b.answered - a.answered),
    readiness: readiness(stats),
    trend: attempts.slice().reverse().map((a) => ({ id: a.id, title: a.title, pct: Math.round((a.score / Math.max(1, a.total)) * 100), ts: a.finished_at })),
    weak,
    recent,
    achievements: ACHIEVEMENTS.map((a) => ({ ...a, unlockedAt: unlocked.find((u) => u.key === a.key)?.unlocked_at ?? null })),
    totals: {
      answered: (db.prepare('SELECT COUNT(*) n FROM answer_log WHERE user_id=?').get(userId) as { n: number }).n,
      accuracy: (() => { const r = db.prepare('SELECT COUNT(*) n, COALESCE(SUM(correct),0) c FROM answer_log WHERE user_id=?').get(userId) as { n: number; c: number }; return r.n ? Math.round((r.c / r.n) * 100) : null; })(),
      lectures: (db.prepare("SELECT COUNT(*) n FROM lectures WHERE user_id=? AND status='ready'").get(userId) as { n: number }).n,
    },
  };
}
