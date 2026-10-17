'use client';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, RotateCcw, Zap } from 'lucide-react';
import { api, cx, useApi } from '@/lib/client';
import { Button, ButtonLink, EmptyState, ErrorBox, Progress, Skeleton } from '@/components/ui';
import { CelebrateArt, EmptyArt } from '@/components/art';
import { fireConfetti } from '@/components/confetti';
import { useApp } from '@/components/AppContext';

interface QCard { id: string; type: string; front: string; back: string; topic: string | null; status: string; intervals: Record<'0' | '1' | '2' | '3', string>; isNew: boolean; deckId: string }
interface Queue { cards: QCard[]; counts: { due: number; new: number; newAvailable: number; total: number; newAllowance: number } }

const GRADES: { g: 0 | 1 | 2 | 3; label: string; key: string; cls: string }[] = [
  { g: 0, label: 'Still learning', key: '1', cls: 'bg-coral-50 text-coral-600 border-coral-500/30 hover:bg-coral-100' },
  { g: 1, label: 'Hard', key: '2', cls: 'bg-sun-50 text-sun-600 border-sun-500/30 hover:bg-sun-100' },
  { g: 2, label: 'I know it', key: '3', cls: 'bg-brand-50 text-brand-700 border-brand-500/30 hover:bg-brand-100' },
  { g: 3, label: 'Easy', key: '4', cls: 'bg-sky-50 text-sky-600 border-sky-500/30 hover:bg-sky-100' },
];

const Cloze = ({ text, reveal }: { text: string; reveal: boolean }) => {
  const parts = text.split(/(\{\{c1::.+?(?:::.+?)?\}\})/g);
  return <>{parts.map((p, i) => { const m = p.match(/^\{\{c1::(.+?)(?:::.+?)?\}\}$/); if (!m) return <span key={i}>{p}</span>; return reveal ? <mark key={i} className="bg-brand-100 text-brand-800 rounded-md px-1.5 font-bold">{m[1]}</mark> : <span key={i} className="inline-block min-w-16 border-b-4 border-brand-400 text-transparent select-none mx-1">{m[1]}</span>; })}</>;
};

