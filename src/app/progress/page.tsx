'use client';
import { Award, Calculator, Clipboard, Flame, Gamepad2, Layers, Library, Map, Sparkles, Target, Trophy, Zap } from 'lucide-react';
import Link from 'next/link';
import { timeAgo, useApi } from '@/lib/client';
import { Badge, ButtonLink, Disclaimer, EmptyState, ErrorBox, PageHeader, Progress, SkeletonCards, Stat } from '@/components/ui';
import { Gauge, Heatmap, Ring, TrendChart } from '@/components/charts';
import { EmptyArt } from '@/components/art';

interface Sec { name: string; pct: number | null; answered: number }
interface Ready { pct: number | null; band: string; sections: Sec[]; answered: number; note: string }
interface Dash {
  xp: { level: number; xp: number; floor: number; next: number; pct: number }; streak: { current: number; longest: number; activeToday: boolean };
  today: { minutes: number; xp: number }; week: { minutes: number; goal: number }; cards: { due: number; new: number };
  heatmap: Record<string, number>; mastery: { topic: string; exam: string; answered: number; correct: number; mastery: number }[];
  readiness: { teas: Ready; nclex: Ready }; trend: { id: string; title: string; pct: number; ts: number }[];
  weak: { topic: string; mastery: number; answered: number }[]; recent: { kind: string; label: string; xp: number; minutes: number; ts: number }[];
  achievements: { key: string; title: string; desc: string; icon: string; unlockedAt: number | null }[];
  totals: { answered: number; accuracy: number | null; lectures: number }; due: { due: number; newReady: number };
}
const AI: Record<string, typeof Award> = { sparkles: Sparkles, layers: Layers, library: Library, clipboard: Clipboard, target: Target, zap: Zap, flame: Flame, gamepad: Gamepad2, map: Map, calculator: Calculator, trophy: Trophy };
const KIND = { review: '🃏', test: '📝', game: '🎮', lesson: '📖', lecture: '✨', program_day: '🗺️', export: '📄' } as Record<string, string>;

