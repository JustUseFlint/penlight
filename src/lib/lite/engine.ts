import type { Segment } from '../ingest/parse';
import { fmtTime } from '../ingest/parse';
import type { GenCard, GenQuestion, Guide, GuideSection, StudyOutput, GlossaryEntry } from '../types';
import { CUE, detectTerms, dominantCategory, extractDefinitions, rankSentences, type Definition, type Term } from './extract';
import { GLOSSARY_MAP } from './glossary';
import { capFirst, cosine, rng, shuffle, tfidfVectors, titleCase, toSentences, type Sentence } from './text';

export interface LiteMeta { title?: string; durationSec?: number | null; seed?: string }

const HEADING =
  /(?:let'?s|we'?ll|i'?ll|we are going to|we're going to|going to|now|next|moving on|let us)[^.?!]{0,30}?\b(?:talk about|talk through|discuss|cover|look at|take a look at|move on to|turn (?:our attention )?to|focus on|start with|begin with|go over|review|dive into|finish with|walk through|break down|compare)\s+(?:the\s+|how\s+)?([^.,;:!?]{3,60})/i;

const shortWords = (s: string, n: number) => {
  const w = s.replace(/[.!]+$/, '').split(/\s+/);
  if (w.length <= n) return s.replace(/[.!]*$/, '.');
  let cut = w.slice(0, n).join(' ');
  const comma = cut.search(/[,;]\s+[^,;]*$/);
  if (comma > cut.length * 0.5) cut = cut.slice(0, comma);
  return cut.replace(/[,;:\s]+$/, '') + '…';
};

const fmtTerm = (t: string) => t;
const inline = (t: string) => (/[A-Z]{2,}|[A-Z]/.test(t.slice(1)) || /^(?:Cushing|Chvostek|Trousseau|Graves|Hashimoto|Addison|Parkinson|Alzheimer|Crohn|Braden|Kussmaul|Babinski|Kernig|Brudzinski|Glasgow|Erikson|Piaget|Maslow|Wenckebach|Mobitz)/.test(t) ? t : t.toLowerCase());
const termForTitle = (t: string) => (/[A-Z]{2,}/.test(t) || /[A-Z]/.test(t.slice(1)) ? t : titleCase(t));

function segmentSections(sents: Sentence[], target: number): number[] {
  const n = sents.length;
  if (n < 12 || target < 2) return [0];
  const minDist = Math.max(6, Math.floor(n / (target * 1.8)));
  // 1) Prefer the instructor's own transitions ("Let's talk about …")
  const cues: number[] = [];
  sents.forEach((s, i) => {
    const m = s.text.match(HEADING);
    if (!m || m[1].split(/\s+/).length > 7 || i < 3) return;
    if (!cues.length || i - cues[cues.length - 1] >= minDist) cues.push(i);
  });
  if (cues.length >= 2 && cues.length <= 11) {
    const bounds = [0, ...cues.filter((c) => c >= minDist * 0.6)];
    // merge a too-small tail
    if (n - bounds[bounds.length - 1] < minDist * 0.5 && bounds.length > 2) bounds.pop();
    return bounds;
  }
  // 2) Otherwise TextTiling-lite: split where adjacent windows are least similar
  const vecs = tfidfVectors(sents.map((s) => s.tokens));
  const k = Math.max(3, Math.min(7, Math.floor(n / (target * 3))));
  const sum = (a: number, b: number) => {
    const m = new Map<string, number>();
    for (let i = Math.max(0, a); i < Math.min(n, b); i++) for (const [t, v] of vecs[i]) m.set(t, (m.get(t) || 0) + v);
    return m;
  };
  const gaps: { i: number; sim: number }[] = [];
  for (let i = k; i <= n - k; i++) gaps.push({ i, sim: cosine(sum(i - k, i), sum(i, i + k)) });
  const picked: number[] = [0];
  for (const g of [...gaps].sort((a, b) => a.sim - b.sim)) {
    if (picked.length >= target) break;
    if (picked.every((p) => Math.abs(p - g.i) >= minDist) && n - g.i >= minDist * 0.7) picked.push(g.i);
  }
  return picked.sort((a, b) => a - b);
}

