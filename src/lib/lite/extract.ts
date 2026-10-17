import { CATEGORIES, GLOSSARY, GLOSSARY_MAP } from './glossary';
import { STOP, GENERIC, type Sentence, capFirst, cosine, tfidfVectors } from './text';

export interface Term {
  term: string; // display form
  lower: string;
  count: number;
  score: number;
  category?: string;
  inGlossary: boolean;
  sentenceIdxs: number[];
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
let compiled: { g: (typeof GLOSSARY)[number]; re: RegExp }[] | null = null;
function glossaryRegexes() {
  if (!compiled)
    compiled = GLOSSARY.filter((g) => g.lower.length >= 2).map((g) => {
      const short = g.term.length <= 4 && g.term === g.term.toUpperCase();
      return { g, re: new RegExp(`(?<![\\w-])${esc(g.lower).replace(/\\? /g, '[\\s-]')}${short ? '' : '(?:s|es)?'}(?![\\w-])`, 'gi') };
    });
  return compiled;
}

const DISPLAY_KEEP = (t: string) => /[A-Z]{2,}|[A-Z].*[A-Z]/.test(t) || /^[A-Z][a-z]+ (?:disease|syndrome|sign|triad)/.test(t);
export function displayTerm(t: string): string {
  if (DISPLAY_KEEP(t)) return t;
  return t;
}

/** Finds glossary hits per sentence with longest-match-wins de-overlap. */
export function glossaryHits(sentences: Sentence[]) {
  const per: Map<string, { count: number; idxs: number[]; surface: Map<string, number> }> = new Map();
  for (const s of sentences) {
    const spans: { lo: number; hi: number; lower: string; surface: string }[] = [];
    const lowerText = s.text;
    for (const { g, re } of glossaryRegexes()) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      // quick reject
      if (!lowerText.toLowerCase().includes(g.lower.split(/[\s-]/)[0].slice(0, Math.min(5, g.lower.length)))) continue;
      while ((m = re.exec(lowerText))) spans.push({ lo: m.index, hi: m.index + m[0].length, lower: g.lower, surface: m[0] });
    }
    spans.sort((a, b) => b.hi - b.lo - (a.hi - a.lo));
    const taken: typeof spans = [];
    for (const sp of spans) if (!taken.some((t) => sp.lo < t.hi && sp.hi > t.lo)) taken.push(sp);
    for (const sp of taken) {
      // Short all-caps acronyms must appear uppercase in the text (avoid "pH"/"pass"/"race" false hits)
      const g = GLOSSARY_MAP.get(sp.lower)!;
      if (g.term.length <= 5 && g.term === g.term.toUpperCase() && sp.surface.replace(/s$/, '') !== g.term) continue;
      if (/^(?:race|pass|ph|oral|rest|cell|gene|base|acid|atom|ion|pain|cough|valve|tissue|assessment|planning|evaluation|diagnosis|implementation|comfort|sleep|stress|abuse|neglect|trauma|ethics|justice|tumor|biopsy|justice|culture|metabolism|absorption|distribution|excretion|conduction|nutrition|hygiene|catheter|isolation|transfer|positioning|hormone|enzyme)$/.test(sp.lower)) {
        // ultra-common words only count when capitalised mid-sentence or multiword context; keep conservative: skip
        continue;
      }
      let e = per.get(sp.lower);
      if (!e) per.set(sp.lower, (e = { count: 0, idxs: [], surface: new Map() }));
      e.count++;
      if (!e.idxs.includes(s.idx)) e.idxs.push(s.idx);
      e.surface.set(sp.surface, (e.surface.get(sp.surface) || 0) + 1);
    }
  }
  return per;
}

const BAD_EDGE = new Set([...STOP, ...GENERIC]);

