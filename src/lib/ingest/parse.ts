export interface Segment {
  start: number; // seconds; -1 when unknown
  text: string;
}

const clean = (t: string) =>
  t
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\{\\an?\d\}/g, '')
    .replace(/\[(?:music|applause|laughter|inaudible|silence)\]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const TS = /(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})\s*-->/;

export function tsToSeconds(h: string | undefined, m: string, s: string, ms: string) {
  return Number(h || 0) * 3600 + Number(m) * 60 + Number(s) + Number(ms.padEnd(3, '0')) / 1000;
}

/** Parses SRT or WebVTT text. Collapses the rolling-window repetition used by auto-captions. */
export function parseSubtitles(content: string): Segment[] {
  const blocks = content.replace(/\r/g, '').split(/\n\s*\n/);
  const segs: Segment[] = [];
  for (const b of blocks) {
    const lines = b.split('\n');
    const idx = lines.findIndex((l) => TS.test(l));
    if (idx < 0) continue;
    const m = lines[idx].match(TS)!;
    const text = clean(lines.slice(idx + 1).join(' '));
    if (!text) continue;
    segs.push({ start: Math.round(tsToSeconds(m[1], m[2], m[3], m[4]) * 100) / 100, text });
  }
  return dedupeRolling(segs);
}

export function dedupeRolling(segs: Segment[]): Segment[] {
  const out: Segment[] = [];
  for (const s of segs) {
    const prev = out[out.length - 1];
    if (prev) {
      if (s.text === prev.text || prev.text.endsWith(s.text)) continue;
      if (s.text.startsWith(prev.text)) {
        prev.text = s.text;
        continue;
      }
    }
    out.push({ ...s });
  }
  return out;
}

const STAMP_ONLY = /^\(?\[?(\d{1,2}:)?\d{1,2}:\d{2}\]?\)?$/;
const STAMP_PREFIX = /^\(?\[?((?:\d{1,2}:)?\d{1,2}:\d{2})\]?\)?[\s\-–—:]+(.+)$/;
const stampSeconds = (s: string) => s.split(':').map(Number).reduce((a, n) => a * 60 + n, 0);

/**
 * Parses what a student is likely to paste: SRT/VTT, YouTube's "transcript panel" copy
 * (timestamp on one line, text on the next, or "0:12 text"), or plain prose.
 */
export function parseTranscriptText(raw: string): { segments: Segment[]; format: 'srt' | 'vtt' | 'stamped' | 'plain' } {
  const text = raw.replace(/\r/g, '').replace(/^\uFEFF/, '');
  if (/^WEBVTT/m.test(text.slice(0, 200)) || TS.test(text)) {
    const segs = parseSubtitles(text);
    if (segs.length) return { segments: segs, format: /^WEBVTT/m.test(text.slice(0, 200)) ? 'vtt' : 'srt' };
  }
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const stamped: Segment[] = [];
  let pending: number | null = null;
  let stampHits = 0;
  for (const l of lines) {
    if (STAMP_ONLY.test(l)) {
      pending = stampSeconds(l.replace(/[()\[\]]/g, ''));
      stampHits++;
      continue;
    }
    const m = l.match(STAMP_PREFIX);
    if (m) {
      stampHits++;
      const t = clean(m[2]);
      if (t) stamped.push({ start: stampSeconds(m[1]), text: t });
      pending = null;
      continue;
    }
    const t = clean(l);
    if (!t) continue;
    if (pending !== null) {
      stamped.push({ start: pending, text: t });
      pending = null;
    } else if (stamped.length && stampHits > 2) {
      stamped[stamped.length - 1].text += ' ' + t;
    } else {
      stamped.push({ start: -1, text: t });
    }
  }
  if (stampHits >= 3 && stamped.length) return { segments: stamped.filter((s) => s.text), format: 'stamped' };
  // plain prose: one segment per paragraph (or per ~40 words if it's one blob)
  const paras = text.split(/\n\s*\n/).map(clean).filter(Boolean);
  const segs: Segment[] = [];
  for (const p of paras.length > 1 ? paras : [clean(text)]) {
    const words = p.split(' ');
    for (let i = 0; i < words.length; i += 60) segs.push({ start: -1, text: words.slice(i, i + 60).join(' ') });
  }
  return { segments: segs, format: 'plain' };
}

export const wordCount = (segs: Segment[]) => segs.reduce((n, s) => n + s.text.split(/\s+/).filter(Boolean).length, 0);

export function fmtTime(sec: number): string {
  if (sec < 0 || !Number.isFinite(sec)) return '';
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
}
