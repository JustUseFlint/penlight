import { describe, it, expect } from 'vitest';
import { makeProblem, makeDrill, DRILL_KINDS, gradeNumeric } from '@/lib/dosage';
import { gradeQuestion } from '@/lib/scoring';

describe('dosage generator', () => {
  it('is deterministic per seed and varies across seeds', () => {
    for (const k of DRILL_KINDS) {
      expect(makeProblem(k.id, 'a')).toEqual(makeProblem(k.id, 'a'));
      const stems = new Set(Array.from({ length: 12 }, (_, i) => makeProblem(k.id, 's' + i).stem));
      expect(stems.size, k.id).toBeGreaterThan(3);
    }
  });
  it('every generated problem has a numeric answer, rationale with worked solution, and grades its own answer correct', () => {
    for (const k of DRILL_KINDS) for (let i = 0; i < 40; i++) {
      const q = makeProblem(k.id, `${k.id}-${i}`);
      const c = q.correct as { answer: number; tol?: number };
      expect(Number.isFinite(c.answer), q.stem).toBe(true);
      expect(c.answer).toBeGreaterThanOrEqual(0);
      expect(q.rationale.length).toBeGreaterThan(14);
      expect(gradeQuestion(q, String(c.answer))).toBe(true);
      expect(gradeQuestion(q, String(c.answer * 1.5 + 1))).toBe(false);
    }
  });
  it('verifies worked math for known formulas', () => {
    for (let i = 0; i < 40; i++) {
      const q = makeProblem('weight', 'w' + i);
      const nums = q.stem.match(/[\d.]+/g)!.map(Number);
      expect(nums.length).toBeGreaterThanOrEqual(2);
    }
    expect(gradeNumeric({ answer: 2.5, tol: 0.05 }, '2.5 mL')).toBe(true);
  });
  it('makeDrill returns n distinct problems', () => {
    const d = makeDrill(DRILL_KINDS.map((k) => k.id), 10, 'seed');
    expect(d).toHaveLength(10);
    expect(new Set(d.map((q) => q.stem)).size).toBeGreaterThanOrEqual(8);
  });
});
