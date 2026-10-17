import { z } from 'zod';
import type { Segment } from '../ingest/parse';
import { fmtTime } from '../ingest/parse';
import { cleanText, toSentences } from '../lite/text';
import type { GenCard, GenQuestion, Guide, StudyOutput } from '../types';
import { chat, extractJson, type ChatMsg } from './client';
import type { LlmConfig } from './config';

const SYSTEM = `You are an expert nurse educator (NCLEX-RN and TEAS preparation) building study materials from a lecture transcript.
Rules: be accurate and use only well-established, textbook-level nursing facts. Base content on the transcript; you may add standard nursing context (e.g. nursing process, priority actions, safety) but never invent lecture statements. If the lecture contradicts standard references, note it gently in the relevant item. Avoid patient-specific dosing advice. Reply with ONE JSON object only, no prose.`;

export function transcriptForPrompt(segments: Segment[], maxWords = 9000): { text: string; words: number } {
  const sents = toSentences(segments);
  let out = '';
  let lastMark = -999;
  for (const s of sents) {
    if (s.start >= 0 && s.start - lastMark >= 45) {
      out += `\n[${fmtTime(s.start)}] `;
      lastMark = s.start;
    }
    out += s.text + ' ';
  }
  const w = out.split(/\s+/).length;
  return { text: out.trim(), words: w };
}

const num = z.coerce.number();
const GuideSchema = z.object({
  topic: z.string().default('General Nursing'),
  overview: z.string().min(10),
  objectives: z.array(z.string()).default([]),
  sections: z.array(z.object({
    heading: z.string(),
    start_seconds: num.optional(),
    points: z.array(z.object({ text: z.string(), start_seconds: num.optional(), must_know: z.boolean().optional() })).default([]),
    terms: z.array(z.string()).default([]),
  })).min(1),
  glossary: z.array(z.object({ term: z.string(), definition: z.string(), start_seconds: num.optional() })).default([]),
  must_know: z.array(z.string()).default([]),
  nursing_considerations: z.array(z.object({ title: z.string(), items: z.array(z.string()) })).default([]),
  mnemonics: z.array(z.object({ name: z.string(), text: z.string() })).default([]),
  quick_review: z.array(z.string()).default([]),
});
const CardsSchema = z.object({
  flashcards: z.array(z.object({ type: z.enum(['term', 'qa', 'cloze']), front: z.string(), back: z.string().default(''), topic: z.string().optional(), mnemonic: z.string().optional() })).default([]),
  true_false: z.array(z.object({ statement: z.string(), answer: z.boolean(), explanation: z.string() })).default([]),
  sequences: z.array(z.object({ title: z.string(), steps: z.array(z.string()).min(3) })).default([]),
});
const QuestionsSchema = z.object({
  questions: z.array(z.object({
    type: z.enum(['mcq', 'sata']),
    stem: z.string(),
    options: z.array(z.string()),
    correct: z.array(z.coerce.number()),
    rationale: z.string(),
    topic: z.string().optional(),
    difficulty: z.coerce.number().optional(),
  })),
});

const s2 = (n?: number) => (n !== undefined && Number.isFinite(n) && n >= 0 ? n : undefined);

async function askJson<T>(cfg: LlmConfig, schema: z.ZodType<T, z.ZodTypeDef, unknown>, user: string, maxTokens = 7000): Promise<T> {
  const messages: ChatMsg[] = [{ role: 'system', content: SYSTEM }, { role: 'user', content: user }];
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await chat(cfg, attempt ? [...messages, { role: 'user', content: 'Your previous reply was not valid for the required JSON shape. Reply again with ONLY the corrected JSON object.' }] : messages, { json: true, maxTokens });
    try {
      return schema.parse(extractJson(raw));
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(`The AI reply could not be parsed (${(lastErr as Error).message.slice(0, 120)}).`);
}

/** Long lectures are first condensed chunk-by-chunk into detailed notes so the prompt stays within context. */
async function condense(cfg: LlmConfig, text: string, onStep?: (m: string) => void): Promise<string> {
  const words = text.split(/\s+/);
  if (words.length <= 9000) return text;
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += 6000) chunks.push(words.slice(i, i + 6000).join(' '));
  const notes: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    onStep?.(`Condensing part ${i + 1} of ${chunks.length}`);
    const out = await chat(cfg, [
      { role: 'system', content: 'You condense lecture transcripts into dense, accurate study notes. Keep every definition, value, step order, drug name, priority action and warning. Keep [mm:ss] timestamps at the start of each note. Plain text bullets only.' },
      { role: 'user', content: chunks[i] },
    ], { maxTokens: 3500 });
    notes.push(out);
  }
  return notes.join('\n');
}

