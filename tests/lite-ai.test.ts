import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { loadSample, SAMPLES } from '@/lib/ingest/samples';
import { buildLite } from '@/lib/lite/engine';
import { buildAi, validateQuestion } from '@/lib/llm/ai-engine';
import { chat, extractJson, testConnection } from '@/lib/llm/client';
import type { LlmConfig } from '@/lib/llm/config';
import { wordCount } from '@/lib/ingest/parse';

describe('sample lectures', () => {
  it('has three labelled samples of 1500–2500 words', () => {
    expect(SAMPLES).toHaveLength(3);
    for (const s of SAMPLES) {
      const { segments, sample } = loadSample(s.slug);
      const w = wordCount(segments);
      expect(w, s.slug).toBeGreaterThanOrEqual(1400); expect(w, s.slug).toBeLessThanOrEqual(2600);
      expect(sample.title.length).toBeGreaterThan(5);
    }
  });
});

describe('Lite engine (offline)', () => {
  for (const s of SAMPLES) {
    it(`builds a complete, valid study set from "${s.slug}"`, () => {
      const { segments, durationSec, sample } = loadSample(s.slug);
      const out = buildLite(segments, { title: sample.title, durationSec, seed: s.slug });
      expect(out.guide.mode).toBe('lite');
      expect(out.guide.sections.length).toBeGreaterThanOrEqual(3);
      expect(out.guide.glossary.length).toBeGreaterThanOrEqual(8);
      expect(out.cards.length).toBeGreaterThanOrEqual(20);
      expect(out.questions.length).toBeGreaterThanOrEqual(10);
      for (const q of out.questions) {
        expect(q.rationale.length).toBeGreaterThan(10);
        expect(new Set(q.options.map((o) => o.toLowerCase())).size, q.stem).toBe(q.options.length);
        if (q.type === 'mcq') expect(q.correct).toHaveLength(1);
        else expect(q.correct.length).toBeGreaterThanOrEqual(2);
        for (const c of q.correct) expect(c).toBeLessThan(q.options.length);
      }
      // timestamps carried through to key points
      const stamped = out.guide.sections.flatMap((x) => x.points).filter((p) => typeof p.start === 'number');
      expect(stamped.length).toBeGreaterThan(3);
      // games data present
      expect(out.guide.games.tf.length).toBeGreaterThanOrEqual(4);
    });
  }
  it('is deterministic for the same seed', () => {
    const { segments } = loadSample('medication-safety');
    const a = buildLite(segments, { title: 'x', seed: 'k' }), b = buildLite(segments, { title: 'x', seed: 'k' });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
  it('rejects a too-short transcript with a friendly message', () => {
    expect(() => buildLite([{ start: 0, text: 'The heart pumps blood. It has four chambers.' }], { title: 'tiny' })).toThrow(/too short/i);
  });
});

describe('AI engine against local mock OpenAI-compatible server', () => {
  let proc: ChildProcess; const port = 4057; const flakyPort = 4058; let flaky: ChildProcess;
  const start = (p: number, env: Record<string, string> = {}) => new Promise<ChildProcess>((resolve) => {
    const c = spawn('node', ['scripts/mock-llm.mjs', String(p)], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'inherit'] });
    c.stdout!.once('data', () => resolve(c));
  });
  beforeAll(async () => { proc = await start(port); flaky = await start(flakyPort, { MOCK_FLAKY: '1' }); });
  afterAll(() => { proc?.kill(); flaky?.kill(); });
  const cfg = (p: number, over: Partial<LlmConfig> = {}): LlmConfig => ({ provider: 'custom', apiKey: 'mock-key', model: 'mock-model', baseUrl: `http://127.0.0.1:${p}/v1`, style: 'openai', source: 'env', ...over });

  it('testConnection ok with the right key, fails clearly with a wrong key', async () => {
    expect((await testConnection(cfg(port))).ok).toBe(true);
    const bad = await testConnection(cfg(port, { apiKey: 'nope' }));
    expect(bad.ok).toBe(false); expect(bad.message).toMatch(/401|key|auth/i);
  });
  it('builds an AI study set, drops invalid questions, labels mode "ai"', async () => {
    const { segments } = loadSample('cardiac-conduction');
    const out = await buildAi(cfg(port), segments, { title: 'Cardiac', durationSec: 700 });
    expect(out.guide.mode).toBe('ai');
    expect(out.guide.sections.length).toBe(4);
    expect(out.questions.length).toBe(11);               // 12 returned, 1 invalid dropped
    expect(out.questions.some((q) => q.stem === 'Broken question')).toBe(false);
    expect(out.cards.some((c) => c.type === 'cloze')).toBe(true);
    expect(out.guide.sections[1].start).toBe(60);
  });
  it('repairs malformed JSON with a retry', async () => {
    const { segments } = loadSample('medication-safety');
    const out = await buildAi(cfg(flakyPort), segments, { title: 'Meds' });
    expect(out.guide.mode).toBe('ai'); expect(out.cards.length).toBeGreaterThan(10);
  });
  it('speaks the Anthropic messages format too', async () => {
    const text = await chat(cfg(port, { style: 'anthropic', baseUrl: `http://127.0.0.1:${port}` }), [{ role: 'user', content: 'Reply with exactly: OK' }]);
    expect(text).toBe('OK');
  });
  it('extractJson handles fences, chatter and trailing commas', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('Here: {"a":[1,2,],}')).toEqual({ a: [1, 2] });
    expect(() => extractJson('no json')).toThrow();
  });
  it('validateQuestion rejects bad shapes', () => {
    const base = { type: 'mcq' as const, stem: 's', options: ['a', 'b', 'c', 'd'], correct: [1], rationale: 'r' };
    expect(validateQuestion(base)).not.toBeNull();
    expect(validateQuestion({ ...base, correct: [1, 2] })).toBeNull();
    expect(validateQuestion({ ...base, options: ['a', 'A', 'c', 'd'] })).toBeNull();
    expect(validateQuestion({ ...base, correct: [9] })).toBeNull();
    expect(validateQuestion({ ...base, type: 'sata', options: ['a', 'b', 'c', 'd', 'e'], correct: [0] })).toBeNull();
    expect(validateQuestion({ ...base, rationale: ' ' })).toBeNull();
  });
});
