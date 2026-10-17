import { describe, it, expect } from 'vitest';
import { gradeQuestion, scoreAttempt, testXp, shuffleOptions } from '@/lib/scoring';
import { gradeNumeric } from '@/lib/dosage';

describe('grading', () => {
  it('MCQ exact match', () => {
    expect(gradeQuestion({ type: 'mcq', correct: [2] }, [2])).toBe(true);
    expect(gradeQuestion({ type: 'mcq', correct: [2] }, [1])).toBe(false);
    expect(gradeQuestion({ type: 'mcq', correct: [2] }, null)).toBe(false);
  });
  it('SATA is all-or-nothing', () => {
    const q = { type: 'sata' as const, correct: [0, 2, 3] };
    expect(gradeQuestion(q, [3, 0, 2])).toBe(true);
    expect(gradeQuestion(q, [0, 2])).toBe(false);
    expect(gradeQuestion(q, [0, 1, 2, 3])).toBe(false);
    expect(gradeQuestion(q, [0, 0, 2, 3])).toBe(true);
  });
  it('numeric uses tolerance and tolerates units/commas', () => {
    const q = { type: 'numeric' as const, correct: { answer: 12.5, tol: 0.05 } };
    expect(gradeQuestion(q, '12.5')).toBe(true);
    expect(gradeQuestion(q, '12.55')).toBe(true);
    expect(gradeQuestion(q, '13')).toBe(false);
    expect(gradeQuestion(q, 'abc')).toBe(false);
    expect(gradeNumeric({ answer: 1000 }, '1,000')).toBe(true);
  });
  it('scoreAttempt computes totals and per-topic breakdown sorted weakest first', () => {
    const qs = [
      { type: 'mcq' as const, correct: [0], topic: 'A' }, { type: 'mcq' as const, correct: [1], topic: 'A' },
      { type: 'sata' as const, correct: [0, 1], topic: 'B' }, { type: 'mcq' as const, correct: [3], topic: 'B' },
    ];
    const r = scoreAttempt(qs, { '0': [0], '1': [0], '2': [0, 1] });
    expect(r.score).toBe(2); expect(r.total).toBe(4); expect(r.pct).toBe(50);
    expect(r.unanswered).toBe(1);
    expect(r.perTopic.find((t) => t.topic === 'A')!.pct).toBe(50);
    expect(r.perTopic.find((t) => t.topic === 'B')!.pct).toBe(50);
    expect(r.results).toEqual([true, false, true, false]);
  });
  it('XP: 5/correct + 10 + 15 bonus at ≥80% with ≥5 questions', () => {
    expect(testXp(10, 10)).toBe(75); expect(testXp(4, 5)).toBe(45); expect(testXp(3, 4)).toBe(25); expect(testXp(0, 5)).toBe(10);
  });
  it('shuffleOptions remaps correct indices so the right answers stay right', () => {
    let seed = 3; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 50; i++) {
      const q = { options: ['a', 'b', 'c', 'd', 'e'], correct: [1, 3] };
      const s = shuffleOptions(q, rnd);
      expect(s.correct.map((c) => s.options[c]).sort()).toEqual(['b', 'd']);
      expect([...s.options].sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
    }
  });
});
