'use client';
import { Suspense, use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Check, Flame, RotateCcw, X } from 'lucide-react';
import { api, cx, useApi } from '@/lib/client';
import { Button, ButtonLink, EmptyState, ErrorBox, Progress, Skeleton } from '@/components/ui';
import { CelebrateArt, EmptyArt } from '@/components/art';
import { fireConfetti } from '@/components/confetti';
import { useApp } from '@/components/AppContext';

type GameId = 'match' | 'speed' | 'gap' | 'sequence';
interface Done { correct: number; total: number; bestStreak?: number; seconds?: number; detail?: string }
const TITLES: Record<GameId, string> = { match: 'Match Rush', speed: 'Speed Round', gap: 'Fill the Gap', sequence: 'Sequence Builder' };
const shuffle = <T,>(a: T[]) => { const x = [...a]; for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; };

/* ------------------------------------------------------------------ Match Rush */
function Match({ rounds, onDone }: { rounds: { id: string; term: string; def: string }[][]; onDone: (d: Done) => void }) {
  const [r, setR] = useState(0);
  const pairs = rounds[r];
  const defs = useMemo(() => shuffle(pairs), [pairs]);
  const terms = useMemo(() => shuffle(pairs), [pairs]);
  const [pickT, setPickT] = useState<string | null>(null);
  const [matched, setMatched] = useState<Set<string>>(new Set());
  const [wrongPair, setWrongPair] = useState<{ t: string; d: string } | null>(null);
  const [mistaken, setMistaken] = useState<Set<string>>(new Set());
  const [clean, setClean] = useState(0);
  const [total, setTotal] = useState(0);
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(0);
  const [secs, setSecs] = useState(0);
  useEffect(() => { const t = setInterval(() => setSecs((s) => s + 1), 1000); return () => clearInterval(t); }, []);
  const choose = (side: 't' | 'd', id: string) => {
    if (matched.has(id) || wrongPair) return;
    if (side === 't') { setPickT(id === pickT ? null : id); return; }
    if (!pickT) return;
    if (pickT === id) {
      const m = new Set(matched); m.add(id); setMatched(m); setPickT(null);
      const first = !mistaken.has(id); setClean((c) => c + (first ? 1 : 0)); setTotal((t) => t + 1); setStreak((s) => { const n = first ? s + 1 : 0; setBest((b) => Math.max(b, n)); return n; });
      if (m.size === pairs.length) setTimeout(() => { if (r + 1 < rounds.length) { setR(r + 1); setMatched(new Set()); setMistaken(new Set()); } else onDone({ correct: clean + (first ? 1 : 0), total: total + 1, bestStreak: Math.max(best, first ? streak + 1 : 0), seconds: secs }); }, 650);
    } else {
      setWrongPair({ t: pickT, d: id }); setMistaken((s) => new Set(s).add(pickT)); setStreak(0);
      setTimeout(() => { setWrongPair(null); setPickT(null); }, 600);
    }
  };
  return (
    <div>
      <div className="flex items-center justify-between mb-4 text-sm font-bold text-muted"><span>Round {r + 1} of {rounds.length}</span><span className="tnum">⏱ {secs}s</span><span className="inline-flex items-center gap-1 text-coral-600 tnum"><Flame size={14} aria-hidden /> {streak}</span></div>
      <Progress value={(matched.size / pairs.length) * 100} className="mb-5" label="Round progress" />
      <div className="grid grid-cols-2 gap-3 md:gap-6">
        <ul className="space-y-2.5" aria-label="Terms">{terms.map((p) => (
          <li key={p.id}><button disabled={matched.has(p.id)} aria-pressed={pickT === p.id} onClick={() => choose('t', p.id)} className={cx('w-full min-h-[64px] rounded-2xl border-2 px-3 py-2.5 text-left font-bold text-[14px] md:text-[15px] transition active:scale-[.98]', matched.has(p.id) ? 'border-brand-300 bg-brand-50 text-brand-700 opacity-60 scale-[.97]' : wrongPair?.t === p.id ? 'border-coral-500 bg-coral-50 animate-shake' : pickT === p.id ? 'border-brand-500 bg-brand-50 shadow-card' : 'border-line bg-surface hover:border-brand-300')}>{p.term}</button></li>))}</ul>
        <ul className="space-y-2.5" aria-label="Definitions">{defs.map((p) => (
          <li key={p.id}><button disabled={matched.has(p.id)} onClick={() => choose('d', p.id)} className={cx('w-full min-h-[64px] rounded-2xl border-2 px-3 py-2.5 text-left text-[13px] md:text-[14.5px] leading-snug transition active:scale-[.98]', matched.has(p.id) ? 'border-brand-300 bg-brand-50 text-brand-700 opacity-60 scale-[.97]' : wrongPair?.d === p.id ? 'border-coral-500 bg-coral-50 animate-shake' : 'border-line bg-surface hover:border-sky-500/50')}>{p.def}</button></li>))}</ul>
      </div>
      <p className="text-center text-sm text-muted mt-5">Tap a term, then the definition that matches it.</p>
    </div>
  );
}

