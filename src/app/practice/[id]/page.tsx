'use client';
import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, ChevronLeft, ChevronRight, Clock, Flag, RotateCcw, X } from 'lucide-react';
import { api, cx, fmtDur, useApi } from '@/lib/client';
import { Badge, Button, ButtonLink, ErrorBox, Progress, Skeleton, Disclaimer } from '@/components/ui';
import { Ring } from '@/components/charts';
import { CelebrateArt } from '@/components/art';
import { fireConfetti } from '@/components/confetti';
import { useApp } from '@/components/AppContext';

type Corr = number[] | { answer: number; unit?: string; tol?: number };
interface Q { id: string; type: 'mcq' | 'sata' | 'numeric'; topic: string; stem: string; options: string[]; selectCount?: number; unit?: string; correct?: Corr; rationale?: string; isCorrect?: boolean; yourAnswer?: number[] | string | null }
interface Attempt { id: string; title: string; mode: 'tutor' | 'exam'; timed: boolean; timeLimitSec: number | null; status: 'in_progress' | 'finished'; total: number; startedAt: number; questions: Q[]; answers?: Record<string, number[] | string>; score?: number; pct?: number; durationSec?: number; perTopic?: { topic: string; correct: number; total: number; pct: number }[]; unanswered?: number; xp?: number; newAchievements?: string[]; scope?: { retakeOf?: string; program?: { programId: string; taskId: string } } }