function StudyInner() {
  const sp = useSearchParams();
  const { refresh, achievements } = useApp();
  const qs = useMemo(() => {
    const p = new URLSearchParams();
    for (const k of ['deck', 'lecture', 'tags', 'topic', 'exam', 'limit']) if (sp.get(k)) p.set(k, sp.get(k)!);
    if (sp.get('program')) p.set('program', '1');
    if (sp.get('program')) p.set('limit', p.get('limit') || '30');
    return p.toString();
  }, [sp]);
  const programId = sp.get('program'), taskId = sp.get('task');
  const { data, error, loading, reload } = useApi<Queue>(`/api/cards/queue?${qs}`);
  const [queue, setQueue] = useState<QCard[]>([]);
  const [flipped, setFlipped] = useState(false);
  const [stats, setStats] = useState({ reviewed: 0, know: 0, again: 0, xp: 0 });
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const started = useRef(Date.now());
  const completed = useRef(false);
  const total = useRef(0);

  useEffect(() => { if (data) { setQueue(data.cards); total.current = data.cards.length; setDone(data.cards.length === 0 && false); started.current = Date.now(); } }, [data]);

  const card = queue[0];
  const finish = useCallback(async () => {
    setDone(true); fireConfetti(0.8);
    if (programId && taskId && !completed.current) { completed.current = true; try { const r = await api<{ newAchievements: string[] }>(`/api/programs/${programId}/tasks`, { body: { taskId } }); achievements(r.newAchievements); } catch { /* ignore */ } }
    refresh();
  }, [programId, taskId, refresh, achievements]);

  // program tasks with nothing to review still complete
  useEffect(() => { if (data && data.cards.length === 0 && programId && taskId && !completed.current) { completed.current = true; api(`/api/programs/${programId}/tasks`, { body: { taskId } }).then(refresh).catch(() => {}); } }, [data, programId, taskId, refresh]);

  const grade = useCallback(async (g: 0 | 1 | 2 | 3) => {
    if (!card || busy) return;
    setBusy(true);
    try {
      const r = await api<{ newAchievements: string[] }>('/api/cards/review', { body: { cardId: card.id, grade: g } });
      achievements(r.newAchievements);
      setStats((s) => ({ reviewed: s.reviewed + 1, know: s.know + (g >= 2 ? 1 : 0), again: s.again + (g === 0 ? 1 : 0), xp: s.xp + (g >= 2 ? 3 : 2) }));
      setFlipped(false);
      setQueue((q) => {
        const [first, ...rest] = q;
        if (g === 0) { const at = Math.min(rest.length, 3); const out = [...rest.slice(0, at), first, ...rest.slice(at)]; return out; }
        if (rest.length === 0) setTimeout(finish, 250);
        return rest;
      });
    } finally { setBusy(false); }
  }, [card, busy, achievements, finish]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (done || !card || (e.target as HTMLElement)?.closest('input,textarea')) return;
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setFlipped((f) => !f); }
      else if (flipped && ['1', '2', '3', '4'].includes(e.key)) { e.preventDefault(); grade((Number(e.key) - 1) as 0 | 1 | 2 | 3); }
      else if (flipped && e.key === 'ArrowLeft') grade(0);
      else if (flipped && e.key === 'ArrowRight') grade(2);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [card, flipped, grade, done]);

  const back = programId ? `/programs/${programId}` : sp.get('lecture') ? `/library/${sp.get('lecture')}#cards` : sp.get('deck') ? `/decks/${encodeURIComponent(sp.get('deck')!)}` : '/library';

  if (error) return <ErrorBox message={error} retry={reload} />;
  if (loading || !data) return <div className="max-w-2xl mx-auto space-y-4"><Skeleton className="h-4" /><Skeleton className="h-80" /></div>;
  if (data.cards.length === 0 && !done) {
    return (
      <div className="max-w-xl mx-auto"><EmptyState art={<EmptyArt kind="cards" />} title="You're all caught up" body={programId ? 'No cards are due for this task, so it has been marked complete.' : data.counts.total === 0 ? 'No cards here yet. Start a premade deck from the Library, or build a study set from a lecture.' : 'No cards are due right now. Come back tomorrow, or pick a deck to learn new cards.'} action={<div className="flex gap-2 justify-center"><ButtonLink href={back}>{programId ? 'Back to program' : 'Browse decks'}</ButtonLink></div>} /></div>
    );
  }
  if (done) {
    const pctKnow = stats.reviewed ? Math.round((stats.know / stats.reviewed) * 100) : 0;
    const mins = Math.max(1, Math.round((Date.now() - started.current) / 60000));
    return (
      <div className="max-w-xl mx-auto text-center card p-8 md:p-10 animate-pop">
        <CelebrateArt className="h-32 w-auto mx-auto" />
        <h1 className="text-3xl font-extrabold mt-2">Session complete!</h1>
        <p className="text-muted mt-1">{stats.reviewed} reviews in about {mins} min. Cards you missed come back sooner.</p>
        <div className="grid grid-cols-3 gap-3 mt-6">
          <div className="rounded-2xl bg-brand-50 p-4"><div className="font-display text-3xl font-extrabold tnum text-brand-700">{pctKnow}%</div><div className="text-xs font-bold uppercase tracking-wider text-muted">Knew it</div></div>
          <div className="rounded-2xl bg-coral-50 p-4"><div className="font-display text-3xl font-extrabold tnum text-coral-600">{stats.again}</div><div className="text-xs font-bold uppercase tracking-wider text-muted">To revisit</div></div>
          <div className="rounded-2xl bg-sun-50 p-4"><div className="font-display text-3xl font-extrabold tnum text-sun-600">+{stats.xp}</div><div className="text-xs font-bold uppercase tracking-wider text-muted">XP</div></div>
        </div>
        <div className="mt-7 flex gap-2 justify-center flex-wrap"><ButtonLink href={back}>{programId ? 'Back to program' : 'Done'}</ButtonLink><Button variant="secondary" onClick={() => { setStats({ reviewed: 0, know: 0, again: 0, xp: 0 }); setDone(false); completed.current = true; reload(); }}><RotateCcw size={16} aria-hidden /> Study more</Button></div>
      </div>
    );
  }
  if (!card) return <div className="max-w-2xl mx-auto space-y-4"><Skeleton className="h-4" /><Skeleton className="h-80" /></div>;
  const remaining = queue.length;
  const progress = total.current ? ((total.current - remaining) / total.current) * 100 : 0;
  const isCloze = card.type === 'cloze';
  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-5">
        <Link href={back} className="h-10 w-10 grid place-items-center rounded-full hover:bg-line/60" aria-label="Exit session"><ArrowLeft size={20} /></Link>
        <Progress value={progress} className="flex-1" label="Session progress" />
        <span className="text-sm font-bold text-muted tnum" aria-live="polite">{remaining} left</span>
      </div>
      <div className="flex justify-between text-xs font-bold uppercase tracking-wider text-muted mb-2 px-1">
        <span>{card.isNew ? '✦ New card' : card.status === 'learning' ? 'Relearning' : 'Review'}</span><span className="truncate ml-3">{card.topic}</span>
      </div>
      <div className="flip-scene">
        <div className={cx('flip-card relative', flipped && 'is-flipped')} style={{ minHeight: 320 }}>
          <button onClick={() => setFlipped(true)} aria-label="Show answer" aria-hidden={flipped} tabIndex={flipped ? -1 : 0}
            className="flip-face absolute inset-0 card p-8 md:p-10 grid place-items-center text-center cursor-pointer hover:shadow-lift transition-shadow">
            <div><div className="font-display text-2xl md:text-3xl font-bold leading-snug">{isCloze ? <Cloze text={card.front} reveal={false} /> : card.front}</div><div className="mt-6 text-sm text-faint font-semibold">Tap or press Space to flip</div></div>
          </button>
          <div className="flip-face flip-back absolute inset-0 card p-8 md:p-10 grid place-items-center text-center bg-brand-50 border-brand-200" aria-hidden={!flipped} onClick={() => setFlipped(false)}>
            <div><div className="eyebrow mb-3">{isCloze ? 'Answer' : card.front.length < 70 ? card.front : 'Answer'}</div><div className="text-xl md:text-2xl font-semibold leading-snug">{isCloze ? <Cloze text={card.front} reveal /> : card.back}</div>{isCloze && card.back && <p className="mt-4 text-muted">{card.back}</p>}</div>
          </div>
        </div>
      </div>
      <div className="mt-6 min-h-[84px]">
        {flipped ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 animate-rise" role="group" aria-label="How well did you know it?">
            {GRADES.map((g) => (
              <button key={g.g} disabled={busy} onClick={() => grade(g.g)} className={cx('rounded-2xl border-2 h-[72px] px-2 flex flex-col items-center justify-center font-bold transition active:scale-[.97]', g.cls)}>
                <span className="text-[15px]">{g.label}</span><span className="text-xs font-semibold opacity-75 tnum">{card.intervals[String(g.g) as '0'] } · key {g.key}</span>
              </button>
            ))}
          </div>
        ) : (
          <Button size="lg" className="w-full" onClick={() => setFlipped(true)}>Show answer <kbd className="hidden md:inline ml-2 text-xs bg-white/20 rounded px-1.5 py-0.5">Space</kbd></Button>
        )}
      </div>
      <p className="text-center text-xs text-muted mt-4 flex items-center justify-center gap-1.5"><Zap size={12} aria-hidden /> Keys: Space flips · 1 to 4 grade · ← still learning · → I know it</p>
    </div>
  );
}
export default function StudyPage() { return <Suspense fallback={<Skeleton className="h-80 max-w-2xl mx-auto" />}><StudyInner /></Suspense>; }
