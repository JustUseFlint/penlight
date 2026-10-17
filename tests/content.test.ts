import { describe, it, expect } from 'vitest';
import { loadContent } from '@/lib/content/load';
import { PROGRAMS, programDays, requiredTasks } from '@/lib/content/programs';

const { questions, cards, lessons } = loadContent();
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

describe('premade question bank validity', () => {
  it('has at least 250 vetted questions', () => { expect(questions.length).toBeGreaterThanOrEqual(250); });
  it('every question has a rationale, ≥4 options, valid correct indices', () => {
    for (const q of questions) {
      expect(q.rationale.length, q.stem).toBeGreaterThanOrEqual(12);
      expect(q.options.length, q.stem).toBeGreaterThanOrEqual(4);
      expect(q.correct.length, q.stem).toBeGreaterThanOrEqual(1);
      for (const c of q.correct) { expect(c).toBeGreaterThanOrEqual(0); expect(c).toBeLessThan(q.options.length); }
    }
  });
  it('MCQ has exactly one correct; SATA has ≥2 correct and at least one incorrect', () => {
    for (const q of questions) {
      if (q.type === 'mcq') expect(q.correct.length, q.stem).toBe(1);
      else { expect(q.correct.length, q.stem).toBeGreaterThanOrEqual(2); expect(q.options.length - q.correct.length, q.stem).toBeGreaterThanOrEqual(1); }
    }
  });
  it('no duplicate options within a question', () => {
    for (const q of questions) { const set = new Set(q.options.map(norm)); expect(set.size, q.stem).toBe(q.options.length); }
  });
  it('no duplicate stems across the bank', () => {
    const seen = new Map<string, string>();
    for (const q of questions) { const k = norm(q.stem); expect(seen.has(k), `dup: ${q.stem}`).toBe(false); seen.set(k, q.stem); }
  });
  it('no "all of the above"/"none of the above" shortcuts', () => {
    for (const q of questions) for (const o of q.options) expect(/^(all|none) of the above$/i.test(o.trim()), q.stem).toBe(false);
  });
  it('brand names are not used as drug names (generic names only)', () => {
    const brands = /\b(Lasix|Coumadin|Lanoxin|Zofran|Tylenol|Advil|Motrin|Lipitor|Zocor|Norvasc|Synthroid|Prilosec|Nexium|Glucophage|Xanax|Valium|Ativan|Narcan|Plavix|Zestril|Lopressor|Toprol|Cardizem|Humulin|Novolin|Lantus|Eliquis|Xarelto|Percocet|Vicodin|Demerol|Benadryl|Pepcid|Zantac|Cipro|Keflex|Augmentin|Bactrim|Flagyl|Prozac|Zoloft|Lexapro)\b/i;
    for (const q of questions) expect(brands.test(q.stem + q.options.join(' ') + q.rationale), q.stem).toBe(false);
    for (const c of cards) expect(brands.test(c.front + c.back), c.front).toBe(false);
  });
});

describe('cards', () => {
  it('has ≥300 cards, none empty, no duplicate fronts within a deck', () => {
    expect(cards.length).toBeGreaterThanOrEqual(300);
    const seen = new Set<string>();
    for (const c of cards) {
      expect(c.front.trim().length).toBeGreaterThan(1); expect(c.back.trim().length).toBeGreaterThan(1);
      const k = c.deck + '|' + norm(c.front); expect(seen.has(k), `dup card ${k}`).toBe(false); seen.add(k);
    }
  });
});

describe('lessons & programs integrity', () => {
  it('every lesson has body text, and every lesson tag has ≥2 questions', () => {
    const qTags = new Map<string, number>();
    for (const q of questions) qTags.set(q.tag, (qTags.get(q.tag) || 0) + 1);
    for (const l of lessons.values()) {
      expect(l.body.length, l.id).toBeGreaterThan(200);
      expect(qTags.get(l.id) || 0, `questions for ${l.id}`).toBeGreaterThanOrEqual(l.id.startsWith('DM') ? 0 : 2);
    }
  });
  it('programs have unique ids, unique task ids and valid lesson references', () => {
    expect(PROGRAMS.length).toBeGreaterThanOrEqual(8);
    const ids = new Set<string>();
    for (const p of PROGRAMS) {
      expect(ids.has(p.id)).toBe(false); ids.add(p.id);
      const days = programDays(p);
      expect(days.length).toBeGreaterThanOrEqual(10);
      const taskIds = new Set<string>();
      for (const d of days) {
        expect(requiredTasks(d).length, `${p.id} day ${d.day}`).toBeGreaterThan(0);
        for (const t of d.tasks) {
          expect(taskIds.has(t.id), t.id).toBe(false); taskIds.add(t.id);
          for (const tg of t.tags ?? []) expect(lessons.has(tg), `${p.id}:${t.id} tag ${tg}`).toBe(true);
          if (t.kind === 'lesson') expect(lessons.has(t.lesson as string), `${p.id}:${t.id}`).toBe(true);
        }
      }
    }
  });
  it('program families required by the brief exist', () => {
    const ids = PROGRAMS.map((p) => p.id);
    for (const need of ['teas-6w', 'teas-3w', 'nclex-8w', 'core-ap', 'core-pharm', 'core-medsurg', 'core-fund', 'dosage-2w']) expect(ids).toContain(need);
  });
});
