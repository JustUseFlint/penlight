'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Clock, GraduationCap, Lightbulb, Play } from 'lucide-react';
import { api, cx } from '@/lib/client';
import { Button } from './ui';

export interface LaunchScope { exam?: string; topic?: string; tags?: string[]; lectureId?: string; weak?: boolean; drills?: string[] }
export function TestLauncher({ scope, title, compact, defaultCount = 10, disabled, note }: { scope: LaunchScope; title: string; compact?: boolean; defaultCount?: number; disabled?: boolean; note?: string }) {
  const router = useRouter();
  const [count, setCount] = useState(defaultCount);
  const [mode, setMode] = useState<'tutor' | 'exam'>('tutor');
  const [timed, setTimed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function start() {
    setBusy(true); setErr(null);
    try { const a = await api<{ id: string }>('/api/attempts', { body: { title, scope, count, mode, timed } }); router.push(`/practice/${a.id}`); }
    catch (e) { setErr((e as Error).message); setBusy(false); }
  }
  const seg = (on: boolean) => cx('h-10 px-4 rounded-lg text-sm font-bold transition inline-flex items-center gap-1.5', on ? 'bg-surface shadow-card text-ink' : 'text-muted hover:text-ink');
  return (
    <div className={cx(!compact && 'card p-5 md:p-6')}>
      <div className="grid gap-4 sm:grid-cols-3">
        <div><div className="label">Questions</div><div role="radiogroup" aria-label="Number of questions" className="inline-flex p-1 rounded-xl bg-line/50">{[5, 10, 20].map((n) => <button key={n} role="radio" aria-checked={count === n} onClick={() => setCount(n)} className={seg(count === n)}>{n}</button>)}</div></div>
        <div><div className="label">Mode</div><div role="radiogroup" aria-label="Mode" className="inline-flex p-1 rounded-xl bg-line/50">
          <button role="radio" aria-checked={mode === 'tutor'} onClick={() => setMode('tutor')} className={seg(mode === 'tutor')}><Lightbulb size={14} aria-hidden /> Tutor</button>
          <button role="radio" aria-checked={mode === 'exam'} onClick={() => setMode('exam')} className={seg(mode === 'exam')}><GraduationCap size={14} aria-hidden /> Exam</button></div></div>
        <div><div className="label">Timer</div><div role="radiogroup" aria-label="Timer" className="inline-flex p-1 rounded-xl bg-line/50">
          <button role="radio" aria-checked={!timed} onClick={() => setTimed(false)} className={seg(!timed)}>Untimed</button>
          <button role="radio" aria-checked={timed} onClick={() => setTimed(true)} className={seg(timed)}><Clock size={14} aria-hidden /> Timed</button></div></div>
      </div>
      <p className="text-sm text-muted mt-3">{mode === 'tutor' ? 'Tutor mode shows the answer and rationale after each question.' : 'Exam mode hides answers until you finish, like the real test.'}{note ? ' ' + note : ''}</p>
      <div className="mt-4 flex items-center gap-3 flex-wrap"><Button onClick={start} loading={busy} disabled={disabled}><Play size={16} aria-hidden /> Start test</Button>{err && <span role="alert" className="text-sm font-semibold text-danger-600">{err}</span>}</div>
    </div>
  );
}
