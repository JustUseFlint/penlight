import type { Segment } from '../ingest/parse';

export const STOP = new Set(
  `a about above after again against all also am an and any are as at be because been before being below between both but by can could did do does doing down during each few for from further had has have having he her here hers him his how i if in into is it its itself just let's like me more most my myself no nor not now of off on once only or other our ours out over own same she should so some such than that the their theirs them then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your yours yourself okay ok yeah right really gonna wanna gotta kind sort actually basically literally essentially pretty even much many may might must shall one two three first second third next lastly finally also well got get gets getting going goes go went come comes came make makes made say says said see sees seen look looks take takes thing things way ways lot lots bit something anything everything nothing someone anyone everyone`.split(/\s+/),
);

/** Words that look like content but are generic in lectures. */
export const GENERIC = new Set(
  'patient patients nurse nurses nursing lecture video today class students student example examples case cases time times people person body type types kind important remember know understand talk talking discuss discussing question questions answer answers point points part parts case problem problems issue issues number numbers level levels amount side sides area areas year years day days hour hours minute minutes order process step steps result results reason reasons idea concept topic topics information thing stuff use used using work works working look looking need needs needed want wants help helps give gives given keep keeps start started stop stopped end begin beginning great good bad high low big small large long short new old different same similar common main major key'.split(
    /\s+/,
  ),
);

const FILLER: RegExp[] = [
  /\b(?:um+|uh+|uhm+|erm+|hmm+|mhm+)\b[,.]?\s*/gi,
  /,\s*(?:you know|i mean)\b,?\s*/gi,
  /\b(?:you know|i mean),\s+/gi,
  /\b(?:okay|ok|alright|all right)[,.]?\s+(?=so|now|let|we|the|this)/gi,
  /\b(\w+)(?:\s+\1\b)+/gi, // stutters: "the the"
];

const CHATTER =
  /(?:welcome (?:back )?to|in this video|in today'?s (?:video|lecture|lesson)|thanks? (?:so much )?for (?:watching|listening)|subscribe|like and share|hit the (?:bell|like)|link (?:is )?in the (?:description|comments)|see you (?:in|next)|let'?s (?:get started|dive in|jump in)|before we (?:begin|start)|my name is|follow me on|check out (?:our|my)|patreon|sponsor|quiz (?:is )?(?:on|at) (?:our|the) website|free (?:cheat sheet|download)|share this video)/i;

export function cleanText(t: string): string {
  let s = t.replace(/\[[^\]]{0,30}\]/g, ' ').replace(/♪+/g, ' ').replace(/\s+/g, ' ');
  for (const r of FILLER) s = s.replace(r, r.source.startsWith('\\b(\\w+)') ? '$1 ' : ' ');
  return s.replace(/\s+([,.;:!?])/g, '$1').replace(/\s+/g, ' ').trim();
}

export interface Sentence {
  idx: number;
  text: string;
  start: number; // seconds, -1 unknown
  tokens: string[]; // stemmed content tokens
  chatter: boolean;
  ordinal: boolean; // starts with First/Second/Next/Then/Finally… (sequence cue)
}

const ORDINAL = /^(?:first(?:ly)?|second(?:ly)?|third(?:ly)?|fourth|fifth|sixth|next|then|finally|lastly|last|after that|afterward|initially|step (?:one|two|three|four|five|\d+))[,:]?\s+(?!-)/i;
const ABBR = /\b(?:e\.g|i\.e|vs|approx|dr|mr|mrs|ms|etc|no|fig|st|mg|mcg|ml|kg|lb|oz|q|bid|tid|qid|prn|a\.m|p\.m)\.$/i;

/** Tiny suffix-stripper (Porter-lite) so "arrhythmias" ~ "arrhythmia". */
export function stem(w: string): string {
  if (w.length <= 3) return w;
  return w
    .replace(/(?:ies)$/, 'y')
    .replace(/(?:sses)$/, 'ss')
    .replace(/(?:ing|edly|ed|ly)$/, (m, off, str) => (str.length - m.length >= 4 ? '' : m))
    .replace(/(?:es)$/, (m, off, str) => (/(?:ch|sh|x|z|s)es$/.test(str) ? '' : 'e'))
    .replace(/s$/, (m, off, str) => (/(?:ss|us|is)$/.test(str) ? m : ''));
}

