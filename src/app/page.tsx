'use client';
import Link from 'next/link';
import { ArrowRight, Flame, Layers, ListChecks, Map, Play, Target, Zap } from 'lucide-react';
import { useApi, timeAgo } from '@/lib/client';
import { Badge, ButtonLink, Progress, Skeleton, ModeBadge, Disclaimer } from '@/components/ui';
import { HeroArt, EmptyArt, ProgramIcon } from '@/components/art';
import { IngestBox } from '@/components/IngestBox';
import { Gauge, Ring } from '@/components/charts';
import { useApp } from '@/components/AppContext';

interface Dash {
  xp: { level: number; xp: number; floor: number; next: number; pct: number };
  streak: { current: number; longest: number; activeToday: boolean };
  today: { minutes: number; xp: number }; week: { minutes: number; goal: number };
  cards: { due: number; new: number };
  readiness: { teas: { pct: number | null; band: string; answered: number }; nclex: { pct: number | null; band: string; answered: number } };
  weak: { topic: string; mastery: number }[];
  recent: { kind: string; label: string; xp: number; ts: number }[];
  totals: { answered: number; accuracy: number | null; lectures: number };
  due: { due: number; newReady: number };
}
interface Prog { id: string; title: string; hue: string; icon: string; pct: number; enrolled: boolean; nextDay: number | null; completeDays: number; totalDays: number }
interface Lec { id: string; title: string; mode: string | null; topic: string | null; is_sample: number; created_at: number; cards: number; questions: number; status: string }

