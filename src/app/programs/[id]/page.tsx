'use client';
import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, ChevronDown, Lock } from 'lucide-react';
import { api, cx, useApi } from '@/lib/client';
import { Button, ButtonLink, Disclaimer, ErrorBox, Skeleton } from '@/components/ui';
import { ProgramIcon } from '@/components/art';
import { Ring } from '@/components/charts';
import { HUE, type Prog } from '@/components/hue';
import { useApp } from '@/components/AppContext';

interface Task { id: string; kind: string; title: string; minutes: number; optional?: boolean; done: boolean }
interface Day { n: number; title: string; status: 'done' | 'current' | 'todo'; tasks: Task[] }
interface Detail extends Prog { weeklyPlan: { n: number; title: string; focus: string; days: Day[] }[] }

export default function ProgramPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { refresh } = useApp();
  const { data: p, error, reload } = useApi<Detail>(`/api/programs/${id}`);
  const [open, setOpen] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (p) { const w = p.weeklyPlan.find((w) => w.days.some((d) => d.status === 'current')) ?? p.weeklyPlan[0]; setOpen(new Set([w.n])); } }, [p?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (error) return <ErrorBox message={error} retry={reload} />;
  if (!p) return <div className="space-y-4"><Skeleton className="h-52" /><Skeleton className="h-96" /></div>;
  const next = p.nextDay ?? 1;
  async function start() { setBusy(true); await api(`/api/programs/${id}/enroll`, { method: 'POST', body: {} }); refresh(); setBusy(false); reload(); }
  return (
    <div>
      <Link href="/programs" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink mb-4"><ArrowLeft size={16} aria-hidden /> Programs</Link>
      <section className="card overflow-hidden mb-8">
        <div className={cx('p-6 md:p-8 grid md:grid-cols-[1fr_auto] gap-6 items-center', HUE[p.hue].split(' ')[0])}>
          <div>
            <span className={cx('h-14 w-14 rounded-2xl grid place-items-center bg-surface shadow-card mb-4', HUE[p.hue].split(' ')[1])}><ProgramIcon name={p.icon} className="h-7 w-7" /></span>
            <h1 className="text-3xl md:text-4xl font-extrabold leading-tight">{p.title}</h1>
            <p className="mt-2 text-ink/80 max-w-2xl">{p.description}</p>
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-sm font-semibold text-ink/70"><span>{p.duration}</span><span>~{p.minutesPerDay} min per day</span><span>{p.level}</span></div>
            <div className="mt-5 flex gap-2 flex-wrap">
              <ButtonLink size="lg" href={`/programs/${p.id}/day/${next}`} onClick={() => { api(`/api/programs/${id}/enroll`, { method: 'POST', body: {} }).then(refresh); }}>{p.pct === 100 ? 'Review the plan' : p.enrolled ? `Continue: Day ${next}` : 'Start Day 1'}</ButtonLink>
              {!p.enrolled && <Button size="lg" variant="secondary" loading={busy} onClick={start}>Enroll</Button>}
            </div>
          </div>
          <div className="flex items-center gap-6 md:flex-col md:gap-3">
            <Ring value={p.pct} size={116} stroke={12} label={`${p.pct}% complete`}><div><div className="font-display text-3xl font-extrabold tnum">{p.pct}%</div></div></Ring>
            <div className="text-sm font-semibold text-ink/70 tnum">{p.completeDays}/{p.totalDays} days done</div>
          </div>
        </div>
        <div className="p-6 md:p-8 grid md:grid-cols-3 gap-5 border-t border-line">{p.outcomes.map((o) => <div key={o} className="flex gap-3"><span className="mt-0.5 h-6 w-6 rounded-full bg-brand-100 text-brand-700 grid place-items-center shrink-0"><Check size={14} aria-hidden /></span><span className="font-medium">{o}</span></div>)}</div>
      </section>

      <h2 className="text-2xl font-extrabold mb-4">Roadmap</h2>
      <ol className="space-y-4">
        {p.weeklyPlan.map((w) => {
          const done = w.days.filter((d) => d.status === 'done').length;
          const isOpen = open.has(w.n);
          return (
            <li key={w.n} className="card overflow-hidden">
              <button className="w-full flex items-center gap-4 p-5 text-left" aria-expanded={isOpen} onClick={() => setOpen((s) => { const n = new Set(s); n.has(w.n) ? n.delete(w.n) : n.add(w.n); return n; })}>
                <span className={cx('h-11 w-11 rounded-2xl grid place-items-center font-display font-extrabold shrink-0', done === w.days.length ? 'bg-brand-600 text-white' : 'bg-brand-50 text-brand-700')}>{done === w.days.length ? <Check size={20} aria-hidden /> : w.n}</span>
                <span className="min-w-0 flex-1"><span className="block eyebrow">Week {w.n}</span><span className="block font-display font-bold text-lg leading-snug">{w.title}</span><span className="block text-sm text-muted truncate">{w.focus}</span></span>
                <span className="text-sm font-bold text-muted tnum hidden sm:block">{done}/{w.days.length}</span>
                <ChevronDown className={cx('transition text-muted', isOpen && 'rotate-180')} aria-hidden />
              </button>
              {isOpen && (
                <ul className="border-t border-line divide-y divide-line">
                  {w.days.map((d) => (
                    <li key={d.n}>
                      <Link href={`/programs/${p.id}/day/${d.n}`} className={cx('flex items-center gap-4 px-5 py-3.5 hover:bg-brand-50/50 transition', d.status === 'current' && 'bg-brand-50/70')}>
                        <span className={cx('h-9 w-9 rounded-full grid place-items-center text-sm font-bold shrink-0 tnum', d.status === 'done' ? 'bg-brand-600 text-white' : d.status === 'current' ? 'bg-surface ring-4 ring-brand-300 text-brand-700 border-2 border-brand-600' : 'bg-line/70 text-muted')}>{d.status === 'done' ? <Check size={16} aria-label="Completed" /> : d.n}</span>
                        <span className="min-w-0 flex-1"><span className="block font-semibold truncate">Day {d.n}: {d.title}</span><span className="block text-xs text-muted">{d.tasks.filter((t) => !t.optional).reduce((a, t) => a + t.minutes, 0)} min · {d.tasks.filter((t) => t.done && !t.optional).length}/{d.tasks.filter((t) => !t.optional).length} tasks</span></span>
                        {d.status === 'current' && <span className="chip">Up next</span>}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
      <p className="text-sm text-muted mt-6 flex items-center gap-2"><Lock size={14} aria-hidden /> Days are never locked. Skip ahead or revisit any day whenever you like.</p>
      <Disclaimer className="mt-6 max-w-3xl" />
    </div>
  );
}