/* ------------------------------------------------------------------ Speed Round */
function Speed({ items, seconds, onDone }: { items: { statement: string; answer: boolean; explanation: string }[]; seconds: number; onDone: (d: Done) => void }) {
  const [i, setI] = useState(0);
  const [left, setLeft] = useState(seconds);
  const [started, setStarted] = useState(false);
  const [correct, setCorrect] = useState(0);
  const [answered, setAnswered] = useState(0);
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(0);
  const [flash, setFlash] = useState<null | { ok: boolean; text: string }>(null);
  const fin = useRef(false);
  const end = useCallback((c: number, a: number, b: number) => { if (fin.current) return; fin.current = true; onDone({ correct: c, total: Math.max(1, a), bestStreak: b, seconds }); }, [onDone, seconds]);
  useEffect(() => { if (!started) return; if (left <= 0) { end(correct, answered, best); return; } const t = setTimeout(() => setLeft((l) => l - 1), 1000); return () => clearTimeout(t); }, [left, started, correct, answered, best, end]);
  const ans = useCallback((v: boolean) => {
    if (flash || fin.current) return;
    if (!started) setStarted(true);
    const it = items[i]; const ok = it.answer === v;
    const nc = correct + (ok ? 1 : 0), na = answered + 1, ns = ok ? streak + 1 : 0, nb = Math.max(best, ns);
    setCorrect(nc); setAnswered(na); setStreak(ns); setBest(nb);
    setFlash({ ok, text: ok ? '' : it.explanation });
    setTimeout(() => { setFlash(null); if (i + 1 >= items.length) end(nc, na, nb); else setI(i + 1); }, ok ? 380 : 1500);
  }, [flash, items, i, correct, answered, streak, best, started, end]);
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key.toLowerCase() === 't' || e.key === 'ArrowRight') ans(true); if (e.key.toLowerCase() === 'f' || e.key === 'ArrowLeft') ans(false); }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [ans]);
  const it = items[i];
  return (
    <div className="max-w-xl mx-auto">
      <div className="flex items-center justify-between mb-3 text-sm font-bold"><span className={cx('tnum px-3 h-9 inline-flex items-center rounded-full', left <= 10 && started ? 'bg-coral-50 text-coral-600' : 'bg-line/60 text-muted')} role="timer" aria-label={`${left} seconds left`}>⏱ {left}s</span><span className="text-brand-700 tnum">{correct} correct</span><span className="inline-flex items-center gap-1 text-coral-600 tnum"><Flame size={14} aria-hidden /> {streak}</span></div>
      <Progress value={(left / seconds) * 100} tone={left <= 10 ? 'coral' : 'brand'} className="mb-5" label="Time left" />
      <div className={cx('card p-7 md:p-9 min-h-[220px] grid place-items-center text-center transition', flash && (flash.ok ? '!border-brand-500 !bg-brand-50' : '!border-coral-500 !bg-coral-50 animate-shake'))} aria-live="polite">
        <div><p className="font-display text-xl md:text-2xl font-bold leading-snug">{it.statement}</p>{flash && !flash.ok && <p className="mt-4 text-sm text-ink/80 leading-relaxed">{flash.text}</p>}{!started && <p className="mt-4 text-sm text-faint">The clock starts when you answer.</p>}</div>
      </div>
      <div className="grid grid-cols-2 gap-3 mt-5">
        <Button variant="coral" size="lg" onClick={() => ans(false)}><X size={20} aria-hidden /> False <kbd className="hidden md:inline text-xs bg-white/25 rounded px-1.5">F</kbd></Button>
        <Button size="lg" onClick={() => ans(true)}><Check size={20} aria-hidden /> True <kbd className="hidden md:inline text-xs bg-white/25 rounded px-1.5">T</kbd></Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Fill the Gap */
function Gap({ items, onDone }: { items: { sentence: string; answer: string; options: string[]; explanation: string }[]; onDone: (d: Done) => void }) {
  const [i, setI] = useState(0);
  const [pick, setPick] = useState<string | null>(null);
  const [correct, setCorrect] = useState(0);
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(0);
  const [t0] = useState(Date.now());
  const it = items[i];
  const choose = (o: string) => {
    if (pick) return; setPick(o);
    const ok = o === it.answer; setCorrect((c) => c + (ok ? 1 : 0)); setStreak((s) => { const n = ok ? s + 1 : 0; setBest((b) => Math.max(b, n)); return n; });
  };
  const next = () => { if (i + 1 >= items.length) onDone({ correct, total: items.length, bestStreak: best, seconds: Math.round((Date.now() - t0) / 1000) }); else { setI(i + 1); setPick(null); } };
  useEffect(() => { const h = (e: KeyboardEvent) => { const n = Number(e.key); if (!pick && n >= 1 && n <= it.options.length) choose(it.options[n - 1]); if (pick && e.key === 'Enter') next(); }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); });
  const [before, after] = it.sentence.split('____');
  const ok = pick === it.answer;
  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-5"><Progress value={(i / items.length) * 100} className="flex-1" label="Progress" /><span className="text-sm font-bold text-muted tnum">{i + 1}/{items.length}</span><span className="inline-flex items-center gap-1 text-coral-600 text-sm font-bold tnum"><Flame size={14} aria-hidden /> {streak}</span></div>
      <div className="card p-7 md:p-9">
        <p className="text-xl md:text-2xl font-semibold leading-[1.7]">{before}<span className={cx('inline-block min-w-[110px] text-center border-b-4 mx-1.5 px-2 rounded-t-lg font-bold transition', !pick ? 'border-brand-400 text-transparent select-none' : ok ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-coral-500 bg-coral-50 text-coral-600')}>{pick ?? it.answer}</span>{after}</p>
        <div className="mt-7 grid grid-cols-2 gap-3" role="group" aria-label="Word bank">
          {it.options.map((o, k) => (
            <button key={o} disabled={!!pick} onClick={() => choose(o)} className={cx('min-h-[56px] rounded-2xl border-2 px-3 font-bold transition active:scale-[.97] text-[15px]', pick && o === it.answer ? 'border-brand-500 bg-brand-50 text-brand-700' : pick === o ? 'border-coral-500 bg-coral-50 text-coral-600 animate-shake' : 'border-line hover:border-brand-300 hover:bg-brand-50/40 disabled:opacity-60')}><span className="text-faint text-xs mr-2">{k + 1}</span>{o}</button>
          ))}
        </div>
        {pick && <div className={cx('mt-5 rounded-2xl px-4 py-3 animate-rise text-[15px] leading-relaxed', ok ? 'bg-brand-50' : 'bg-coral-50')}><b>{ok ? 'Correct. ' : 'Not quite. '}</b>{it.explanation}</div>}
      </div>
      <div className="mt-5 flex justify-end"><Button size="lg" disabled={!pick} onClick={next}>{i + 1 >= items.length ? 'Finish' : 'Next'}</Button></div>
    </div>
  );
}

/* ------------------------------------------------------------------ Sequence Builder */
function Sequence({ puzzles, onDone }: { puzzles: { title: string; steps: string[] }[]; onDone: (d: Done) => void }) {
  const [p, setP] = useState(0);
  const pz = puzzles[p];
  const bank0 = useMemo(() => { let s = shuffle(pz.steps.map((t, k) => ({ t, k }))); if (s.every((x, i) => x.k === i)) s = s.reverse(); return s; }, [pz]);
  const [placed, setPlaced] = useState<{ t: string; k: number }[]>([]);
  const [checked, setChecked] = useState<null | boolean[]>(null);
  const [tries, setTries] = useState(0);
  const [score, setScore] = useState(0);
  const [t0] = useState(Date.now());
  const bank = bank0.filter((b) => !placed.some((x) => x.k === b.k));
  const add = (b: { t: string; k: number }) => { if (checked?.every(Boolean)) return; setChecked(null); setPlaced([...placed, b]); };
  const remove = (k: number) => { if (checked?.every(Boolean)) return; setChecked(null); setPlaced(placed.filter((x) => x.k !== k)); };
  const check = () => {
    const res = placed.map((x, i) => x.k === i); setChecked(res); setTries((t) => t + 1);
    if (res.every(Boolean) && tries === 0) setScore((s) => s + 1);
  };
  const solved = !!checked && checked.every(Boolean);
  const next = () => { if (p + 1 >= puzzles.length) onDone({ correct: score, total: puzzles.length, seconds: Math.round((Date.now() - t0) / 1000) }); else { setP(p + 1); setPlaced([]); setChecked(null); setTries(0); } };
  const reveal = () => { setPlaced(pz.steps.map((t, k) => ({ t, k }))); setChecked(pz.steps.map(() => true)); };
  return (
    <div className="max-w-xl mx-auto">
      <div className="flex items-center gap-3 mb-5"><Progress value={(p / puzzles.length) * 100} className="flex-1" label="Progress" /><span className="text-sm font-bold text-muted tnum">{p + 1}/{puzzles.length}</span></div>
      <div className="card p-6 md:p-7">
        <h2 className="font-display text-xl font-extrabold">{pz.title}</h2>
        <p className="text-sm text-muted mt-1">Tap the steps in the correct order. Tap a placed step to remove it.</p>
        <ol className="mt-5 space-y-2 min-h-[56px]" aria-label="Your order">
          {placed.map((x, i) => (
            <li key={x.k}><button onClick={() => remove(x.k)} className={cx('w-full flex items-center gap-3 rounded-2xl border-2 px-3.5 py-3 text-left font-semibold transition animate-pop', checked ? (checked[i] ? 'border-brand-500 bg-brand-50' : 'border-coral-500 bg-coral-50 animate-shake') : 'border-brand-300 bg-brand-50/60')}>
              <span className={cx('h-7 w-7 rounded-full grid place-items-center text-xs text-white shrink-0', checked ? (checked[i] ? 'bg-brand-600' : 'bg-coral-500') : 'bg-brand-600')}>{checked ? (checked[i] ? <Check size={14} /> : <X size={14} />) : i + 1}</span>{x.t}</button></li>
          ))}
          {placed.length === 0 && <li className="rounded-2xl border-2 border-dashed border-line px-4 py-4 text-faint text-sm">Your sequence appears here</li>}
        </ol>
        {!solved && bank.length > 0 && <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label="Steps to place">{bank.map((b) => <button key={b.k} onClick={() => add(b)} className="rounded-xl border-2 border-line bg-surface hover:border-brand-400 hover:-translate-y-0.5 transition px-3.5 py-2.5 font-semibold text-[14.5px] text-left">{b.t}</button>)}</div>}
        {solved && <div className="mt-5 rounded-2xl bg-brand-50 px-4 py-3 font-semibold text-brand-700 animate-rise">Correct order! {tries === 1 ? '+1 point for getting it first try.' : ''}</div>}
        {checked && !solved && <p className="mt-4 text-sm text-coral-600 font-semibold" role="status">Some steps are out of place. Remove the red ones and try again.</p>}
      </div>
      <div className="mt-5 flex items-center justify-between gap-3">
        <Button variant="ghost" onClick={() => { setPlaced([]); setChecked(null); }} disabled={!placed.length || solved}><RotateCcw size={16} aria-hidden /> Reset</Button>
        <div className="flex gap-2">
          {!solved && tries >= 2 && <Button variant="secondary" onClick={reveal}>Show answer</Button>}
          {solved ? <Button size="lg" onClick={next}>{p + 1 >= puzzles.length ? 'Finish' : 'Next puzzle'}</Button> : <Button size="lg" disabled={placed.length !== pz.steps.length} onClick={check}>Check order</Button>}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ shell */
function GameInner({ game }: { game: GameId }) {
  const sp = useSearchParams();
  const { refresh, achievements } = useApp();
  const [seed, setSeed] = useState(() => Math.random().toString(36).slice(2));
  const qs = useMemo(() => { const p = new URLSearchParams({ game, seed }); for (const k of ['lecture', 'deck', 'exam', 'tags']) if (sp.get(k)) p.set(k, sp.get(k)!); return p.toString(); }, [game, seed, sp]);
  const { data, error, loading, reload } = useApi<Record<string, unknown> & { label: string; note?: string | null }>(`/api/games?${qs}`);
  const [done, setDone] = useState<(Done & { xp?: number }) | null>(null);
  const programId = sp.get('program'), taskId = sp.get('task');
  const back = programId ? `/programs/${programId}` : '/games';

  const onDone = useCallback(async (d: Done) => {
    setDone(d); if (d.total > 0 && d.correct / d.total >= 0.6) fireConfetti(0.7);
    try {
      const r = await api<{ xp: number; newAchievements: string[] }>('/api/games', { body: { game, source: data?.label, ...d, program: programId && taskId ? { programId, taskId } : undefined } });
      setDone({ ...d, xp: r.xp }); achievements(r.newAchievements); refresh();
    } catch { /* ignore */ }
  }, [game, data, programId, taskId, achievements, refresh]);

  const again = () => { setDone(null); setSeed(Math.random().toString(36).slice(2)); };
  const content = (() => {
    if (!data) return null;
    if (game === 'match') { const r = data.rounds as { id: string; term: string; def: string }[][]; return r.length ? <Match key={seed} rounds={r} onDone={onDone} /> : null; }
    if (game === 'speed') { const it = data.items as { statement: string; answer: boolean; explanation: string }[]; return it.length >= 4 ? <Speed key={seed} items={it} seconds={60} onDone={onDone} /> : null; }
    if (game === 'gap') { const it = data.items as { sentence: string; answer: string; options: string[]; explanation: string }[]; return it.length >= 3 ? <Gap key={seed} items={it} onDone={onDone} /> : null; }
    const pz = data.puzzles as { title: string; steps: string[] }[]; return pz.length ? <Sequence key={seed} puzzles={pz} onDone={onDone} /> : null;
  })();

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link href={back} className="h-10 w-10 grid place-items-center rounded-full hover:bg-line/60" aria-label="Back"><ArrowLeft size={20} /></Link>
        <div><h1 className="text-2xl md:text-3xl font-extrabold leading-tight">{TITLES[game]}</h1>{data?.label && <p className="text-sm text-muted">{data.label}</p>}</div>
      </div>
      {error && <ErrorBox message={error} retry={reload} />}
      {loading && <Skeleton className="h-96 max-w-xl mx-auto" />}
      {!loading && data && !content && <EmptyState art={<EmptyArt kind="cards" />} title="Not enough content for this game yet" body="This source doesn't have enough material for this game. Try a different source, or build a longer study set." action={<ButtonLink href="/games">Pick another source</ButtonLink>} />}
      {data?.note ? <p className="text-sm text-muted text-center mb-3">{String(data.note)}</p> : null}
      {!done && content}
      {done && (
        <div className="max-w-md mx-auto card p-8 text-center animate-pop">
          <CelebrateArt className="h-28 w-auto mx-auto" />
          <h2 className="text-3xl font-extrabold mt-1">{done.correct / Math.max(1, done.total) >= 0.8 ? 'Great round!' : 'Round complete'}</h2>
          <div className="grid grid-cols-3 gap-3 mt-5">
            <div className="rounded-2xl bg-brand-50 p-3"><div className="font-display text-3xl font-extrabold tnum text-brand-700">{done.correct}/{done.total}</div><div className="text-[11px] font-bold uppercase tracking-wider text-muted">Correct</div></div>
            <div className="rounded-2xl bg-coral-50 p-3"><div className="font-display text-3xl font-extrabold tnum text-coral-600">{done.bestStreak ?? 0}</div><div className="text-[11px] font-bold uppercase tracking-wider text-muted">Best streak</div></div>
            <div className="rounded-2xl bg-sun-50 p-3"><div className="font-display text-3xl font-extrabold tnum text-sun-600">+{done.xp ?? '…'}</div><div className="text-[11px] font-bold uppercase tracking-wider text-muted">XP</div></div>
          </div>
          <div className="mt-6 flex gap-2 justify-center flex-wrap"><Button onClick={again}><RotateCcw size={16} aria-hidden /> Play again</Button><ButtonLink href={back} variant="secondary">{programId ? 'Back to program' : 'All games'}</ButtonLink></div>
        </div>
      )}
    </div>
  );
}

export default function GamePage({ params }: { params: Promise<{ game: string }> }) {
  const { game } = use(params);
  if (!(game in TITLES)) return <ErrorBox message="Unknown game." />;
  return <Suspense fallback={<Skeleton className="h-96" />}><GameInner game={game as GameId} /></Suspense>;
}