function sectionHeading(sents: Sentence[], from: number, to: number, terms: Term[], used: Set<string>): string {
  for (let i = from; i < Math.min(to, from + 5); i++) {
    const m = sents[i].text.match(HEADING);
    if (m) {
      let h = m[1].replace(/\b(?:itself|now|first|next|today|here|in detail|quickly)\b$/i, '').replace(/^(?:the\s+|to\s+)/i, '').trim();
      if (h.split(/\s+/).length <= 7 && h.length >= 4) {
        h = capFirst(termForTitle(h));
        if (!used.has(h.toLowerCase())) { used.add(h.toLowerCase()); return h; }
      }
    }
  }
  const sec = new Map<string, number>();
  for (const t of terms) {
    const c = t.sentenceIdxs.filter((x) => x >= from && x < to).length;
    if (c) sec.set(t.term, c * (1 + 0.2 * (t.lower.split(' ').length - 1)) + t.score * 0.02);
  }
  const top = [...sec.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([t]) => termForTitle(t));
  let h = top.length === 2 ? `${top[0]} & ${top[1]}` : top[0] || `Part ${used.size + 1}`;
  while (used.has(h.toLowerCase())) h += ' (cont.)';
  used.add(h.toLowerCase());
  return h;
}

function pickDistractors<T extends { lower?: string; category?: string }>(pool: T[], correct: T, avoid: string, n: number, r: () => number, textOf: (x: T) => string, sameOnly = false): T[] {
  const avoidLow = avoid.toLowerCase();
  const cTokens = new Set(textOf(correct).toLowerCase().split(/\W+/).filter((w) => w.length > 3));
  const eligible = pool.filter((p) => {
    if (p === correct) return false;
    const t = textOf(p).toLowerCase();
    if (t === textOf(correct).toLowerCase()) return false;
    if (avoidLow.includes(t)) return false;
    if (t.includes(textOf(correct).toLowerCase()) || textOf(correct).toLowerCase().includes(t)) return false;
    const overlap = t.split(/\W+/).filter((w) => w.length > 3 && cTokens.has(w)).length;
    return overlap === 0;
  });
  const same = shuffle(eligible.filter((p) => p.category && p.category === correct.category), r);
  const rest = shuffle(eligible.filter((p) => !(p.category && p.category === correct.category)), r);
  const out: T[] = [];
  const seen = new Set<string>();
  const usedTok = new Set<string>();
  for (const p of sameOnly ? same : [...same, ...rest]) {
    const key = textOf(p).toLowerCase();
    if (seen.has(key)) continue;
    const toks = key.split(/\W+/).filter((w) => w.length > 3);
    if (toks.some((w) => usedTok.has(w))) continue;
    toks.forEach((w) => usedTok.add(w));
    seen.add(key);
    out.push(p);
    if (out.length === n) break;
  }
  return out;
}