export function validateQuestion(q: z.infer<typeof QuestionsSchema>['questions'][number]): GenQuestion | null {
  const options = q.options.map((o) => o.trim()).filter(Boolean);
  if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) return null;
  const correct = [...new Set(q.correct)].filter((i) => Number.isInteger(i) && i >= 0 && i < options.length).sort((a, b) => a - b);
  if (q.type === 'mcq') {
    if (options.length < 3 || options.length > 6 || correct.length !== 1) return null;
  } else if (options.length < 5 || options.length > 7 || correct.length < 2 || correct.length > options.length - 2) return null;
  if (!q.stem.trim() || !q.rationale.trim()) return null;
  return { type: q.type, stem: q.stem.trim(), options, correct, rationale: q.rationale.trim(), topic: (q.topic || 'General').trim(), difficulty: Math.min(3, Math.max(1, Math.round(q.difficulty || 2))) };
}

export async function buildAi(cfg: LlmConfig, segments: Segment[], meta: { title?: string; durationSec?: number | null }, onStep?: (m: string, pct: number) => void): Promise<StudyOutput> {
  const { text: raw } = transcriptForPrompt(segments);
  const text = await condense(cfg, raw, (m) => onStep?.(m, 0.1));
  const header = `Lecture title: ${meta.title || 'Untitled'}\nTranscript (with [mm:ss] markers):\n${text}`;

  onStep?.('Writing the study guide', 0.2);
  const g = await askJson(cfg, GuideSchema, `${header}\n\nCreate a study guide as JSON with keys: topic (short nursing category), overview (2-3 sentences), objectives (4-6 measurable learning objectives), sections (4-8; each {heading, start_seconds (number or null), points:[{text, start_seconds, must_know:boolean}], terms:[...]}), glossary ([{term, definition, start_seconds}] 10-25 key terms with concise accurate definitions), must_know (3-6 high-yield one-sentence callouts), nursing_considerations ([{title, items:[priority actions, assessments, safety, teaching]}] 2-4 groups, nursing-process framed), mnemonics ([{name, text}] 2-5 accurate memory aids), quick_review (6-10 bullet sentences).`);

  onStep?.('Making flashcards and games', 0.5);
  const c = await askJson(cfg, CardsSchema, `${header}\n\nCreate JSON with keys: flashcards (24-40 cards; mix of type 'term' (front term, back definition), 'qa' (front question, back concise answer), and 'cloze' (front contains one {{c1::answer}} blank, back = short extra explanation or empty); optional 'topic' and 'mnemonic'), true_false (12-16 items {statement, answer:boolean, explanation}; make false statements plausible but clearly wrong per the lecture), sequences (1-3 items {title, steps:[3-6 short steps in correct order]}) for processes or priority orders actually taught.`);

  onStep?.('Writing practice questions', 0.75);
  const q = await askJson(cfg, QuestionsSchema, `${header}\n\nCreate 14-20 NCLEX-style practice questions as JSON {"questions":[{type:"mcq"|"sata", stem, options, correct:[zero-based indexes], rationale, topic, difficulty:1-3}]}. mcq: 4 options, exactly one correct. sata (select all that apply, about 3-4 of them): 5-6 options, 2-4 correct. Prioritize application and analysis (priority actions, what to do first, which finding needs follow-up) over pure recall. Every rationale must explain why the correct answer is right and why the key distractors are wrong. Options must be distinct and plausible.`);

  const questions = q.questions.map(validateQuestion).filter((x): x is GenQuestion => !!x);
  if (questions.length < 4) throw new Error('The AI returned too few valid questions.');

  const guide: Guide = {
    mode: 'ai',
    topic: g.topic,
    overview: g.overview,
    objectives: g.objectives,
    sections: g.sections.map((s) => ({
      heading: s.heading,
      start: s2(s.start_seconds),
      points: s.points.map((p) => ({ text: p.text, start: s2(p.start_seconds), mustKnow: p.must_know })),
      terms: s.terms,
    })),
    glossary: g.glossary.map((x) => ({ term: x.term, definition: x.definition, start: s2(x.start_seconds) })),
    mustKnow: g.must_know.map((t) => ({ text: t, mustKnow: true })),
    nursingConsiderations: g.nursing_considerations,
    mnemonics: g.mnemonics,
    quickReview: g.quick_review,
    games: { tf: c.true_false, sequences: c.sequences },
    stats: { words: raw.split(/\s+/).length, sentences: 0, sections: g.sections.length, terms: g.glossary.length },
  };
  const cards: GenCard[] = c.flashcards
    .filter((x) => x.front.trim() && (x.type === 'cloze' ? /\{\{c1::.+?\}\}/.test(x.front) : x.back.trim()))
    .map((x) => ({ type: x.type, front: x.front.trim(), back: x.back.trim(), topic: x.topic || g.topic, mnemonic: x.mnemonic }));
  if (cards.length < 6) throw new Error('The AI returned too few valid flashcards.');
  void cleanText;
  return { guide, cards, questions };
}