/** Extra candidate terms that aren't in the glossary: repeated noun-ish n-grams, acronyms, capitalised names. */
function candidateNgrams(sentences: Sentence[]) {
  const counts = new Map<string, { count: number; idxs: Set<number>; surface: string }>();
  for (const s of sentences) {
    const words = s.text.replace(/[^\w\s'/-]/g, ' | ').split(/\s+/).filter(Boolean);
    for (let n = 1; n <= 3; n++) {
      for (let i = 0; i + n <= words.length; i++) {
        const gram = words.slice(i, i + n);
        if (gram.some((w) => w === '|')) continue;
        const low = gram.map((w) => w.toLowerCase());
        if (BAD_EDGE.has(low[0]) || BAD_EDGE.has(low[n - 1])) continue;
        if (low.some((w, k) => (k > 0 && k < n - 1 && STOP.has(w) && !['of', 'and'].includes(w)) || /^\d/.test(w) || w.length < 2)) continue;
        if (n === 1 && low[0].length < 6 && !/^[A-Z]{2,6}$/.test(gram[0])) continue;
        if (n === 1 && i === 0 && !/^[A-Z]{2,6}$/.test(gram[0]) && !GLOSSARY_MAP.has(low[0])) continue; // sentence-initial capital isn't evidence
        const key = low.join(' ');
        const e = counts.get(key) || { count: 0, idxs: new Set(), surface: gram.join(' ') };
        e.count++;
        e.idxs.add(s.idx);
        counts.set(key, e);
      }
    }
  }
  return counts;
}

export function detectTerms(sentences: Sentence[], max = 36, extraDefined: string[] = []): Term[] {
  const hits = glossaryHits(sentences);
  const terms: Term[] = [];
  for (const [lower, e] of hits) {
    const g = GLOSSARY_MAP.get(lower)!;
    const surface = [...e.surface.entries()].sort((a, b) => b[1] - a[1])[0][0];
    // display: glossary casing for acronyms / proper names; otherwise lowercase surface
    void surface;
    const display = g.term;
    const lenBonus = 1 + 0.3 * (lower.split(/[\s-]/).length - 1);
    terms.push({ term: display, lower, count: e.count, score: (2 + 3 * Math.pow(e.count, 0.8)) * lenBonus, category: g.category, inGlossary: true, sentenceIdxs: e.idxs });
  }
  const known = new Set(terms.map((t) => t.lower));
  const cands = [...candidateNgrams(sentences)]
    .filter(([k, v]) => {
      if (known.has(k) || [...known].some((x) => x.includes(k) || k.includes(x))) return false;
      const n = k.split(' ').length;
      return n === 1 ? v.count >= 4 : v.count >= 2;
    })
    .map(([k, v]) => ({ k, v }))
    .sort((a, b) => b.v.count * (1 + a.k.split(' ').length * 0.5) - a.v.count * (1 + b.k.split(' ').length * 0.5))
    .slice(0, 10);
  for (const { k, v } of cands) {
    terms.push({ term: v.surface, lower: k, count: v.count, score: v.count * (1 + 0.4 * (k.split(' ').length - 1)), inGlossary: false, sentenceIdxs: [...v.idxs] });
  }
  for (const d of extraDefined) {
    const lower = d.toLowerCase();
    if (!terms.some((t) => t.lower === lower)) terms.push({ term: d, lower, count: 1, score: 6, inGlossary: false, sentenceIdxs: [] });
    else terms.find((t) => t.lower === lower)!.score += 4;
  }
  // glossary terms with a single mention are weak evidence unless defined
  const definedSet = new Set(extraDefined.map((x) => x.toLowerCase()));
  return terms
    .filter((t) => t.count >= 2 || definedSet.has(t.lower) || (t.inGlossary && t.lower.includes(' ')))
    .sort((a, b) => b.score - a.score)
    .slice(0, max);
}

export function dominantCategory(terms: Term[]): string {
  const w = new Map<string, number>();
  for (const t of terms) if (t.category) w.set(t.category, (w.get(t.category) || 0) + t.score);
  return [...w.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'General Nursing';
}

export interface Definition { term: string; lower: string; definition: string; idx: number; explicit: boolean }

const PRONOUN = /^(?:it|this|that|these|those|they|we|you|he|she|there|here|i|which|what|who|one|some|each|both|many|most|if|when|because|so|but|and|or|then|also)\b/i;
const VERBISH = /\b(?:is|are|was|were|has|have|will|can|may|does|do|would|should)\b/i;

function cleanSubject(s: string): string {
  return s
    .replace(/^(?:the term|the word|the phrase|a|an|the|our|your)\s+/i, '')
    .replace(/^["“'‘]|["”'’]$/g, '')
    .replace(/^(?:so|now|and|but|then|well)[,\s]+/i, '')
    .trim();
}
function cleanDef(d: string): string {
  let t = d.replace(/[.!\s]+$/, '').trim();
  if (/^that\s/i.test(t)) t = 'It means ' + t;
  else if (/^(?:using|giving|knowing|checking|documenting)\b/i.test(t)) t = 'It means ' + t.charAt(0).toLowerCase() + t.slice(1);
  return capFirst(t) + '.';
}
const ok = (s: string, min: number, max: number) => {
  const n = s.split(/\s+/).length;
  return n >= min && n <= max;
};

const P_EXPLICIT = [
  /^(?:the term\s+)?["“]?([^,.;:]{2,60}?)["”]?,?\s+(?:is|are)\s+(?:defined as|described as|characterized by|characterised by|known as|referred to as|considered to be)\s+(.{12,260})$/i,
  /^(?:the term\s+)?["“]?([^,.;:]{2,60}?)["”]?,?\s+(?:refers to|stands for|is the term for|is the name for)\s+(.{8,260})$/i,
  /^(?:the term\s+)?["“]?([^,.;:]{2,60}?)["”]?,?\s+(?:means|describes)\s+(.{10,260})$/i,
];
const P_CALLED = /^(.{14,260}?)\s*,?\s+(?:is|are|which is|that is|which are)\s+(?:called|termed|known as|referred to as)\s+["“]?([^,.;:]{2,50}?)["”]?$/i;
const P_ISA = /^([^,.;:]{2,50}?)\s+(?:is|are)\s+((?:a|an|the)\s+.{15,260})$/i;
const P_COLON = /^([A-Za-z][^:.]{2,45}):\s+(.{15,260})$/;

export function extractDefinitions(sentences: Sentence[], knownTerms: Set<string>): Definition[] {
  const out = new Map<string, Definition>();
  const add = (term: string, def: string, idx: number, explicit: boolean) => {
    const subj = cleanSubject(term);
    const lower = subj.toLowerCase().replace(/\s+/g, ' ');
    if (!subj || PRONOUN.test(subj) || subj.split(/\s+/).length > 5 || subj.length < 2) return;
    if (BAD_EDGE.has(lower)) return;
    if (!explicit && VERBISH.test(subj)) return;
    if (!ok(def, 5, 48)) return;
    const prev = out.get(lower);
    if (prev && (prev.explicit || !explicit)) return;
    out.set(lower, { term: GLOSSARY_MAP.get(lower)?.term && /[A-Z]/.test(GLOSSARY_MAP.get(lower)!.term.slice(1)) ? GLOSSARY_MAP.get(lower)!.term : subj, lower, definition: cleanDef(def), idx, explicit });
  };
  for (const s of sentences) {
    if (s.chatter) continue;
    const t = s.text.replace(/[.!]+$/, '').replace(/^(?:so|now|and|but|then|well|okay|alright)[,\s]+/i, '');
    let matched = false;
    for (const p of P_EXPLICIT) {
      const m = t.match(p);
      if (m && !PRONOUN.test(cleanSubject(m[1]))) { add(m[1], m[2], s.idx, true); matched = true; break; }
    }
    if (matched) continue;
    const c = t.match(P_CALLED);
    if (c) {
      const parts = c[1].split(/,\s+(?:and\s+)?|\s+and\s+(?=the\s)/).map((x) => x.trim()).filter(Boolean);
      const tail = parts.length > 1 ? parts[parts.length - 1].replace(/^(?:and|which|that)\s+/i, '') : c[1];
      add(c[2], tail.split(/\s+/).length >= 4 ? tail : c[1], s.idx, true);
      continue;
    }
    const isA = t.match(P_ISA);
    if (isA && !/^(?:the\s+)?(?:most|main|first|only|best|last|major|primary|key|same|other|next|result|reason|goal|purpose|priority)\b/i.test(isA[2].replace(/^(?:a|an|the)\s+/i, ''))) {
      const lower = cleanSubject(isA[1]).toLowerCase();
      if (knownTerms.has(lower) || GLOSSARY_MAP.has(lower)) add(isA[1], isA[2], s.idx, false);
      continue;
    }
    const col = t.match(P_COLON);
    if (col && (knownTerms.has(col[1].toLowerCase()) || GLOSSARY_MAP.has(col[1].toLowerCase()))) add(col[1], col[2], s.idx, false);
  }
  return [...out.values()];
}

/** Sentence ranking: TextRank over TF-IDF cosine similarity, boosted by key terms and instructional cue phrases. */
export const CUE =
  /\b(?:remember|important(?:ly)?|key (?:point|concept|thing)|always|never|priority|must|critical|crucial|essential|immediately|report|notify|danger(?:ous)?|toxic(?:ity)?|avoid|do not|don't|should not|hold the|monitor|assess|first priority|red flag|emergency|life-threatening|nclex|test(?:ed)? on|high yield|take home|the biggest)\b/i;

export function rankSentences(sentences: Sentence[], termLowers: string[]): number[] {
  const n = sentences.length;
  if (!n) return [];
  const vecs = tfidfVectors(sentences.map((s) => s.tokens));
  const sim: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      const c = cosine(vecs[i], vecs[j]);
      sim[i][j] = sim[j][i] = c > 0.04 ? c : 0;
    }
  const rowSum = sim.map((r) => r.reduce((a, b) => a + b, 0) || 1);
  let pr = new Array(n).fill(1 / n);
  for (let it = 0; it < 30; it++) {
    const next = new Array(n).fill(0.15 / n);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (sim[j][i]) next[i] += 0.85 * pr[j] * (sim[j][i] / rowSum[j]);
    pr = next;
  }
  const max = Math.max(...pr) || 1;
  return sentences.map((s, i) => {
    const words = s.text.split(/\s+/).length;
    const low = s.text.toLowerCase();
    const termHits = termLowers.filter((t) => low.includes(t)).length;
    let score = pr[i] / max;
    score *= 1 + 0.25 * Math.min(3, termHits);
    if (CUE.test(s.text)) score *= 1.35;
    if (words < 8) score *= 0.5;
    if (words > 45) score *= 0.75;
    if (s.chatter || /\?$/.test(s.text.trim())) score *= 0.2;
    return score;
  });
}

export { CATEGORIES };
