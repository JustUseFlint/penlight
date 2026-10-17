import { getDb, now, uid } from './db';
import { makeDrill, DRILL_KINDS, type DrillKind } from './dosage';
import { logActivity, logAnswers, checkAchievements } from './progress';
import { gradeQuestion, scoreAttempt, shuffleOptions, testXp, type Answer } from './scoring';
import { rng } from './lite/text';
import type { ServedQuestion } from './types';
import { completeProgramTask } from './programs-db';

export interface Scope {
  exam?: string;
  topic?: string;
  tags?: string[];
  lectureId?: string;
  weak?: boolean;
  drills?: DrillKind[];
  retakeOf?: string;
  ids?: string[];
  program?: { programId: string; taskId: string };
}
export interface NewAttempt { title?: string; scope: Scope; count: number; mode: 'tutor' | 'exam'; timed?: boolean; seed?: string }

interface QRow { id: string; exam: string; topic: string; type: 'mcq' | 'sata'; stem: string; options_json: string; correct_json: string; rationale: string; difficulty: number }
const toServed = (r: QRow): ServedQuestion => ({ id: r.id, type: r.type, exam: r.exam, topic: r.topic, stem: r.stem, options: JSON.parse(r.options_json), correct: JSON.parse(r.correct_json), rationale: r.rationale, difficulty: r.difficulty });

export function weakTopics(userId: string): string[] {
  const rows = getDb().prepare(`SELECT topic, COUNT(*) n, SUM(correct) c FROM (SELECT topic, correct, ROW_NUMBER() OVER (PARTITION BY topic ORDER BY ts DESC) rn FROM answer_log WHERE user_id=?) WHERE rn<=40 GROUP BY topic`).all(userId) as { topic: string; n: number; c: number }[];
  return rows.filter((r) => r.n >= 3 && (r.c + 1.5) / (r.n + 3) < 0.7).sort((a, b) => a.c / a.n - b.c / b.n).map((r) => r.topic);
}

export function selectQuestions(userId: string, scope: Scope, count: number, seed: string): ServedQuestion[] {
  const db = getDb();
  const r = rng(seed);
  if (scope.drills?.length) return makeDrill(scope.drills, count, seed);
  const where: string[] = [scope.lectureId ? 'lecture_id IN (SELECT id FROM lectures WHERE user_id=@u)' : 'lecture_id IS NULL'];
  const p: Record<string, unknown> = { u: userId };
  if (scope.lectureId) { where.push('lecture_id=@lec'); p.lec = scope.lectureId; }
  if (scope.exam) { where.push('exam=@exam'); p.exam = scope.exam; }
  if (scope.topic) { where.push('topic=@topic'); p.topic = scope.topic; }
  if (scope.tags?.length) where.push(`tag IN (${scope.tags.map((_, i) => `@t${i}`).join(',')})`), scope.tags.forEach((t, i) => (p[`t${i}`] = t));
  if (scope.ids?.length) where.push(`id IN (${scope.ids.map((_, i) => `@i${i}`).join(',')})`), scope.ids.forEach((t, i) => (p[`i${i}`] = t));
  if (scope.weak) {
    const wt = weakTopics(userId);
    if (wt.length) where.push(`topic IN (${wt.map((_, i) => `@w${i}`).join(',')})`), wt.forEach((t, i) => (p[`w${i}`] = t));
  }
  const rows = db.prepare(`SELECT q.*, (SELECT COUNT(*) FROM answer_log a WHERE a.user_id=@u AND a.question_id=q.id) seen,
      (SELECT COUNT(*) FROM answer_log a WHERE a.user_id=@u AND a.question_id=q.id AND a.correct=0) missed FROM questions q WHERE ${where.join(' AND ')}`).all(p) as (QRow & { seen: number; missed: number })[];
  // prefer unseen, then previously missed, then random: stable shuffle with weights
  const scored = rows.map((q) => ({ q, k: (q.seen === 0 ? 0 : q.missed > 0 ? 1 : 2) + r() * 0.9 })).sort((a, b) => a.k - b.k);
  const picked = scored.slice(0, count).map((x) => x.q);
  // mix types fairly: shuffle final order
  for (let i = picked.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [picked[i], picked[j]] = [picked[j], picked[i]]; }
  return picked.map(toServed);
}