export default function ProgressPage() {
  const { data: d, error, loading, reload } = useApi<Dash>('/api/dashboard');
  if (error) return <ErrorBox message={error} retry={reload} />;
  if (loading || !d) return <div><PageHeader title="Progress" /><SkeletonCards n={6} h="h-44" /></div>;
  const mastery = (exam: string) => d.mastery.filter((m) => m.exam === exam);
  const examNames: Record<string, string> = { teas: 'TEAS 7', nclex: 'NCLEX-RN', core: 'Core nursing', dosage: 'Dosage calculation', lecture: 'My study sets' };
  const unlocked = d.achievements.filter((a) => a.unlockedAt).length;
  return (
    <div className="space-y-10">
      <PageHeader title="Progress" subtitle="Your study habits and where to focus next." />
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4" aria-label="Summary">
        <Stat label="Level" value={d.xp.level} sub={<span className="tnum">{d.xp.xp} XP · {d.xp.next - d.xp.xp} to level {d.xp.level + 1}</span>} tone="text-sun-600" />
        <Stat label="Streak" value={<>{d.streak.current}<span className="text-base text-muted font-semibold"> days</span></>} sub={`Longest: ${d.streak.longest}`} tone="text-coral-600" />
        <Stat label="This week" value={<>{d.week.minutes}<span className="text-base text-muted font-semibold"> min</span></>} sub={`Goal: ${d.week.goal} min`} />
        <Stat label="Cards due" value={d.due.due} sub={`${d.due.newReady} new ready`} tone="text-brand-700" />
      </section>

      <section className="grid lg:grid-cols-[2fr_1fr] gap-4" aria-label="Weekly goal and accuracy">
        <div className="card p-5 md:p-6">
          <div className="flex items-center gap-5">
            <Ring value={Math.min(100, (d.week.minutes / d.week.goal) * 100)} size={104} label="Weekly goal progress"><span className="font-display text-xl font-extrabold tnum">{Math.round(Math.min(100, (d.week.minutes / d.week.goal) * 100))}%</span></Ring>
            <div><h2 className="font-display text-xl font-extrabold">Weekly goal</h2><p className="text-muted">{d.week.minutes} of {d.week.goal} minutes. {d.week.minutes >= d.week.goal ? 'Goal reached. 🎉' : `${d.week.goal - d.week.minutes} to go this week.`}</p><Link href="/settings" className="text-sm font-bold text-brand-700">Change goal</Link></div>
          </div>
        </div>
        <div className="card p-5 md:p-6"><div className="eyebrow">Practice accuracy</div><div className="font-display text-4xl font-extrabold tnum mt-1">{d.totals.accuracy === null ? '—' : `${d.totals.accuracy}%`}</div><p className="text-sm text-muted">{d.totals.answered} questions answered · {d.totals.lectures} study set{d.totals.lectures === 1 ? '' : 's'}</p></div>
      </section>

      <section aria-labelledby="ready-h">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3"><h2 id="ready-h" className="text-2xl font-extrabold">Readiness estimates</h2><Badge tone="gray">Estimates only, not predictors</Badge></div>
        <div className="grid md:grid-cols-2 gap-4">
          {([['TEAS 7', d.readiness.teas], ['NCLEX-RN', d.readiness.nclex]] as const).map(([name, r]) => (
            <div key={name} className="card p-5 md:p-6">
              <Gauge value={r.pct} label={name} band={r.band} />
              <ul className="mt-4 space-y-2">{r.sections.map((s) => <li key={s.name}><div className="flex justify-between text-sm"><span className="font-medium truncate pr-2">{s.name}</span><span className="tnum text-muted shrink-0">{s.pct === null ? `${s.answered}/5 answered` : `${s.pct}%`}</span></div><Progress value={s.pct ?? 0} tone={s.pct === null ? 'brand' : s.pct >= 80 ? 'brand' : s.pct >= 60 ? 'sun' : 'coral'} className="!h-1.5 mt-1" label={s.name} /></li>)}</ul>
              <p className="text-xs text-muted mt-4 leading-relaxed">{r.note} This is a rough guide from your practice on Penlight, not a score prediction. Real exam results depend on many things, including the exam itself.</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid lg:grid-cols-2 gap-4">
        <div className="card p-5 md:p-6"><h2 className="font-display text-xl font-extrabold mb-1">Test score trend</h2><p className="text-sm text-muted mb-3">Your last {d.trend.length || 'few'} finished tests. The line marks 70%.</p>
          {d.trend.length ? <TrendChart points={d.trend} /> : <div className="flex items-center gap-4 py-4"><EmptyArt kind="chart" className="h-24 w-auto" /><div><p className="text-muted">Finish a practice test and your trend appears here.</p><ButtonLink href="/practice" size="sm" className="mt-3">Take a test</ButtonLink></div></div>}</div>
        <div className="card p-5 md:p-6"><h2 className="font-display text-xl font-extrabold mb-1">Weak areas</h2><p className="text-sm text-muted mb-3">Topics under 70% with at least 3 answers.</p>
          {d.weak.length ? <><ul className="space-y-3">{d.weak.map((w) => <li key={w.topic}><div className="flex justify-between text-sm font-semibold"><span>{w.topic}</span><span className="tnum text-muted">{w.mastery}% · {w.answered} answered</span></div><Progress value={w.mastery} tone="coral" className="mt-1" label={w.topic} /></li>)}</ul><ButtonLink href="/practice" variant="secondary" size="sm" className="mt-4"><Target size={14} aria-hidden /> Practice weak areas</ButtonLink></>
            : <p className="text-muted py-4">{d.totals.answered < 5 ? 'Answer a few questions to see where to focus.' : 'Nothing below 70%. Keep it up!'}</p>}</div>
      </section>

      <section aria-labelledby="m-h"><h2 id="m-h" className="text-2xl font-extrabold mb-3">Mastery by topic</h2>
        {d.mastery.length === 0 ? <EmptyState art={<EmptyArt kind="chart" />} title="No mastery data yet" body="Mastery is based on your recent answers in each topic. Practice a few questions to get started." action={<ButtonLink href="/practice">Start practicing</ButtonLink>} /> : (
          <div className="grid md:grid-cols-2 gap-4">{['teas', 'nclex', 'core', 'dosage', 'lecture'].filter((e) => mastery(e).length).map((e) => (
            <div key={e} className="card p-5"><div className="eyebrow mb-3">{examNames[e]}</div><ul className="space-y-3">{mastery(e).map((m) => <li key={m.topic}><div className="flex justify-between text-sm font-semibold"><span className="truncate pr-2">{m.topic}</span><span className="tnum text-muted shrink-0">{m.mastery}% <span className="font-normal">({m.answered})</span></span></div><Progress value={m.mastery} tone={m.mastery >= 80 ? 'brand' : m.mastery >= 60 ? 'sun' : 'coral'} className="mt-1" label={m.topic} /></li>)}</ul></div>))}</div>)}
      </section>

      <section className="grid lg:grid-cols-[1fr_1fr] gap-4">
        <div className="card p-5 md:p-6"><h2 className="font-display text-xl font-extrabold mb-4">Study heatmap</h2><Heatmap data={d.heatmap} /></div>
        <div className="card p-5 md:p-6"><h2 className="font-display text-xl font-extrabold mb-3">Recent activity</h2>
          {d.recent.length === 0 ? <p className="text-muted">No activity yet.</p> : <ul className="divide-y divide-line">{d.recent.map((a, i) => <li key={i} className="py-2.5 flex items-center gap-3 text-sm"><span aria-hidden className="text-lg">{KIND[a.kind] || '•'}</span><span className="flex-1 font-medium">{a.label}</span><span className="text-muted tnum shrink-0">{a.xp > 0 && <b className="text-sun-600 mr-2">+{a.xp}</b>}{timeAgo(a.ts)}</span></li>)}</ul>}</div>
      </section>

      <section aria-labelledby="a-h"><div className="flex items-center justify-between mb-3"><h2 id="a-h" className="text-2xl font-extrabold">Achievements</h2><Badge tone="sun">{unlocked}/{d.achievements.length} unlocked</Badge></div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{d.achievements.map((a) => { const I = AI[a.icon] || Award; const on = !!a.unlockedAt; return (
          <div key={a.key} className={`card p-4 ${on ? '' : 'opacity-60'}`}><span className={`h-11 w-11 rounded-2xl grid place-items-center mb-2 ${on ? 'bg-sun-100 text-sun-600' : 'bg-line text-faint'}`}><I size={22} aria-hidden /></span><div className="font-bold leading-tight">{a.title}</div><div className="text-xs text-muted mt-0.5">{a.desc}</div>{on && <div className="text-[11px] font-bold text-brand-700 mt-1.5">Unlocked</div>}</div>); })}</div>
      </section>
      <Disclaimer className="max-w-3xl" />
    </div>
  );
}
