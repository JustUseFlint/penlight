import { rng } from './lite/text';
import type { ServedQuestion } from './types';

export type DrillKind = 'conversion' | 'oral' | 'weight' | 'iv-rate' | 'drip' | 'units' | 'safe-range';
export const DRILL_KINDS: { id: DrillKind; label: string }[] = [
  { id: 'conversion', label: 'Unit conversions' },
  { id: 'oral', label: 'Oral dosing' },
  { id: 'weight', label: 'Weight-based dosing' },
  { id: 'iv-rate', label: 'IV pump rates (mL/hr)' },
  { id: 'drip', label: 'Gravity drip rates (gtt/min)' },
  { id: 'units', label: 'Units-per-hour infusions' },
  { id: 'safe-range', label: 'Safe dose range' },
];

const pick = <T,>(r: () => number, a: T[]) => a[Math.floor(r() * a.length)];
const int = (r: () => number, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
const round = (x: number, d: number) => Math.round(x * 10 ** d) / 10 ** d;
const fmt = (x: number) => String(round(x, 4));

/** One numeric problem with a programmatically computed answer and a worked solution. For education only. */
export function makeProblem(kind: DrillKind, seed: string): ServedQuestion {
  const r = rng(seed);
  const base = { id: `dosage:${kind}:${seed}`, type: 'numeric' as const, exam: 'dosage', topic: 'Dosage Calculation', options: [] as string[], difficulty: 2 };
  switch (kind) {
    case 'conversion': {
      const v = pick(r, [
        () => { const g = pick(r, [0.25, 0.5, 0.75, 1.5, 2.5, 4]); return { stem: `Convert ${g} g to mg.`, ans: g * 1000, unit: 'mg', work: `${g} g × 1,000 mg/g = ${fmt(g * 1000)} mg.` }; },
        () => { const mg = pick(r, [0.2, 0.4, 0.6, 0.8, 1.2, 2.5]); return { stem: `Convert ${mg} mg to mcg.`, ans: mg * 1000, unit: 'mcg', work: `${mg} mg × 1,000 mcg/mg = ${fmt(mg * 1000)} mcg.` }; },
        () => { const mcg = pick(r, [250, 500, 750, 125, 50]); return { stem: `Convert ${mcg} mcg to mg.`, ans: mcg / 1000, unit: 'mg', work: `${mcg} mcg ÷ 1,000 = ${fmt(mcg / 1000)} mg.` }; },
        () => { const ml = pick(r, [250, 500, 750, 1500, 2000]); return { stem: `Convert ${ml} mL to L.`, ans: ml / 1000, unit: 'L', work: `${ml} mL ÷ 1,000 = ${fmt(ml / 1000)} L.` }; },
        () => { const kg = int(r, 12, 90); const lb = round(kg * 2.2, 1); return { stem: `A client weighs ${lb} lb. What is the weight in kg? (1 kg = 2.2 lb)`, ans: kg, unit: 'kg', work: `${lb} lb ÷ 2.2 lb/kg = ${kg} kg.` }; },
        () => { const t = int(r, 2, 6); return { stem: `How many mL are in ${t} teaspoons? (1 tsp = 5 mL)`, ans: t * 5, unit: 'mL', work: `${t} tsp × 5 mL/tsp = ${t * 5} mL.` }; },
      ])();
      return { ...base, stem: v.stem, correct: { answer: v.ans, unit: v.unit, tol: 0.001 }, rationale: v.work };
    }
    case 'oral': {
      if (r() < 0.5) {
        const tab = pick(r, [25, 50, 100, 250, 500]);
        const n = pick(r, [1, 1.5, 2, 3]);
        const order = tab * n;
        return { ...base, stem: `The order reads ${order} mg by mouth. Available: ${tab} mg per tablet. How many tablets will you give?`, correct: { answer: n, unit: 'tablets', tol: 0.01 }, rationale: `${order} mg × (1 tablet / ${tab} mg) = ${n} tablets.` };
      }
      const per = pick(r, [(125), 250, 100, 200]);
      const perMl = pick(r, [5, 5, 10, 2]);
      const order = pick(r, [0.5, 1, 1.5, 2, 2.5]) * per;
      const ans = round((order * perMl) / per, 1);
      return { ...base, stem: `The order reads ${order} mg by mouth. The label reads ${per} mg per ${perMl} mL. How many mL will you give? (Round to the nearest tenth.)`, correct: { answer: ans, unit: 'mL', tol: 0.051 }, rationale: `${order} mg × (${perMl} mL / ${per} mg) = ${fmt((order * perMl) / per)} mL → ${ans} mL.` };
    }
    case 'weight': {
      const kg = int(r, 8, 80);
      const lb = round(kg * 2.2, 1);
      const per = pick(r, [2, 3, 4, 5, 10, 15]);
      const useLb = r() < 0.6;
      return {
        ...base,
        stem: `The order is ${per} mg/kg per dose. The client weighs ${useLb ? `${lb} lb` : `${kg} kg`}. How many mg per dose? (Convert pounds to kg using 2.2 lb = 1 kg.)`,
        correct: { answer: per * kg, unit: 'mg', tol: 0.5 },
        rationale: `${useLb ? `${lb} lb ÷ 2.2 = ${kg} kg. ` : ''}${kg} kg × ${per} mg/kg = ${per * kg} mg.`,
      };
    }
    case 'iv-rate': {
      const vol = pick(r, [100, 250, 500, 1000]);
      const hrs = pick(r, [0.5, 1, 2, 4, 5, 8, 10]);
      const ans = round(vol / hrs, 1);
      return { ...base, stem: `Infuse ${vol} mL over ${hrs === 0.5 ? '30 minutes' : `${hrs} hour${hrs === 1 ? '' : 's'}`} using an IV pump. What rate in mL/hr? (Round to the nearest tenth.)`, correct: { answer: ans, unit: 'mL/hr', tol: 0.051 }, rationale: `mL/hr = ${vol} mL ÷ ${hrs} hr = ${ans} mL/hr.` };
    }
    case 'drip': {
      const vol = pick(r, [250, 500, 1000, 100, 50]);
      const hrs = pick(r, [1, 2, 3, 4, 6, 8]);
      const df = pick(r, [10, 15, 20, 60]);
      const raw = (vol * df) / (hrs * 60);
      const ans = Math.round(raw);
      return { ...base, difficulty: 3, stem: `Infuse ${vol} mL over ${hrs} hour${hrs === 1 ? '' : 's'} by gravity. The drop factor is ${df} gtt/mL. What is the rate in gtt/min? (Round to the nearest whole drop.)`, correct: { answer: ans, unit: 'gtt/min', tol: 0.5 }, rationale: `gtt/min = (${vol} mL × ${df} gtt/mL) ÷ ${hrs * 60} min = ${fmt(raw)} → ${ans} gtt/min.` };
    }
    case 'units': {
      const units = pick(r, [20000, 25000, 25000, 40000]);
      const bag = pick(r, [250, 500]);
      const conc = units / bag;
      const order = pick(r, [600, 800, 900, 1000, 1200, 1500]);
      const ans = round(order / conc, 1);
      return { ...base, difficulty: 3, stem: `A heparin infusion bag contains ${units.toLocaleString()} units in ${bag} mL. The order is ${order} units/hr. What pump rate in mL/hr? (Round to the nearest tenth.)`, correct: { answer: ans, unit: 'mL/hr', tol: 0.051 }, rationale: `Concentration = ${units.toLocaleString()} ÷ ${bag} = ${conc} units/mL. Rate = ${order} ÷ ${conc} = ${fmt(order / conc)} → ${ans} mL/hr. (Educational drill; real heparin doses are verified with a second nurse.)` };
    }
    case 'safe-range': {
      const kg = int(r, 10, 40);
      const hi = pick(r, [10, 15, 20, 25]);
      const lo = hi - 5;
      return { ...base, difficulty: 3, stem: `The safe single-dose range is ${lo} to ${hi} mg/kg. The child weighs ${kg} kg. What is the MAXIMUM safe single dose in mg?`, correct: { answer: hi * kg, unit: 'mg', tol: 0.5 }, rationale: `Maximum = ${hi} mg/kg × ${kg} kg = ${hi * kg} mg. (Minimum would be ${lo * kg} mg.)` };
    }
  }
}

export function makeDrill(kinds: DrillKind[], n: number, seed: string): ServedQuestion[] {
  const out: ServedQuestion[] = [];
  const r = rng(seed);
  for (let i = 0; i < n; i++) out.push(makeProblem(kinds[i % kinds.length], `${seed}-${i}-${Math.floor(r() * 1e6)}`));
  return out;
}

export function gradeNumeric(spec: { answer: number; tol?: number }, input: string): boolean {
  const x = Number(String(input).replace(/,/g, '').trim());
  if (!Number.isFinite(x)) return false;
  return Math.abs(x - spec.answer) <= (spec.tol ?? 0.01) + 1e-9;
}