export function sanitize(q: ServedQuestion, reveal = false) {
  const base = { id: q.id, type: q.type, exam: q.exam, topic: q.topic, stem: q.stem, options: q.options, selectCount: Array.isArray(q.correct) ? q.correct.length : undefined, unit: !Array.isArray(q.correct) ? q.correct.unit : undefined };
  return reveal ? { ...base, correct: q.correct, rationale: q.rationale } : base;
}

interface AttemptRow { id: string; user_id: string; title: string; scope: string | null; mode: 'tutor' | 'exam'; timed: number; time_limit_sec: number | null; questions_json: string; answers_json: string; status: string; score: number | null; total: number; per_topic_json: string | null; duration_sec: number | null; started_at: number; finished_at: number | null }

export function createAttempt(userId: string, a: NewAttempt) {
  const db = getDb();
  const seed = a.seed || uid();
  let pool: ServedQuestion[];
  if (a.scope.retakeOf) {
    const prev = db.prepare('SELECT * FROM attempts WHERE id=? AND user_id=?').get(a.scope.retakeOf, userId) as AttemptRow | undefined;
    if (!prev) throw new Error('Attempt not found');
    const qs = JSON.parse(prev.questions_json) as ServedQuestion[];
    const ans = JSON.parse(prev.answers_json) as Record<string, Answer>;
    pool = qs.filter((q, i) => !gradeQuestion(q, ans[String(i)]));
    if (!pool.length) throw new Error('Nothing was missed in that test. Nice work!');
  } else pool = selectQuestions(userId, a.scope, a.count, seed);
  if (!pool.length) throw new Error('No questions match that selection yet.');
  const r = rng(seed + 'opt');
  const qs = pool.map((q) => shuffleOptions(q, r));
  const id = uid();
  const timeLimit = a.timed ? Math.round(qs.length * (qs.some((q) => q.type === 'numeric') ? 90 : 75)) : null;
  const title = a.title || (a.scope.retakeOf ? 'Retake: missed questions' : 'Practice test');
  db.prepare('INSERT INTO attempts(id,user_id,title,scope,mode,timed,time_limit_sec,questions_json,total,started_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
    .run(id, userId, title, JSON.stringify(a.scope), a.mode, a.timed ? 1 : 0, timeLimit, JSON.stringify(qs), qs.length, now());
  return getAttempt(userId, id)!;
}

export function getAttempt(userId: string, id: string) {
  const row = getDb().prepare('SELECT * FROM attempts WHERE id=? AND user_id=?').get(id, userId) as AttemptRow | undefined;
  if (!row) return null;
  const qs = JSON.parse(row.questions_json) as ServedQuestion[];
  const answers = JSON.parse(row.answers_json) as Record<string, Answer>;
  const finished = row.status === 'finished';
  const base = { id: row.id, title: row.title, mode: row.mode, timed: !!row.timed, timeLimitSec: row.time_limit_sec, status: row.status, total: row.total, startedAt: row.started_at, scope: row.scope ? JSON.parse(row.scope) : {} };
  if (finished) {
    const s = scoreAttempt(qs, answers);
    return { ...base, finishedAt: row.finished_at, durationSec: row.duration_sec, score: row.score, pct: s.pct, perTopic: s.perTopic, unanswered: s.unanswered,
      questions: qs.map((q, i) => ({ ...sanitize(q, true), yourAnswer: answers[String(i)] ?? null, isCorrect: s.results[i] })) };
  }
  return { ...base, answers, questions: qs.map((q, i) => {
    // tutor mode: once answered, reveal that question
    const reveal = row.mode === 'tutor' && answers[String(i)] !== undefined;
    return { ...sanitize(q, reveal), ...(reveal ? { isCorrect: gradeQuestion(q, answers[String(i)]) } : {}) };
  }) };
}

export function answerQuestion(userId: string, id: string, index: number, answer: Answer) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM attempts WHERE id=? AND user_id=?').get(id, userId) as AttemptRow | undefined;
  if (!row) throw new Error('Attempt not found');
  if (row.status === 'finished') throw new Error('This test is already finished.');
  const qs = JSON.parse(row.questions_json) as ServedQuestion[];
  const q = qs[index];
  if (!q) throw new Error('Bad question index');
  const answers = JSON.parse(row.answers_json) as Record<string, Answer>;
  if (row.mode === 'tutor' && answers[String(index)] !== undefined) throw new Error('Already answered in tutor mode.');
  answers[String(index)] = answer;
  db.prepare('UPDATE attempts SET answers_json=? WHERE id=?').run(JSON.stringify(answers), id);
  if (row.mode === 'tutor') return { saved: true, correct: gradeQuestion(q, answer), correctAnswer: q.correct, rationale: q.rationale };
  return { saved: true };
}

