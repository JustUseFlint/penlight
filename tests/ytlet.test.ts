import { describe, expect, it } from 'vitest';
import { BOOKMARKLET_SRC, bookmarkletCode, bookmarkletHref, decodeImportHash, segmentsToStampedText } from '../src/lib/ytlet';
import { parseTranscriptText } from '../src/lib/ingest/parse';

const enc = (o: unknown) => Buffer.from(JSON.stringify(o), 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
describe('YouTube helper', () => {
  it('decodes a bookmarklet payload, including unicode, and rejects junk', () => {
    const d = decodeImportHash('#' + enc({ v: 1, t: 'Cardiac “review”', u: 'https://www.youtube.com/watch?v=abcDEF12345', s: [[0, 'Hello café'], [5, ''], [9, 'World']] }));
    expect(d?.title).toBe('Cardiac “review”');
    expect(d?.segments).toEqual([{ start: 0, text: 'Hello café' }, { start: 9, text: 'World' }]);
    expect(decodeImportHash('#nonsense!!')).toBeNull();
    expect(decodeImportHash('#' + enc({ v: 2, s: [] }))).toBeNull();
  });
  it('stamped text round-trips through the paste parser with timestamps intact', () => {
    const segs = [{ start: 0, text: 'Welcome to class' }, { start: 65, text: 'The SA node paces the heart' }, { start: 3725, text: 'Closing remarks' }];
    const t = segmentsToStampedText(segs);
    expect(t.split('\n')[2]).toBe('1:02:05 Closing remarks');
    const p = parseTranscriptText(t);
    expect(p.format).toBe('stamped');
    expect(p.segments.map((s) => s.start)).toEqual([0, 65, 3725]);
  });
  it('bookmarklet is a single self-contained javascript: URL bound to the site origin', () => {
    expect(bookmarkletHref('https://penlight.example/')).toMatch(/^javascript:/);
    expect(decodeURIComponent(bookmarkletHref('https://penlight.example/'))).toContain('"https://penlight.example"');
    expect(bookmarkletCode('https://x.test')).not.toContain('\n');
    expect(BOOKMARKLET_SRC).not.toMatch(/\$\{/);
    expect(() => new Function(BOOKMARKLET_SRC.replace('__ORIGIN__', 'https://x.test'))).not.toThrow();
  });
});
