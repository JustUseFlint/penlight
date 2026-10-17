'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Calculator, Crosshair, FileText, Layers, Target } from 'lucide-react';
import { cx, fmtDur, timeAgo, useApi } from '@/lib/client';
import { Badge, Disclaimer, ErrorBox, PageHeader, SkeletonCards } from '@/components/ui';
import { TestLauncher, type LaunchScope } from '@/components/TestLauncher';

interface Opts { banks: { exam: string; topic: string; n: number }[]; lectures: { id: string; title: string; n: number }[]; drills: { id: string; label: string }[]; weakTopics: string[] }
interface Att { id: string; title: string; mode: string; status: string; score: number | null; total: number; duration_sec: number | null; started_at: number }

interface Tile { key: string; title: string; sub: string; scope: LaunchScope; icon: typeof Layers; n?: number }

export default function PracticePage() {
  const opts = useApi<Opts>('/api/practice/options');
  const atts = useApi<{ attempts: Att[] }>('/api/attempts');
  const [sel, setSel] = useState<Tile | null>(null);
  const [drills, setDrills] = useState<string[]>(['oral', 'weight', 'iv-rate']);
  const o = opts.data;
  const count = (exam: string, topic?: string) => o?.banks.filter((b) => b.exam === exam && (!topic || b.topic === topic)).reduce((a, b) => a + b.n, 0) ?? 0;
  const groups: { title: string; blurb: string; tiles: Tile[] }[] = o ? [
    { title: 'Smart practice', blurb: 'Let Penlight pick what you most need.', tiles: [
      { key: 'weak', title: 'My weak areas', sub: o.weakTopics.length ? o.weakTopics.slice(0, 2).join(', ') : 'Answer a few questions first, then this fills in', scope: { weak: true }, icon: Crosshair },
    ] },
    { title: 'TEAS 7 style', blurb: 'Reading, Math, Science and English & Language Usage.', tiles: [
      { key: 'teas', title: 'Mixed TEAS', sub: 'All four sections', scope: { exam: 'teas' }, icon: Layers, n: count('teas') },
      ...['Reading', 'Math', 'Science', 'English & Language'].map((t) => ({ key: 'teas-' + t, title: t, sub: 'TEAS section', scope: { exam: 'teas', topic: t }, icon: Layers, n: count('teas', t) })),
    ] },
    { title: 'NCLEX-RN style', blurb: 'The eight client-needs categories, with select-all-that-apply.', tiles: [
      { key: 'nclex', title: 'Mixed NCLEX', sub: 'All categories', scope: { exam: 'nclex' }, icon: Layers, n: count('nclex') },
      ...o.banks.filter((b) => b.exam === 'nclex').map((b) => ({ key: 'nclex-' + b.topic, title: b.topic, sub: 'NCLEX category', scope: { exam: 'nclex', topic: b.topic }, icon: Layers, n: b.n })),
    ] },
    { title: 'Core nursing courses', blurb: 'A&P, pharmacology, med-surg and fundamentals.', tiles: [
      { key: 'core', title: 'Mixed core', sub: 'All four courses', scope: { exam: 'core' }, icon: Layers, n: count('core') },
      ...o.banks.filter((b) => b.exam === 'core').map((b) => ({ key: 'core-' + b.topic, title: b.topic, sub: 'Core course', scope: { exam: 'core', topic: b.topic }, icon: Layers, n: b.n })),
    ] },
    { title: 'Dosage calculation', blurb: 'Generated numeric problems with worked solutions, plus concept questions.', tiles: [
      { key: 'drill', title: 'Dosage drills', sub: 'Fresh numeric problems each time', scope: { drills }, icon: Calculator },
      { key: 'dosage', title: 'Dosage concepts', sub: 'Multiple-choice review', scope: { exam: 'dosage' }, icon: Calculator, n: count('dosage') },
    ] },
    ...(o.lectures.length ? [{ title: 'From my study sets', blurb: 'Questions generated from your lectures.', tiles: o.lectures.map((l) => ({ key: 'lec-' + l.id, title: l.title, sub: 'Study set', scope: { lectureId: l.id }, icon: FileText, n: l.n })) }] : []),
  ] : [];
  const active = sel ?? null;
  const scope: LaunchScope = active?.key === 'drill' ? { drills } : active?.scope ?? {};
  return (
    <div>
      <PageHeader title="Practice" subtitle="Exam-style questions with a rationale for every answer. Choose a topic, then set up your test." />
      {opts.error && <ErrorBox message={opts.error} retry={opts.reload} />}
      {opts.loading ? <SkeletonCards n={6} h="h-24" /> : (
        <div className="grid lg:grid-cols-[1fr_380px] gap-8 items-start">
          <div className="space-y-8 min-w-0">
            {groups.map((g) => (
              <section key={g.title} aria-labelledby={'g-' + g.title}>
                <h2 id={'g-' + g.title} className="text-xl font-extrabold">{g.title}</h2><p className="text-sm text-muted mb-3">{g.blurb}</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {g.tiles.map((t) => (
                    <button key={t.key} onClick={() => setSel(t)} aria-pressed={sel?.key === t.key} className={cx('card card-hover text-left p-4 flex items-center gap-3 border-2', sel?.key === t.key ? '!border-brand-500 bg-brand-50/60' : 'border-transparent')}>
                      <span className="h-11 w-11 rounded-xl bg-brand-50 text-brand-700 grid place-items-center shrink-0"><t.icon size={20} aria-hidden /></span>
                      <span className="min-w-0"><span className="block font-bold leading-tight">{t.title}</span><span className="block text-sm text-muted leading-snug">{t.sub}{t.n !== undefined ? ` · ${t.n} questions` : ''}</span></span>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
          <aside className="lg:sticky lg:top-24 space-y-4">
            <div className="card p-5 border-brand-300">
              <div className="eyebrow mb-1">Your test</div>
              <div className="font-display text-xl font-bold mb-4">{active ? active.title : 'Choose a topic to begin'}</div>
              {active?.key === 'drill' && (
                <fieldset className="mb-4"><legend className="label">Problem types</legend><div className="flex flex-wrap gap-1.5">{o?.drills.map((d) => <button key={d.id} aria-pressed={drills.includes(d.id)} onClick={() => setDrills((x) => (x.includes(d.id) ? (x.length > 1 ? x.filter((y) => y !== d.id) : x) : [...x, d.id]))} className={cx('chip', drills.includes(d.id) && '!bg-brand-600 !text-white')}>{d.label}</button>)}</div></fieldset>
              )}
              <TestLauncher compact title={active ? `${active.title} practice` : 'Practice'} scope={scope} disabled={!active} />
            </div>
            <div className="card p-5">
              <div className="eyebrow mb-2">Recent tests</div>
              {atts.data?.attempts.filter((a) => a.status === 'finished').length ? (
                <ul className="divide-y divide-line">{atts.data.attempts.slice(0, 5).map((a) => (
                  <li key={a.id}><Link href={`/practice/${a.id}`} className="py-2.5 flex items-center gap-3 hover:text-brand-700"><span className="min-w-0 flex-1"><span className="block text-sm font-semibold truncate">{a.title}</span><span className="block text-xs text-muted">{timeAgo(a.started_at)} · {a.status === 'finished' ? fmtDur(a.duration_sec) : 'in progress'}</span></span>
                    {a.status === 'finished' ? <Badge tone={(a.score ?? 0) / a.total >= 0.7 ? 'brand' : 'coral'}>{a.score}/{a.total}</Badge> : <Badge tone="sun">Resume</Badge>}</Link></li>
                ))}</ul>
              ) : <p className="text-sm text-muted flex gap-2"><Target size={16} className="shrink-0 mt-0.5" aria-hidden /> Your finished tests will show up here.</p>}
            </div>
          </aside>
        </div>
      )}
      <Disclaimer className="mt-10 max-w-3xl" />
    </div>
  );
}