export function finishAttempt(userId: string, id: string, durationSec?: number, tz = 'UTC') {
  const db = getDb();
  const row = db.prepare('SELECT * FROM attempts WHERE id=? AND user_id=?').get(id, userId) as AttemptRow | undefined;
  if (!row) throw new Error('Attempt not found');
  if (row.status === 'finished') return { ...getAttempt(userId, id)!, xp: 0, newAchievements: [] as string[], alreadyFinished: true };
  const qs = JSON.parse(row.questions_json) as ServedQuestion[];
  const answers = JSON.parse(row.answers_json) as Record<string, Answer>;
  const s = scoreAttempt(qs, answers);
  const dur = Math.max(1, Math.round(durationSec ?? (now() - row.started_at) / 1000));
  const scope = row.scope ? JSON.parse(row.scope) as Scope : {};
  const xp = testXp(s.score, s.total);
  db.transaction(() => {
    db.prepare("UPDATE attempts SET status='finished', score=?, per_topic_json=?, duration_sec=?, finished_at=? WHERE id=?").run(s.score, JSON.stringify(s.perTopic), dur, now(), id);
    logAnswers(userId, qs.map((q, i) => ({ questionId: q.id, exam: q.exam, topic: q.topic, correct: s.results[i] })), 'test');
    const topicLabel = s.perTopic.length === 1 ? s.perTopic[0].topic : null;
    logActivity(userId, { kind: 'test', label: `${row.title}: ${s.score}/${s.total} (${s.pct}%)`, xp, minutes: Math.max(1, dur / 60), topic: topicLabel, meta: { attempt: id } });
  })();
  if (scope.program) completeProgramTask(userId, scope.program.programId, scope.program.taskId, s.pct, tz);
  const ach = checkAchievements(userId, tz);
  return { ...getAttempt(userId, id)!, xp, newAchievements: ach };
}

export function listAttempts(userId: string, limit = 30) {
  return getDb().prepare("SELECT id,title,mode,timed,status,score,total,duration_sec,started_at,finished_at FROM attempts WHERE user_id=? ORDER BY started_at DESC LIMIT ?").all(userId, limit);
}

export function practiceOptions(userId: string) {
  const db = getDb();
  const rows = db.prepare("SELECT exam, topic, COUNT(*) n FROM questions WHERE origin='premade' GROUP BY exam, topic ORDER BY exam, topic").all() as { exam: string; topic: string; n: number }[];
  const lectures = db.prepare("SELECT l.id, l.title, (SELECT COUNT(*) FROM questions q WHERE q.lecture_id=l.id) n FROM lectures l WHERE l.user_id=? AND l.status='ready' ORDER BY l.created_at DESC").all(userId) as { id: string; title: string; n: number }[];
  return { banks: rows, lectures: lectures.filter((l) => l.n > 0), drills: DRILL_KINDS, weakTopics: weakTopics(userId) };
}
