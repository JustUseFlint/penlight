import type { ServedQuestion } from './types';
import { gradeNumeric } from './dosage';

export type Answer = number[] | string | null | undefined;

/** Pure grading of one question. SATA is all-or-nothing (exact set match); numeric uses a tolerance. */
export function gradeQuestion(q: Pick<ServedQuestion, 'type' | 'correct'>, answer: Answer): boolean {
  if (answer === null || answer === undefined) return false;
  if (q.type === 'numeric') {
    if (typeof answer !== 'string' && typeof answer !== 'number') return false;
    return gradeNumeric(q.correct as { answer: number; tol?: number }, String(answer));
  }
  if (!Array.isArray(answer)) return false;
  const want = [...(q.correct as number[])].sort((a, b) => a - b);
  const got = [...new Set(answer)].sort((a, b) => a - b);
  return want.length === got.length && want.every((v, i) => v === got[i]);
}

export interface TopicScore { topic: string; correct: number; total: number; pct: number }
export interface Scored {
  score: number; total: number; pct: number;
  results: boolean[];
  perTopic: TopicScore[];
  unanswered: number;
}

export function scoreAttempt(questions: Pick<ServedQuestion, 'type' | 'correct' | 'topic'>[], answers: Record<string, Answer>): Scored {
  const results = questions.map((q, i) => gradeQuestion(q, answers[String(i)]));
  const map = new Map<string, { correct: number; total: number }>();
  questions.forEach((q, i) => {
    const t = map.get(q.topic) ?? { correct: 0, total: 0 };
    t.total += 1; if (results[i]) t.correct += 1;
    map.set(q.topic, t);
  });
  const score = results.filter(Boolean).length;
  return {
    score, total: questions.length, pct: questions.length ? Math.round((score / questions.length) * 100) : 0,
    results,
    perTopic: [...map.entries()].map(([topic, v]) => ({ topic, ...v, pct: Math.round((v.correct / v.total) * 100) })).sort((a, b) => a.pct - b.pct),
    unanswered: questions.filter((_, i) => answers[String(i)] === undefined || answers[String(i)] === null || (Array.isArray(answers[String(i)]) && (answers[String(i)] as number[]).length === 0)).length,
  };
}

/** XP for a finished test: 5 per correct, 10 for finishing, +15 for 80%+. */
export function testXp(score: number, total: number) {
  const pct = total ? score / total : 0;
  return score * 5 + 10 + (pct >= 0.8 && total >= 5 ? 15 : 0);
}

/** Fisher–Yates with a seeded RNG; remaps the correct indices so the answer key stays valid. */
export function shuffleOptions<T extends { options: string[]; correct: number[] | unknown }>(q: T, rnd: () => number): T {
  if (!Array.isArray(q.correct) || !q.options.length) return q;
  const idx = q.options.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  const correct = (q.correct as number[]).map((c) => idx.indexOf(c)).sort((a, b) => a - b);
  return { ...q, options: idx.map((i) => q.options[i]), correct };
}
