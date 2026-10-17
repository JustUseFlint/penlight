import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { Segment } from './parse';

export interface FetchResult {
  ok: true;
  meta: { title: string; channel?: string | null; thumbnail?: string | null; duration?: number | null; id?: string | null; webpage_url?: string | null };
  segments: Segment[];
  source: 'captions-manual' | 'captions-auto' | 'whisper';
  language?: string;
}
export interface FetchFail { ok: false; error_code: string; message: string }

export function pythonBin(): string | null {
  if (process.env.PYTHON_BIN) return process.env.PYTHON_BIN;
  const venv = path.join(process.cwd(), '.venv', 'bin', 'python');
  if (fs.existsSync(venv)) return venv;
  return 'python3';
}

function run(cmd: 'info' | 'transcript' | 'transcribe', url: string, onProgress: (p: { stage: string; pct: number; message: string }) => void, timeoutMs: number, extra: string[] = []): Promise<FetchResult | FetchFail> {
  return new Promise((resolve) => {
    const py = pythonBin();
    const script = path.join(process.cwd(), 'worker', 'ingest.py');
    if (!py || !fs.existsSync(script)) return resolve({ ok: false, error_code: 'no_python', message: 'The ingestion worker is not installed. Run `npm run setup:python`, or paste the transcript instead.' });
    const child = spawn(py, [script, cmd, url, ...extra], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PYTHONUNBUFFERED: '1' } });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve({ ok: false, error_code: 'timeout', message: 'Fetching the video took too long. Try again, or paste the transcript.' });
    }, timeoutMs);
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => {
      const text = d.toString();
      err += text;
      for (const line of text.split('\n')) {
        if (line.startsWith('PROGRESS:')) {
          try { onProgress(JSON.parse(line.slice(9))); } catch { /* ignore */ }
        }
      }
    });
    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({ ok: false, error_code: 'no_python', message: `Couldn't start Python (${e.message}). Run \`npm run setup:python\`, or paste the transcript instead.` });
    });
    child.on('close', () => {
      clearTimeout(timer);
      try {
        resolve(JSON.parse(out.trim().split('\n').pop() || ''));
      } catch {
        const missing = /No module named '(\w+)'/.exec(err);
        resolve({
          ok: false,
          error_code: missing ? 'no_python' : 'failed',
          message: missing ? `Python package "${missing[1]}" is missing. Run \`npm run setup:python\`, or paste the transcript instead.` : 'The video fetcher failed unexpectedly. Try again, or paste the transcript.',
        });
      }
    });
  });
}

export const fetchCaptions = (url: string, onProgress: Parameters<typeof run>[2]) => run('transcript', url, onProgress, 120_000);
export const transcribeAudio = (url: string, onProgress: Parameters<typeof run>[2], model = process.env.WHISPER_MODEL || 'base') =>
  run('transcribe', url, onProgress, 45 * 60_000, ['--model', model]);
