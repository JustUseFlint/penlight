import { describe, it, expect } from 'vitest';
import { schedule, NEW_STATE, DAY, type CardState, type Grade } from '@/lib/srs';

const T0 = 1_700_000_000_000;
describe('SM-2 scheduler', () => {
  it('Again relearns in 10 minutes, resets reps, lowers ease, counts lapse', () => {
    const r = schedule({ ease: 2.5, interval_days: 10, reps: 4, lapses: 0 }, 0, T0);
    expect(r.due_at).toBe(T0 + 10 * 60_000);
    expect(r.reps).toBe(0); expect(r.lapses).toBe(1); expect(r.ease).toBeCloseTo(2.3);
  });
  it('ease never drops below 1.3', () => {
    let s: CardState = { ...NEW_STATE };
    for (let i = 0; i < 20; i++) { const r = schedule(s, 0, T0); s = r; }
    expect(s.ease).toBe(1.3);
  });
  it('first reviews: Good → 1 day then 6 days', () => {
    const a = schedule(NEW_STATE, 2, T0);
    expect(a.interval_days).toBe(1); expect(a.due_at).toBe(T0 + DAY);
    const b = schedule(a, 2, T0 + DAY);
    expect(b.interval_days).toBe(6);
  });
  it('Easy grows faster than Good, Hard slower', () => {
    const base: CardState = { ease: 2.5, interval_days: 6, reps: 2, lapses: 0 };
    const h = schedule(base, 1, T0).interval_days, g = schedule(base, 2, T0).interval_days, e = schedule(base, 3, T0).interval_days;
    expect(h).toBeLessThan(g); expect(g).toBeLessThan(e);
  });
  it('simulated 60 days of always-Good reviews gives monotonically increasing intervals', () => {
    let s: CardState & { due_at?: number } = { ...NEW_STATE }; let now = T0; const ints: number[] = [];
    for (let i = 0; i < 8; i++) { const r = schedule(s, 2, now); ints.push(r.interval_days); s = r; now = r.due_at; }
    for (let i = 1; i < ints.length; i++) expect(ints[i]).toBeGreaterThan(ints[i - 1]);
    expect(ints[0]).toBe(1); expect(ints[1]).toBe(6);
  });
  it('a lapse after maturity returns the card to short intervals, then recovers', () => {
    let s: CardState = { ease: 2.5, interval_days: 30, reps: 5, lapses: 0 };
    s = schedule(s, 0, T0);
    expect(s.interval_days).toBe(0);
    const r = schedule(s, 2, T0 + 600_000);
    expect(r.interval_days).toBe(1);
  });
  it('every grade sequence keeps state valid (fuzz)', () => {
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    let s: CardState = { ...NEW_STATE }; let now = T0;
    for (let i = 0; i < 500; i++) {
      const g = Math.floor(rnd() * 4) as Grade; const r = schedule(s, g, now);
      expect(r.ease).toBeGreaterThanOrEqual(1.3); expect(r.interval_days).toBeGreaterThanOrEqual(0); expect(r.due_at).toBeGreaterThan(now);
      s = r; now = r.due_at;
    }
  });
});