export function buildLite(segments: Segment[], meta: LiteMeta = {}): StudyOutput {
  const seed = meta.seed || meta.title || 'lecture';
  const r = rng(seed);
  const sentences = toSentences(segments);
  const words = sentences.reduce((a, s) => a + s.text.split(/\s+/).length, 0);
  if (sentences.length < 5) throw new Error('That transcript is too short to build a study set from. Try a longer lecture (at least ~150 words).');

  // pass 1: terms and definitions
  let terms = detectTerms(sentences, 40);
  const defs0 = extractDefinitions(sentences, new Set(terms.map((t) => t.lower)));
  terms = detectTerms(sentences, 40, defs0.map((d) => d.term));
  const termLowers = terms.map((t) => t.lower);
  const defs = defs0.filter((d) => termLowers.includes(d.lower) || d.explicit);
  const scores = rankSentences(sentences, termLowers);

  // sections
  const target = Math.max(3, Math.min(9, Math.round(words / 300)));
  const bounds = segmentSections(sentences, target);
  const used = new Set<string>();
  const sections: GuideSection[] = [];
  const secRanges: [number, number][] = [];
  for (let b = 0; b < bounds.length; b++) {
    const from = bounds[b];
    const to = b + 1 < bounds.length ? bounds[b + 1] : sentences.length;
    secRanges.push([from, to]);
    const heading = sectionHeading(sentences, from, to, terms, used);
    const idxs = Array.from({ length: to - from }, (_, i) => from + i).filter((i) => !sentences[i].chatter && sentences[i].text.split(/\s+/).length >= 7 && !/\?$/.test(sentences[i].text));
    const k = Math.max(2, Math.min(5, Math.round(idxs.length / 4)));
    const chosen = [...idxs].sort((x, y) => scores[y] - scores[x]).slice(0, k).sort((x, y) => x - y);
    sections.push({
      heading,
      start: sentences[from].start >= 0 ? sentences[from].start : undefined,
      points: chosen.map((i) => ({ text: sentences[i].text, start: sentences[i].start >= 0 ? sentences[i].start : undefined, mustKnow: CUE.test(sentences[i].text) })),
      terms: terms.filter((t) => t.sentenceIdxs.filter((x) => x >= from && x < to).length >= 1).sort((a, b2) => b2.score - a.score).slice(0, 6).map((t) => t.term),
    });
  }

  // glossary: explicit definitions first, then inferred best sentence for the remaining key terms
  const glossary: GlossaryEntry[] = [];
  const usedTerms = new Set<string>();
  for (const d of defs.sort((a, b) => a.idx - b.idx)) {
    if (usedTerms.has(d.lower)) continue;
    usedTerms.add(d.lower);
    glossary.push({ term: capFirst(fmtTerm(d.term)), definition: d.definition, start: sentences[d.idx].start >= 0 ? sentences[d.idx].start : undefined, category: GLOSSARY_MAP.get(d.lower)?.category });
  }
  for (const t of terms.slice(0, 22)) {
    if (usedTerms.has(t.lower)) continue;
    const cand = t.sentenceIdxs
      .filter((i) => {
        const w = sentences[i].text.split(/\s+/);
        const head = w.slice(0, 9).join(' ').toLowerCase();
        return !sentences[i].chatter && w.length >= 8 && w.length <= 40 && head.includes(t.lower.split(' ')[0]) && !/\?$/.test(sentences[i].text);
      })
      .sort((x, y) => scores[y] - scores[x])[0];
    if (cand === undefined) continue;
    usedTerms.add(t.lower);
    glossary.push({ term: capFirst(fmtTerm(t.term)), definition: sentences[cand].text, start: sentences[cand].start >= 0 ? sentences[cand].start : undefined, inferred: true, category: t.category });
  }
  glossary.sort((a, b) => a.term.localeCompare(b.term));

  // must-know
  const mustIdx = sentences
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => CUE.test(s.text) && !s.chatter && s.text.split(/\s+/).length >= 8 && s.text.split(/\s+/).length <= 42 && !/\?$/.test(s.text))
    .sort((a, b) => scores[b.i] - scores[a.i])
    .slice(0, 5)
    .sort((a, b) => a.i - b.i);
  const mustKnow = mustIdx.map(({ s }) => ({ text: s.text, start: s.start >= 0 ? s.start : undefined, mustKnow: true }));

  // overview & objectives
  const category = dominantCategory(terms);
  const headings = sections.map((s) => s.heading);
  const listJoin = (a: string[]) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);
  const topSent = sentences
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => !s.chatter && s.text.split(/\s+/).length >= 9 && s.text.split(/\s+/).length <= 38 && !/\?$/.test(s.text))
    .sort((a, b) => scores[b.i] - scores[a.i])
    .slice(0, 2)
    .sort((a, b) => a.i - b.i)
    .map(({ s }) => s.text);
  const mins = meta.durationSec ? Math.round(meta.durationSec / 60) : Math.max(1, Math.round(words / 150));
  const overview = `This lecture (about ${mins} min, ${words.toLocaleString()} words) covers ${listJoin(headings.slice(0, 4).map((h) => h))}. ${topSent.join(' ')}`;
  const objectives: string[] = [];
  for (const s of sections.slice(0, 5)) objectives.push(`Explain the main ideas in “${s.heading}”.`);
  for (const g of glossary.filter((g) => !g.inferred).slice(0, 3)) objectives.push(`Define ${inline(g.term)} in your own words.`);
  if (mustKnow.length) objectives.push('Recall the priority and safety points the instructor emphasized.');
  const quickReview = [...new Set([...mustKnow.map((m) => m.text), ...sections.flatMap((s) => s.points.slice(0, 1).map((p) => p.text))])].slice(0, 8).map((t) => shortWords(t, 26));

  // ---------- games: true/false + sequences
  const tf: Guide['games']['tf'] = [];
  const poolDefs = glossary.filter((g) => !g.inferred);
  for (const d of shuffle(poolDefs, r).slice(0, 8)) {
    tf.push({ statement: `${d.term}: ${shortWords(d.definition, 24)}`, answer: true, explanation: `True. “${d.term}” — ${d.definition}` });
    const other = pickDistractors(poolDefs.map((x) => ({ ...x, lower: x.term.toLowerCase() })), { ...d, lower: d.term.toLowerCase() }, d.definition, 1, r, (x) => x.term)[0];
    if (other) tf.push({ statement: `${d.term}: ${shortWords(other.definition, 24)}`, answer: false, explanation: `False. That description belongs to “${other.term}”. “${d.term}” — ${d.definition}` });
  }
  const termList = terms.filter((t) => t.count >= 2);
  const clozeCands = sentences
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => !s.chatter && s.text.split(/\s+/).length >= 9 && s.text.split(/\s+/).length <= 28 && !/\?$/.test(s.text))
    .sort((a, b) => scores[b.i] - scores[a.i]);
  // a few verbatim statements from the lecture (true) to mix with definition pairs
  for (const { s } of clozeCands.slice(0, 6)) {
    if (tf.length >= 22) break;
    if (/\b(?:we|you|i)\b/i.test(s.text) || s.text.split(/\s+/).length > 26) continue;
    tf.push({ statement: s.text, answer: true, explanation: 'True. This was stated in the lecture.' });
  }

  const sequences: Guide['games']['sequences'] = [];
  {
    // runs of sentences that open with First/Second/Next/Then/Finally… within a short window
    let run: number[] = [];
    const flush = () => {
      if (run.length >= 3) {
        const sec = secRanges.findIndex(([f, t]) => run[0] >= f && run[0] < t);
        sequences.push({ title: `Put the steps in order: ${sections[Math.max(0, sec)].heading}`, steps: run.slice(0, 6).map((i) => capFirst(shortWords(sentences[i].text, 20))) });
      }
      run = [];
    };
    sentences.forEach((s2, i) => {
      if (s2.ordinal && !s2.chatter) {
        if (run.length && i - run[run.length - 1] > 3) flush();
        run.push(i);
      } else if (run.length && i - run[run.length - 1] > 3) flush();
    });
    flush();
  }
  if (!sequences.length) {
    const big = sections.reduce((a, b) => (b.points.length > a.points.length ? b : a), sections[0]);
    if (big.points.length >= 3) sequences.push({ title: `Put these points from “${big.heading}” in lecture order`, steps: big.points.slice(0, 5).map((p) => shortWords(p.text, 20)) });
  }

  // ---------- flashcards
  const cards: GenCard[] = [];
  for (const g of glossary.filter((g) => !g.inferred)) cards.push({ type: 'term', front: g.term, back: g.definition, topic: g.category || category, start: g.start });
  const clozeUsed = new Set<string>();
  for (const { s } of clozeCands) {
    if (cards.length >= 44) break;
    if (usedTerms.size === 0) break;
    const cands = termList.filter((t) => new RegExp(`\\b${t.lower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:s|es)?\\b`, 'i').test(s.text) && !clozeUsed.has(t.lower)).sort((a, b) => b.score - a.score);
    const t = cands[0];
    if (!t) continue;
    const re = new RegExp(`\\b(${t.lower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:s|es)?)\\b`, 'ig');
    const front = s.text.replace(re, (m) => `{{c1::${m}}}`);
    if (front === s.text) continue;
    const leftover = front.replace(/\{\{c1::.*?\}\}/g, '').trim().split(/\s+/).length;
    if (leftover < 5) continue;
    clozeUsed.add(t.lower);
    cards.push({ type: 'cloze', front, back: '', topic: t.category || category, start: s.start >= 0 ? s.start : undefined });
  }
  for (const m of mustKnow.slice(0, 3)) {
    const t = termList.find((x) => m.text.toLowerCase().includes(x.lower));
    cards.push({ type: 'qa', front: t ? `What did the lecture stress about ${t.term}?` : 'What did the lecture stress as a must-know point?', back: m.text, topic: t?.category || category, start: m.start });
  }

  // ---------- questions
  const questions: GenQuestion[] = [];
  const when = (st?: number) => (st !== undefined && st >= 0 ? ` (≈${fmtTime(st)})` : '');
  const dTerms = poolDefs.map((g) => ({ term: g.term, lower: g.term.toLowerCase(), category: g.category, def: g.definition, start: g.start }));
  const allTermObjs = terms.map((t) => ({ term: capFirst(t.term), lower: t.lower, category: t.category, count: t.count }));
  const mk = (stem: string, correct: string, distractors: string[], rationale: string, topic: string, diff = 2) => {
    const opts = [correct, ...distractors];
    if (new Set(opts.map((o) => o.toLowerCase().trim())).size !== opts.length || opts.length < 4) return;
    const order = shuffle(opts.map((o, i) => ({ o, i })), r);
    questions.push({ type: 'mcq', stem, options: order.map((x) => x.o), correct: [order.findIndex((x) => x.i === 0)], rationale, topic, difficulty: diff });
  };
  for (const d of shuffle(dTerms, r).slice(0, 7)) {
    const dis = pickDistractors(allTermObjs, { ...d, count: 0 }, d.def, 3, r, (x) => x.term);
    if (dis.length === 3) mk(`Which term is described here?\n“${shortWords(d.def, 34)}”`, capFirst(d.term), dis.map((x) => x.term), `The lecture defines ${d.term}: “${d.def}”${when(d.start)}`, d.category || category, 2);
  }
  for (const d of shuffle(dTerms, r).slice(0, 5)) {
    const pool = dTerms.map((x) => ({ ...x }));
    const dis = pickDistractors(pool, d, d.def, 3, r, (x) => x.def.slice(0, 60)).filter((x) => x.def.length / d.def.length < 2.5 && x.def.length / d.def.length > 0.4);
    if (dis.length === 3) mk(`According to the lecture, what is ${d.term}?`, shortWords(d.def, 26), dis.map((x) => shortWords(x.def, 26)), `“${d.term}” — ${d.def}${when(d.start)}`, d.category || category, 2);
  }
  const clozeQs = clozeCands.filter(({ s }) => s.text.split(/\s+/).length <= 30).slice(0, 14);
  let nc = 0;
  for (const { s } of clozeQs) {
    if (nc >= 6) break;
    const t = [...termList].sort((a, b) => b.score - a.score).find((tt) => new RegExp(`\\b${tt.lower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:s|es)?\\b`, 'i').test(s.text));
    if (!t) continue;
    const re = new RegExp(`\\b${t.lower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:s|es)?\\b`, 'ig');
    const blank = s.text.replace(re, '_____');
    if (blank === s.text) continue;
    const dis = pickDistractors(allTermObjs, { term: capFirst(t.term), lower: t.lower, category: t.category, count: 0 }, s.text, 3, r, (x) => x.term);
    if (dis.length < 3) continue;
    const before = questions.length;
    mk(`Which term best completes this statement from the lecture?\n“${blank}”`, capFirst(t.term), dis.map((x) => x.term), `The lecture states: “${s.text}”${when(s.start)}`, t.category || category, 2);
    if (questions.length > before) nc++;
  }
  // SATA: terms discussed in a section
  secRanges.forEach(([from, to], bi) => {
    if (questions.filter((q) => q.type === 'sata').length >= 2) return;
    const inSec = terms.filter((t) => t.sentenceIdxs.some((x) => x >= from && x < to) && t.sentenceIdxs.every((x) => x >= from - 3 && x < to + 3)).slice(0, 3);
    const secText = sentences.slice(from, to).map((s) => s.text.toLowerCase()).join(' ');
    const outTerms = terms.filter((t) => !secText.includes(t.lower) && t.sentenceIdxs.length).map((t) => ({ term: capFirst(t.term), lower: t.lower, category: t.category, count: t.count }));
    if (inSec.length < 2 || outTerms.length < 2) return;
    const wrong = shuffle(outTerms, r).slice(0, 5 - inSec.length > 2 ? 3 : 2).slice(0, Math.max(2, 5 - inSec.length));
    const opts = shuffle([...inSec.map((t) => ({ o: capFirst(t.term), ok: true })), ...wrong.map((t) => ({ o: t.term, ok: false }))], r);
    if (new Set(opts.map((o) => o.o.toLowerCase())).size !== opts.length) return;
    questions.push({
      type: 'sata',
      stem: `Select all terms that were discussed in the section “${sections[bi].heading}”.`,
      options: opts.map((o) => o.o),
      correct: opts.map((o, i) => (o.ok ? i : -1)).filter((i) => i >= 0),
      rationale: `This section covered ${inSec.map((t) => t.term).join(', ')}. The other options came from different parts of the lecture.`,
      topic: category,
      difficulty: 3,
    });
  });

  const guide: Guide = {
    mode: 'lite',
    topic: category,
    overview,
    objectives,
    sections,
    glossary,
    mustKnow,
    nursingConsiderations: [],
    mnemonics: [],
    quickReview,
    games: { tf: shuffle(tf, r).slice(0, 20), sequences },
    stats: { words, sentences: sentences.length, sections: sections.length, terms: terms.length },
  };
  return { guide, cards, questions };
}

export type { Definition };
