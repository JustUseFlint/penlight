import { describe, it, expect } from 'vitest';
import { parseVideoUrl } from '@/lib/ingest/url';
import { parseSubtitles, parseTranscriptText, fmtTime } from '@/lib/ingest/parse';

describe('video URL parsing', () => {
  const id = 'dQw4w9WgXcQ';
  const canon = `https://www.youtube.com/watch?v=${id}`;
  it.each([
    [`https://www.youtube.com/watch?v=${id}`], [`https://youtu.be/${id}`], [`https://youtu.be/${id}?t=42`],
    [`https://www.youtube.com/shorts/${id}`], [`https://www.youtube.com/embed/${id}`], [`https://m.youtube.com/watch?v=${id}&feature=share`],
    [`youtube.com/watch?v=${id}`], [id], [`https://www.youtube.com/live/${id}`], [`https://www.youtube-nocookie.com/embed/${id}`],
  ])('normalises %s', (u) => {
    const r = parseVideoUrl(u);
    expect(r.ok && r.kind === 'youtube' && r.url).toBe(canon);
  });
  it('playlist URL with a video resolves to that single video', () => {
    const r = parseVideoUrl(`https://www.youtube.com/watch?v=${id}&list=PL123&index=2`);
    expect(r).toMatchObject({ ok: true, kind: 'youtube', id, playlist: true, url: canon });
  });
  it('non-YouTube URLs pass through as "other"', () => {
    expect(parseVideoUrl('https://vimeo.com/76979871')).toMatchObject({ ok: true, kind: 'other' });
  });
  it('rejects empty, junk, non-http and private/local hosts (SSRF)', () => {
    for (const bad of ['', '   ', 'javascript:alert(1)', 'file:///etc/passwd', 'http://localhost:3100/x', 'http://127.0.0.1/v', 'http://192.168.1.5/a.mp4', 'http://10.0.0.1/a', 'http://169.254.169.254/latest', 'ftp://example.com/a']) {
      expect(parseVideoUrl(bad).ok, bad).toBe(false);
    }
  });
});

describe('subtitle / transcript parsing', () => {
  it('parses SRT with timestamps and multi-line cues', () => {
    const srt = `1\n00:00:01,000 --> 00:00:03,500\nThe SA node is the pacemaker.\n\n2\n00:01:05,250 --> 00:01:08,000\nIt fires 60 to\n100 times a minute.\n`;
    const s = parseSubtitles(srt);
    expect(s).toHaveLength(2);
    expect(s[0]).toMatchObject({ start: 1, text: 'The SA node is the pacemaker.' });
    expect(s[1].start).toBeCloseTo(65.25); expect(s[1].text).toBe('It fires 60 to 100 times a minute.');
  });
  it('parses VTT with header, hour stamps, tags and rolling duplicates', () => {
    const vtt = `WEBVTT\nKind: captions\n\n00:00:00.000 --> 00:00:02.000 align:start\n<c>Hello</c> class\n\n01:00:00.500 --> 01:00:02.000\nHour mark line\n\n01:00:02.000 --> 01:00:04.000\nHour mark line\n`;
    const s = parseSubtitles(vtt);
    expect(s[0].text).toBe('Hello class');
    expect(s.find((x) => x.start === 3600.5)).toBeTruthy();
    expect(s.filter((x) => x.text === 'Hour mark line').length).toBe(1);
  });
  it('detects format of pasted text', () => {
    expect(parseTranscriptText('1\n00:00:01,000 --> 00:00:02,000\nhi there\n').format).toBe('srt');
    expect(parseTranscriptText('WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nhi there\n').format).toBe('vtt');
    const plain = parseTranscriptText('This is just a paragraph. It has two sentences about the heart.');
    expect(plain.format).toBe('plain'); expect(plain.segments.length).toBeGreaterThan(0);
  });
  it('parses inline [mm:ss] stamped text', () => {
    const r = parseTranscriptText('0:05 First thing said\n1:10 Second thing said\n2:00 Third thing said\n');
    expect(r.format).toBe('stamped'); expect(r.segments[1].start).toBe(70);
    const panel = parseTranscriptText('0:00\nWelcome to class\n0:12\nToday is the heart\n0:30\nStart with the SA node\n');
    expect(panel.format).toBe('stamped'); expect(panel.segments[2]).toMatchObject({ start: 30, text: 'Start with the SA node' });
  });
  it('formats times', () => { expect(fmtTime(65)).toBe('1:05'); expect(fmtTime(3725)).toMatch(/1:02:05/); });
});