export function tokenize(s: string): string[] {
  return (s.toLowerCase().match(/[a-z][a-z0-9'-]*|\d+(?:\.\d+)?/g) || []).map((w) => w.replace(/'s$/, ''));
}
export function contentTokens(s: string): string[] {
  return tokenize(s)
    .filter((w) => !STOP.has(w) && !GENERIC.has(w) && w.length > 1 && !/^\d+$/.test(w))
    .map(stem);
}

function splitSentences(text: string): string[] {
  const parts = text.split(/(?<=[.!?])["')\]]?\s+(?=["'(\[]?[A-Z0-9])/);
  const out: string[] = [];
  for (const p of parts) {
    if (out.length && (ABBR.test(out[out.length - 1]) || /\b\d+\.$/.test(out[out.length - 1]) && /^\d/.test(p))) out[out.length - 1] += ' ' + p;
    else out.push(p);
  }
  return out.map((s) => s.trim()).filter(Boolean);
}

/**
 * Turns timestamped caption segments into clean sentences, each carrying the timestamp of
 * the segment in which it starts. Handles unpunctuated auto-captions by chunking.
 */
export function toSentences(segments: Segment[]): Sentence[] {
  const offsets: { off: number; start: number }[] = [];
  let full = '';
  for (const seg of segments) {
    const c = cleanText(seg.text);
    if (!c) continue;
    offsets.push({ off: full.length, start: seg.start });
    full += (full ? ' ' : '') + c;
    if (full.length && offsets.length) offsets[offsets.length - 1].off = full.length - c.length;
  }
  const words = full.split(/\s+/).length;
  const punct = (full.match(/[.!?]/g) || []).length;
  let raw: { text: string; off: number }[] = [];
  if (punct < words / 45) {
    // unpunctuated: chunk at segment boundaries every ~22 words
    let buf = '';
    let bufOff = 0;
    for (let i = 0; i < offsets.length; i++) {
      const end = i + 1 < offsets.length ? offsets[i + 1].off : full.length;
      const piece = full.slice(offsets[i].off, end).trim();
      if (!buf) bufOff = offsets[i].off;
      buf += (buf ? ' ' : '') + piece;
      if (buf.split(/\s+/).length >= 22) {
        raw.push({ text: buf.replace(/^./, (c) => c.toUpperCase()) + '.', off: bufOff });
        buf = '';
      }
    }
    if (buf) raw.push({ text: buf.replace(/^./, (c) => c.toUpperCase()) + '.', off: bufOff });
  } else {
    let cursor = 0;
    for (const s of splitSentences(full)) {
      const at = full.indexOf(s, cursor);
      raw.push({ text: s, off: at < 0 ? cursor : at });
      cursor = (at < 0 ? cursor : at) + s.length;
    }
  }
  const startAt = (off: number) => {
    let lo = 0, hi = offsets.length - 1, ans = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (offsets[mid].off <= off) { ans = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return offsets[ans]?.start ?? -1;
  };
  // split run-ons (> 60 words) at conjunction/semicolon so cards stay readable
  const sentences: Sentence[] = [];
  for (const r of raw) {
    let t = r.text.trim();
    if (!/[.!?]["')]?$/.test(t)) t += '.';
    const wc = t.split(/\s+/).length;
    if (wc < 4) continue;
    const pieces = wc > 60 ? t.split(/(?<=;)\s+|,\s+(?=(?:and|but|so|which|because|while)\s)/).reduce<string[]>((a, p) => {
      if (a.length && a[a.length - 1].split(/\s+/).length < 14) a[a.length - 1] += ' ' + p; else a.push(p);
      return a;
    }, []) : [t];
    for (const p of pieces) {
      let text = p.trim().replace(/^(?:and|so|but|well|now|okay)[,\s]+/i, '');
      const ordinal = ORDINAL.test(text);
      text = text.replace(ORDINAL, '').replace(/^./, (c) => c.toUpperCase());
      if (text.split(/\s+/).length < 4) continue;
      sentences.push({ idx: sentences.length, text, start: startAt(r.off), tokens: contentTokens(text), chatter: CHATTER.test(text), ordinal });
    }
  }
  return sentences;
}

export function cosine(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0, na = 0, nb = 0;
  for (const [k, v] of a) { na += v * v; const w = b.get(k); if (w) dot += v * w; }
  for (const v of b.values()) nb += v * v;
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

export function tfidfVectors(docs: string[][]): Map<string, number>[] {
  const df = new Map<string, number>();
  for (const d of docs) for (const t of new Set(d)) df.set(t, (df.get(t) || 0) + 1);
  const N = docs.length || 1;
  return docs.map((d) => {
    const tf = new Map<string, number>();
    for (const t of d) tf.set(t, (tf.get(t) || 0) + 1);
    const v = new Map<string, number>();
    for (const [t, c] of tf) v.set(t, (1 + Math.log(c)) * Math.log(1 + N / (df.get(t) || 1)));
    return v;
  });
}

/** Seeded RNG (mulberry32) so generated questions are deterministic for a given lecture. */
export function rng(seed: number | string) {
  let h = 1779033703 ^ String(seed).length;
  for (const ch of String(seed)) { h = Math.imul(h ^ ch.charCodeAt(0), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = h >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function shuffle<T>(arr: T[], r: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
export const titleCase = (s: string) =>
  s.replace(/\b([a-z])([a-z'-]*)/g, (m, a, b, off, str) => (['and', 'of', 'the', 'in', 'to', 'for', 'a', 'an', 'vs', 'or'].includes(m) && off > 0 ? m : a.toUpperCase() + b));
export const capFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