const L = ['A', 'B', 'C', 'D', 'E', 'F'];
const fmtT = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.max(0, s) % 60).padStart(2, '0')}`;
const corrText = (q: Q) => Array.isArray(q.correct) ? q.correct.map((i) => `${L[i]}. ${q.options[i]}`).join('; ') : `${(q.correct as { answer: number; unit?: string }).answer} ${(q.correct as { unit?: string }).unit ?? ''}`;

export default function AttemptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { refresh, achievements } = useApp();
  const { data, error, loading, reload, setData } = useApi<Attempt>(`/api/attempts/${id}`);
  const [idx, setIdx] = useState(0);
  const [sel, setSel] = useState<Record<number, number[] | string>>({});
  const [revealed, setRevealed] = useState<Record<number, { correct: boolean; rationale: string; correctAnswer: Corr }>>({});
  const [busy, setBusy] = useState(false);
  const [left, setLeft] = useState<number | null>(null);
  const [flags, setFlags] = useState<Set<number>>(new Set());
  const [result, setResult] = useState<Attempt | null>(null);
  const [filter, setFilter] = useState<'missed' | 'all'>('missed');
  const [retakeErr, setRetakeErr] = useState<string | null>(null);
  const finishing = useRef(false);
  const t0 = useRef(Date.now());

  useEffect(() => {
    if (!data) return;
    if (data.status === 'finished') { setResult(data); return; }
    // resume
    const s: Record<number, number[] | string> = {}, r: typeof revealed = {};
    Object.entries(data.answers ?? {}).forEach(([k, v]) => { s[Number(k)] = v; });
    data.questions.forEach((q, i) => { if (q.rationale !== undefined && q.correct !== undefined) r[i] = { correct: !!q.isCorrect, rationale: q.rationale, correctAnswer: q.correct }; });
    setSel(s); setRevealed(r);
    const firstOpen = data.questions.findIndex((_, i) => s[i] === undefined);
    setIdx(Math.max(0, firstOpen));
    t0.current = data.startedAt ? Math.min(Date.now(), data.startedAt) : Date.now();
    if (data.timed && data.timeLimitSec) setLeft(Math.max(0, data.timeLimitSec - Math.round((Date.now() - data.startedAt) / 1000)));
  }, [data]);

  const finish = useCallback(async () => {
    if (finishing.current) return;
    finishing.current = true; setBusy(true);
    try {
      const r = await api<Attempt>(`/api/attempts/${id}/finish`, { body: { durationSec: Math.round((Date.now() - t0.current) / 1000) } });
      setResult(r); window.scrollTo({ top: 0 });
      if ((r.pct ?? 0) >= 70) fireConfetti((r.pct ?? 0) >= 90 ? 1.2 : 0.8);
      achievements(r.newAchievements ?? []); refresh();
      if (r.scope?.program) router.prefetch(`/programs/${r.scope.program.programId}`);
    } catch (e) { finishing.current = false; alert((e as Error).message); } finally { setBusy(false); }
  }, [id, refresh, achievements, router]);

  useEffect(() => {
    if (left === null || result) return;
    if (left <= 0) { finish(); return; }
    const t = setTimeout(() => setLeft((x) => (x === null ? x : x - 1)), 1000);
    return () => clearTimeout(t);
  }, [left, result, finish]);

  const q = data?.questions[idx];
  const answered = (i: number) => sel[i] !== undefined && !(Array.isArray(sel[i]) && (sel[i] as number[]).length === 0) && sel[i] !== '';
  const locked = !!revealed[idx];

  const saveExam = useCallback((i: number, v: number[] | string) => { api(`/api/attempts/${id}/answer`, { body: { index: i, answer: v } }).catch(() => {}); }, [id]);
  const toggle = useCallback((o: number) => {
    if (!q || locked) return;
    const cur = (sel[idx] as number[] | undefined) ?? [];
    const nv = q.type === 'mcq' ? [o] : cur.includes(o) ? cur.filter((x) => x !== o) : [...cur, o];
    setSel((s) => ({ ...s, [idx]: nv }));
    if (data?.mode === 'exam') saveExam(idx, nv);
  }, [q, idx, locked, sel, data, saveExam]);

  const submit = useCallback(async () => {
    if (!data || !q || busy) return;
    const ans = sel[idx];
    if (ans === undefined || (Array.isArray(ans) && !ans.length) || ans === '') return;
    setBusy(true);
    try {
      const r = await api<{ correct?: boolean; rationale?: string; correctAnswer?: Corr }>(`/api/attempts/${id}/answer`, { body: { index: idx, answer: ans } });
      if (data.mode === 'tutor' && r.rationale !== undefined) setRevealed((x) => ({ ...x, [idx]: { correct: !!r.correct, rationale: r.rationale!, correctAnswer: r.correctAnswer! } }));
      else if (idx < data.questions.length - 1) setIdx(idx + 1);
    } catch (e) { alert((e as Error).message); } finally { setBusy(false); }
  }, [data, q, busy, sel, idx, id]);

  const next = useCallback(() => { if (data && idx < data.questions.length - 1) setIdx(idx + 1); }, [data, idx]);

  useEffect(() => {
    if (result || !q) return;
    const h = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input,textarea')) return;
      const n = Number(e.key);
      if (q.type !== 'numeric' && n >= 1 && n <= q.options.length) { e.preventDefault(); toggle(n - 1); }
      else if (e.key === 'Enter') { e.preventDefault(); if (data?.mode === 'tutor') { if (locked) next(); else submit(); } else next(); }
      else if (e.key === 'ArrowRight' && data?.mode === 'exam') next();
      else if (e.key === 'ArrowLeft' && data?.mode === 'exam' && idx > 0) setIdx(idx - 1);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [q, result, toggle, submit, next, locked, data, idx]);

  async function retake() {
    setRetakeErr(null);
    try { const a = await api<{ id: string }>('/api/attempts', { body: { scope: { retakeOf: id }, count: 20, mode: 'tutor', title: 'Retake: missed questions' } }); router.push(`/practice/${a.id}`); setResult(null); setData(null as unknown as Attempt); finishing.current = false; }
    catch (e) { setRetakeErr((e as Error).message); }
  }

  const reviewList = useMemo(() => (result?.questions ?? []).map((qq, i) => ({ qq, i })).filter(({ qq }) => filter === 'all' || !qq.isCorrect), [result, filter]);

  if (error) return <ErrorBox message={error} retry={reload} />;
  if (loading || !data) return <div className="max-w-2xl mx-auto space-y-4"><Skeleton className="h-4" /><Skeleton className="h-96" /></div>;

  // ---------------------------------------------------------------- results
  if (result) {
    const pct = result.pct ?? 0;
    const tone = pct >= 80 ? 'brand-500' : pct >= 60 ? 'sun-500' : 'coral-500';
    return (
      <div className="max-w-3xl mx-auto space-y-8">
        <section className="card p-6 md:p-8 text-center animate-pop">
          <CelebrateArt className="h-24 w-auto mx-auto -mb-1" />
          <h1 className="text-3xl font-extrabold">{pct >= 80 ? 'Excellent work!' : pct >= 60 ? 'Solid progress' : 'Good practice. Keep going!'}</h1>
          <p className="text-muted">{result.title}</p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-8">
            <Ring value={pct} size={136} stroke={14} tone={tone} label={`Score ${pct} percent`}><div><div className="font-display text-4xl font-extrabold tnum">{pct}%</div><div className="text-xs font-bold text-muted tnum">{result.score}/{result.total}</div></div></Ring>
            <dl className="grid grid-cols-3 gap-6 text-left">
              <div><dt className="eyebrow">Time</dt><dd className="font-display text-2xl font-extrabold tnum">{fmtDur(result.durationSec) || '<1 min'}</dd></div>
              <div><dt className="eyebrow">Skipped</dt><dd className="font-display text-2xl font-extrabold tnum">{result.unanswered ?? 0}</dd></div>
              <div><dt className="eyebrow">XP earned</dt><dd className="font-display text-2xl font-extrabold tnum text-sun-600">+{result.xp ?? 0}</dd></div>
            </dl>
          </div>
          <div className="mt-6 flex flex-wrap gap-2 justify-center">
            {result.scope?.program && <ButtonLink href={`/programs/${result.scope.program.programId}`}>Back to program</ButtonLink>}
            {result.score !== result.total && <Button variant={result.scope?.program ? 'secondary' : 'primary'} onClick={retake}><RotateCcw size={16} aria-hidden /> Retake missed ({result.total - (result.score ?? 0)})</Button>}
            <ButtonLink href="/practice" variant="secondary">New test</ButtonLink>
            <ButtonLink href="/progress" variant="ghost">See progress</ButtonLink>
          </div>
          {retakeErr && <p role="alert" className="text-sm font-semibold text-danger-600 mt-3">{retakeErr}</p>}
        </section>
        {result.perTopic && result.perTopic.length > 0 && (
          <section className="card p-6" aria-labelledby="bd"><h2 id="bd" className="text-xl font-extrabold mb-4">Breakdown by topic</h2>
            <ul className="space-y-4">{result.perTopic.map((t) => (<li key={t.topic}><div className="flex justify-between text-sm font-semibold mb-1"><span>{t.topic}</span><span className="tnum text-muted">{t.correct}/{t.total} · {t.pct}%</span></div><Progress value={t.pct} tone={t.pct >= 80 ? 'brand' : t.pct >= 60 ? 'sun' : 'coral'} label={t.topic} /></li>))}</ul></section>
        )}
        <section aria-labelledby="rv">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2"><h2 id="rv" className="text-xl font-extrabold">Review questions</h2>
            <div className="inline-flex p-1 rounded-xl bg-line/50" role="group" aria-label="Filter questions">{(['missed', 'all'] as const).map((f) => <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)} className={cx('h-9 px-4 rounded-lg text-sm font-bold', filter === f ? 'bg-surface shadow-card' : 'text-muted')}>{f === 'missed' ? `Missed (${result.total - (result.score ?? 0)})` : 'All'}</button>)}</div></div>
          {reviewList.length === 0 && <p className="card p-6 text-center text-muted">Perfect score. Nothing to review!</p>}
          <ol className="space-y-4">{reviewList.map(({ qq, i }) => (
            <li key={i} className="card p-5">
              <div className="flex items-center gap-2 mb-2"><span className={cx('h-7 w-7 rounded-full grid place-items-center text-white text-xs font-bold', qq.isCorrect ? 'bg-brand-600' : 'bg-coral-500')}>{qq.isCorrect ? <Check size={14} /> : <X size={14} />}</span><span className="text-sm font-bold text-muted">Question {i + 1}</span><Badge tone="gray">{qq.topic}</Badge>{qq.type === 'sata' && <Badge tone="grape">SATA</Badge>}</div>
              <p className="font-semibold leading-relaxed">{qq.stem}</p>
              {qq.type !== 'numeric' ? (
                <ul className="mt-3 space-y-1.5">{qq.options.map((o, k) => { const right = (qq.correct as number[]).includes(k); const mine = Array.isArray(qq.yourAnswer) && qq.yourAnswer.includes(k); return (
                  <li key={k} className={cx('rounded-xl px-3.5 py-2.5 text-[15px] flex gap-3 border', right ? 'bg-brand-50 border-brand-300' : mine ? 'bg-coral-50 border-coral-500/40' : 'border-transparent')}><b className="w-5 shrink-0">{L[k]}</b><span className="flex-1">{o}</span>{right && <span className="text-xs font-bold text-brand-700">Correct{mine ? ' · your answer' : ''}</span>}{mine && !right && <span className="text-xs font-bold text-coral-600">Your answer</span>}</li>); })}</ul>
              ) : <p className="mt-3 text-sm"><b>Your answer:</b> {String(qq.yourAnswer ?? '(none)')} · <b>Correct:</b> {corrText(qq)}</p>}
              <div className="mt-3 rounded-xl bg-sky-50 border border-sky-100 px-4 py-3 text-[15px] leading-relaxed"><b className="text-sky-600">Rationale. </b>{qq.rationale}</div>
            </li>))}</ol>
        </section>
        <Disclaimer />
      </div>
    );
  }

  // ---------------------------------------------------------------- running
  if (!q) return null;
  const rev = revealed[idx];
  const isExam = data.mode === 'exam';
  const nAnswered = data.questions.filter((_, i) => answered(i)).length;
  const last = idx === data.questions.length - 1;
  const canSubmit = answered(idx) && !busy;
  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <Link href="/practice" className="h-10 w-10 grid place-items-center rounded-full hover:bg-line/60" aria-label="Exit test (progress is saved)"><X size={20} /></Link>
        <Progress value={((isExam ? nAnswered : Object.keys(revealed).length) / data.total) * 100} className="flex-1" label="Test progress" />
        {left !== null && <span className={cx('inline-flex items-center gap-1.5 font-bold tnum text-sm px-3 h-9 rounded-full', left < 60 ? 'bg-coral-50 text-coral-600' : 'bg-line/60 text-muted')} role="timer" aria-label={`${fmtT(left)} remaining`}><Clock size={14} aria-hidden /> {fmtT(left)}</span>}
      </div>
      <div className="flex items-center justify-between mb-3 text-sm">
        <span className="font-bold text-muted">Question {idx + 1} of {data.total}</span>
        <span className="flex items-center gap-2"><Badge tone={isExam ? 'grape' : 'brand'}>{isExam ? 'Exam mode' : 'Tutor mode'}</Badge><Badge tone="gray">{q.topic}</Badge></span>
      </div>
      <section className="card p-5 md:p-7" aria-labelledby="stem">
        {q.type === 'sata' && <Badge tone="grape" className="mb-3">Select all that apply</Badge>}
        {q.type === 'numeric' && <Badge tone="sky" className="mb-3">Calculation{q.unit ? ` · answer in ${q.unit}` : ''}</Badge>}
        <h1 id="stem" className="text-lg md:text-xl font-semibold leading-relaxed font-sans" style={{ letterSpacing: 0 }}>{q.stem}</h1>
        {q.type === 'numeric' ? (
          <div className="mt-5">
            <label className="label" htmlFor="num">Your answer{q.unit ? ` (${q.unit})` : ''}</label>
            <input id="num" inputMode="decimal" autoComplete="off" disabled={locked} className="input max-w-xs tnum text-lg" value={(sel[idx] as string) ?? ''} onChange={(e) => setSel((s) => ({ ...s, [idx]: e.target.value }))} onBlur={() => { if (isExam && answered(idx)) saveExam(idx, sel[idx]); }} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (isExam) { if (answered(idx)) saveExam(idx, sel[idx]); next(); } else if (locked) next(); else submit(); } }} />
          </div>
        ) : (
          <div className="mt-5 space-y-2.5" role={q.type === 'mcq' ? 'radiogroup' : 'group'} aria-labelledby="stem">
            {q.options.map((o, k) => {
              const chosen = Array.isArray(sel[idx]) && (sel[idx] as number[]).includes(k);
              const right = rev && Array.isArray(rev.correctAnswer) && rev.correctAnswer.includes(k);
              const wrong = rev && chosen && !right;
              return (
                <button key={k} role={q.type === 'mcq' ? 'radio' : 'checkbox'} aria-checked={chosen} disabled={locked} onClick={() => toggle(k)}
                  className={cx('w-full text-left flex items-start gap-3 rounded-2xl border-2 px-4 py-3.5 transition active:scale-[.995] disabled:cursor-default',
                    right ? 'border-brand-500 bg-brand-50' : wrong ? 'border-coral-500 bg-coral-50 animate-shake' : chosen ? 'border-brand-500 bg-brand-50/70' : 'border-line hover:border-brand-300 hover:bg-brand-50/40')}>
                  <span className={cx('mt-0.5 h-7 w-7 shrink-0 grid place-items-center text-xs font-bold border-2 transition', q.type === 'sata' ? 'rounded-lg' : 'rounded-full', right ? 'bg-brand-600 border-brand-600 text-white' : wrong ? 'bg-coral-500 border-coral-500 text-white' : chosen ? 'bg-brand-600 border-brand-600 text-white' : 'border-line text-muted')}>{right ? <Check size={14} /> : wrong ? <X size={14} /> : L[k]}</span>
                  <span className="text-[15.5px] leading-relaxed">{o}</span>
                </button>
              );
            })}
          </div>
        )}
        {rev && (
          <div className={cx('mt-5 rounded-2xl px-5 py-4 animate-rise border', rev.correct ? 'bg-brand-50 border-brand-200' : 'bg-coral-50 border-coral-500/30')} role="status">
            <div className={cx('font-display font-extrabold text-lg', rev.correct ? 'text-brand-700' : 'text-coral-600')}>{rev.correct ? 'Correct!' : 'Not quite'}</div>
            {!rev.correct && <p className="text-sm font-semibold mt-1">Correct answer: {corrText({ ...q, correct: rev.correctAnswer })}</p>}
            <p className="mt-2 leading-relaxed text-[15px]"><b>Rationale. </b>{rev.rationale}</p>
          </div>
        )}
      </section>
      <div className="mt-5 flex items-center gap-3">
        {isExam && <Button variant="secondary" disabled={idx === 0} onClick={() => setIdx(idx - 1)} aria-label="Previous question"><ChevronLeft size={18} aria-hidden /></Button>}
        {isExam && <button className={cx('h-11 w-11 grid place-items-center rounded-xl border', flags.has(idx) ? 'bg-sun-50 border-sun-500 text-sun-600' : 'border-line text-muted')} aria-pressed={flags.has(idx)} aria-label="Flag for review" onClick={() => setFlags((f) => { const n = new Set(f); n.has(idx) ? n.delete(idx) : n.add(idx); return n; })}><Flag size={16} /></button>}
        <div className="flex-1" />
        {!isExam && !locked && <Button size="lg" disabled={!canSubmit} loading={busy} onClick={submit}>Check answer</Button>}
        {!isExam && locked && (last ? <Button size="lg" loading={busy} onClick={finish}>See results</Button> : <Button size="lg" onClick={next}>Next question <ChevronRight size={18} aria-hidden /></Button>)}
        {isExam && (last ? <Button size="lg" loading={busy} onClick={async () => { if (answered(idx) && typeof sel[idx] === 'string') await api(`/api/attempts/${id}/answer`, { body: { index: idx, answer: sel[idx] } }); finish(); }}>Finish test</Button> : <Button size="lg" onClick={() => { if (typeof sel[idx] === 'string' && answered(idx)) saveExam(idx, sel[idx]); next(); }}>Next <ChevronRight size={18} aria-hidden /></Button>)}
      </div>
      {isExam && (
        <div className="mt-6 card p-4"><div className="flex items-center justify-between mb-2"><span className="eyebrow">Question navigator</span><button className="text-sm font-bold text-brand-700" onClick={() => { if (nAnswered < data.total && !confirm(`${data.total - nAnswered} question(s) are unanswered. Finish anyway?`)) return; finish(); }}>Finish now</button></div>
          <div className="flex flex-wrap gap-1.5">{data.questions.map((_, i) => <button key={i} onClick={() => setIdx(i)} aria-label={`Question ${i + 1}${answered(i) ? ', answered' : ''}${flags.has(i) ? ', flagged' : ''}`} aria-current={i === idx} className={cx('h-9 w-9 rounded-lg text-sm font-bold tnum border-2', i === idx ? 'border-brand-600' : 'border-transparent', answered(i) ? 'bg-brand-100 text-brand-700' : 'bg-line/60 text-muted', flags.has(i) && 'ring-2 ring-sun-500')}>{i + 1}</button>)}</div></div>
      )}
      <p className="text-center text-xs text-muted mt-5">Keys: 1 to {Math.min(q.options.length || 4, 6)} choose · Enter {isExam ? 'saves and moves on' : locked ? 'next' : 'checks'}</p>
    </div>
  );
}