export default function HomePage() {
  const { me } = useApp();
  const dash = useApi<Dash>('/api/dashboard');
  const progs = useApi<{ programs: Prog[] }>('/api/programs');
  const lecs = useApi<{ lectures: Lec[] }>('/api/lectures');
  const samples = useApi<{ samples: { slug: string; title: string }[] }>('/api/ingest');
  const d = dash.data;
  const enrolled = progs.data?.programs.filter((p) => p.enrolled && p.pct < 100) ?? [];
  const latest = lecs.data?.lectures.find((l) => l.status === 'ready');
  const dueCount = d?.due.due ?? 0;
  const hue = (h: string) => ({ brand: 'bg-brand-50 text-brand-700', coral: 'bg-coral-50 text-coral-600', sun: 'bg-sun-50 text-sun-600', sky: 'bg-sky-50 text-sky-600', grape: 'bg-grape-50 text-grape-600' }[h] || 'bg-brand-50 text-brand-700');

  return (
    <div className="space-y-10">
      {/* hero */}
      <section className="relative overflow-hidden rounded-[28px] border border-line bg-gradient-to-br from-brand-50 via-surface to-sun-50 p-6 md:p-10 shadow-card">
        <div className="grid md:grid-cols-[1.25fr_1fr] gap-6 md:gap-10 items-center">
          <div>
            <div className="chip mb-4"><Zap size={14} aria-hidden /> Lecture → study set in about a minute</div>
            <h1 className="text-[34px] leading-[1.08] md:text-[52px] font-extrabold">Turn any lecture into your <span className="text-brand-600">nursing study set</span>.</h1>
            <p className="mt-3 text-muted text-base md:text-lg max-w-xl">Paste a link and get a study guide PDF, spaced-repetition flashcards, NCLEX- and TEAS-style practice with rationales, and learning games.</p>
          </div>
          <div className="hidden md:block"><HeroArt className="w-full h-auto" /></div>
        </div>
        <div className="mt-6 md:mt-8 max-w-4xl"><IngestBox hero samples={samples.data?.samples} /></div>
      </section>

      {/* continue studying */}
      <section aria-labelledby="continue-h">
        <div className="flex items-center justify-between mb-4"><h2 id="continue-h" className="text-2xl font-extrabold">Continue studying</h2></div>
        <div className="grid gap-4 md:grid-cols-3">
          {dash.loading ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-36" />) : (
            <>
              <Link href={dueCount > 0 || (d?.due.newReady ?? 0) > 0 ? '/study' : '/library'} className="card card-hover p-5 flex flex-col">
                <div className="flex items-center gap-3"><span className="h-11 w-11 rounded-xl bg-coral-50 text-coral-600 grid place-items-center"><Layers size={22} aria-hidden /></span><div><div className="eyebrow">Flashcards</div><div className="font-bold text-lg leading-tight">{dueCount > 0 ? `${dueCount} cards due` : 'Nothing due today'}</div></div></div>
                <p className="text-sm text-muted mt-3">{dueCount > 0 ? 'Review now to lock in what you learned. It takes about ' + Math.max(2, Math.round(dueCount * 0.4)) + ' min.' : (d?.due.newReady ?? 0) > 0 ? `${d?.due.newReady} new cards are ready to learn.` : 'Build a study set or start a premade deck.'}</p>
                <span className="mt-auto pt-3 inline-flex items-center gap-1 font-bold text-brand-700 text-sm">Start review <ArrowRight size={16} aria-hidden /></span>
              </Link>
              {enrolled[0] ? (
                <Link href={`/programs/${enrolled[0].id}/day/${enrolled[0].nextDay ?? 1}`} className="card card-hover p-5 flex flex-col">
                  <div className="flex items-center gap-3"><span className={`h-11 w-11 rounded-xl grid place-items-center ${hue(enrolled[0].hue)}`}><ProgramIcon name={enrolled[0].icon} /></span><div className="min-w-0"><div className="eyebrow">Your program</div><div className="font-bold leading-tight truncate">{enrolled[0].title}</div></div></div>
                  <div className="mt-3 text-sm text-muted">Day {enrolled[0].nextDay} is up next · {enrolled[0].completeDays}/{enrolled[0].totalDays} days done</div>
                  <Progress value={enrolled[0].pct} className="mt-2" label="Program progress" />
                  <span className="mt-auto pt-3 inline-flex items-center gap-1 font-bold text-brand-700 text-sm">Open today's plan <ArrowRight size={16} aria-hidden /></span>
                </Link>
              ) : (
                <Link href="/programs" className="card card-hover p-5 flex flex-col">
                  <div className="flex items-center gap-3"><span className="h-11 w-11 rounded-xl bg-grape-50 text-grape-600 grid place-items-center"><Map size={22} aria-hidden /></span><div><div className="eyebrow">Study programs</div><div className="font-bold text-lg leading-tight">Follow a guided plan</div></div></div>
                  <p className="text-sm text-muted mt-3">TEAS 7 prep, NCLEX-RN foundations, core nursing tracks, and dosage math, one short day at a time.</p>
                  <span className="mt-auto pt-3 inline-flex items-center gap-1 font-bold text-brand-700 text-sm">Browse programs <ArrowRight size={16} aria-hidden /></span>
                </Link>
              )}
              {latest ? (
                <Link href={`/library/${latest.id}`} className="card card-hover p-5 flex flex-col">
                  <div className="flex items-center gap-3"><span className="h-11 w-11 rounded-xl bg-sky-50 text-sky-600 grid place-items-center"><Play size={22} aria-hidden /></span><div className="min-w-0"><div className="eyebrow">Latest study set</div><div className="font-bold leading-tight line-clamp-2">{latest.title}</div></div></div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted"><ModeBadge mode={latest.mode} /> {latest.cards} cards · {latest.questions} questions</div>
                  <span className="mt-auto pt-3 inline-flex items-center gap-1 font-bold text-brand-700 text-sm">Open <ArrowRight size={16} aria-hidden /></span>
                </Link>
              ) : (
                <Link href="/practice" className="card card-hover p-5 flex flex-col">
                  <div className="flex items-center gap-3"><span className="h-11 w-11 rounded-xl bg-sky-50 text-sky-600 grid place-items-center"><ListChecks size={22} aria-hidden /></span><div><div className="eyebrow">Practice</div><div className="font-bold text-lg leading-tight">Take a quick quiz</div></div></div>
                  <p className="text-sm text-muted mt-3">TEAS and NCLEX-style questions with rationales for every answer, including select-all-that-apply.</p>
                  <span className="mt-auto pt-3 inline-flex items-center gap-1 font-bold text-brand-700 text-sm">Start practice <ArrowRight size={16} aria-hidden /></span>
                </Link>
              )}
            </>
          )}
        </div>
      </section>

      {/* dashboard widgets */}
      <section aria-labelledby="dash-h">
        <div className="flex items-center justify-between mb-4"><h2 id="dash-h" className="text-2xl font-extrabold">Your progress</h2><Link href="/progress" className="font-bold text-brand-700 text-sm inline-flex items-center gap-1">Full dashboard <ArrowRight size={16} aria-hidden /></Link></div>
        {dash.loading || !d ? <div className="grid gap-4 md:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-44" />)}</div> : (
          <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
            <div className="card p-5">
              <div className="eyebrow flex items-center gap-1.5"><Flame size={14} aria-hidden /> Streak</div>
              <div className="mt-1 font-display text-5xl font-extrabold tnum text-coral-600">{d.streak.current}<span className="text-lg text-muted font-semibold ml-1">day{d.streak.current === 1 ? '' : 's'}</span></div>
              <p className="text-sm text-muted mt-1">{d.streak.activeToday ? 'You studied today. Nice.' : d.streak.current > 0 ? 'Study today to keep it going.' : 'Start a streak today.'}</p>
            </div>
            <div className="card p-5 flex flex-col items-center justify-center text-center">
              <Ring value={d.xp.pct} size={92} tone="sun-500" label={`Level ${d.xp.level}, ${d.xp.pct}% to next level`}><div><div className="font-display text-2xl font-extrabold leading-none">{d.xp.level}</div><div className="text-[10px] font-bold text-muted uppercase tracking-wider">Level</div></div></Ring>
              <p className="text-sm text-muted mt-2 tnum">{d.xp.xp} / {d.xp.next} XP</p>
            </div>
            <div className="card p-5 flex flex-col items-center justify-center text-center">
              <Ring value={Math.min(100, (d.week.minutes / d.week.goal) * 100)} size={92} label="Weekly goal"><div><div className="font-display text-2xl font-extrabold leading-none tnum">{d.week.minutes}</div><div className="text-[10px] font-bold text-muted uppercase tracking-wider">of {d.week.goal} min</div></div></Ring>
              <p className="text-sm text-muted mt-2">Weekly goal</p>
            </div>
            <div className="card p-5">
              <div className="eyebrow flex items-center gap-1.5"><Target size={14} aria-hidden /> Focus areas</div>
              {d.weak.length === 0 ? <p className="text-sm text-muted mt-2">{d.totals.answered < 5 ? 'Answer a few practice questions and your weakest topics will show up here.' : 'No weak spots right now. Keep practicing!'}</p> : (
                <ul className="mt-2 space-y-2">{d.weak.slice(0, 3).map((w) => (<li key={w.topic}><div className="flex justify-between text-sm font-semibold"><span className="truncate pr-2">{w.topic}</span><span className="tnum text-muted">{w.mastery}%</span></div><Progress value={w.mastery} tone="coral" className="mt-1 !h-2" label={w.topic} /></li>))}</ul>
              )}
            </div>
            <div className="card p-5 col-span-2 md:col-span-2">
              <div className="flex items-center justify-between"><div className="eyebrow">Readiness estimates</div><Badge tone="gray">Estimates, not predictions</Badge></div>
              <div className="grid grid-cols-2 gap-2 mt-2"><Gauge value={d.readiness.teas.pct} label="TEAS" band={d.readiness.teas.band} /><Gauge value={d.readiness.nclex.pct} label="NCLEX" band={d.readiness.nclex.band} /></div>
            </div>
            <div className="card p-5 col-span-2 md:col-span-2">
              <div className="eyebrow mb-3">Recent activity</div>
              {d.recent.length === 0 ? (
                <div className="flex items-center gap-4"><EmptyArt kind="chart" className="h-20 w-auto shrink-0" /><p className="text-sm text-muted">Nothing yet. Build a study set, review a deck, or take a quiz to get started.</p></div>
              ) : (
                <ul className="divide-y divide-line">{d.recent.slice(0, 5).map((a, i) => (<li key={i} className="py-2 flex items-center justify-between gap-3 text-sm"><span className="truncate font-medium">{a.label}</span><span className="shrink-0 text-muted tnum">{a.xp > 0 && <span className="text-sun-600 font-bold mr-2">+{a.xp} XP</span>}{timeAgo(a.ts)}</span></li>))}</ul>
              )}
            </div>
          </div>
        )}
      </section>
      {me && <Disclaimer className="max-w-3xl" />}
    </div>
  );
}
