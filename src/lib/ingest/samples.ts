import fs from 'node:fs';
import path from 'node:path';
import type { Segment } from './parse';

export interface SampleLecture {
  slug: string;
  title: string;
  channel: string;
  file: string;
  blurb: string;
  topic: string;
}

export const SAMPLES: SampleLecture[] = [
  { slug: 'cardiac-conduction', title: 'Cardiac Conduction & Dysrhythmias', channel: 'Penlight sample lecture', file: 'cardiac-conduction-dysrhythmias.txt', blurb: 'SA node to Purkinje fibers, reading a rhythm strip, lethal rhythms, and heart blocks.', topic: 'Cardiovascular' },
  { slug: 'medication-safety', title: 'Pharmacology Basics & Medication Safety', channel: 'Penlight sample lecture', file: 'pharmacology-medication-safety.txt', blurb: 'Pharmacokinetics, key vocabulary, the rights of administration, and high-alert drugs.', topic: 'Pharmacology' },
  { slug: 'potassium-sodium', title: 'Fluids & Electrolytes: Potassium and Sodium Imbalances', channel: 'Penlight sample lecture', file: 'fluid-electrolytes-potassium-sodium.txt', blurb: 'Tonicity, hyponatremia, hypernatremia, hypokalemia, and hyperkalemia.', topic: 'Fluids & Electrolytes' },
];

/** Turns plain lecture prose into caption-like segments with plausible timestamps (≈150 wpm). */
export function textToSegments(text: string, wordsPerSec = 2.6, chunk = 14): Segment[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' ');
  const segs: Segment[] = [];
  for (let i = 0; i < words.length; i += chunk) segs.push({ start: Math.round((i / wordsPerSec) * 100) / 100, text: words.slice(i, i + chunk).join(' ') });
  return segs;
}

export function loadSample(slug: string): { sample: SampleLecture; segments: Segment[]; durationSec: number } {
  const sample = SAMPLES.find((s) => s.slug === slug);
  if (!sample) throw new Error('Unknown sample');
  const dir = process.env.SAMPLES_DIR || path.join(process.cwd(), 'samples');
  const text = fs.readFileSync(path.join(dir, sample.file), 'utf8');
  const segments = textToSegments(text);
  const words = text.split(/\s+/).length;
  return { sample, segments, durationSec: Math.round(words / 2.6) };
}
