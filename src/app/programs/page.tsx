'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Clock } from 'lucide-react';
import { cx, useApi } from '@/lib/client';
import { Badge, Disclaimer, ErrorBox, PageHeader, Progress, SkeletonCards } from '@/components/ui';
import { ProgramIcon } from '@/components/art';

import { HUE, type Prog } from '@/components/hue';
const GROUPS = [['all', 'All'], ['teas', 'TEAS 7'], ['nclex', 'NCLEX-RN'], ['core', 'Core tracks'], ['dosage', 'Dosage math']] as const;

export default function ProgramsPage() {
  const { data, error, loading, reload } = useApi<{ programs: Prog[] }>('/api/programs');
  const [f, setF] = useState<string>('all');
  const list = (data?.programs ?? []).filter((p) => f === 'all' || p.exam === f);
  const active = (data?.programs ?? []).filter((p) => p.enrolled && p.pct < 100);
  return (
    <div>
      <PageHeader title="Study programs" subtitle="Guided, day-by-day plans. Each day pairs a short lesson with flashcards and practice, so you always know what to do next." />
      {error && <ErrorBox message={error} retry={reload} />}
      {active.length > 0 && (
        <section className="mb-8" aria-labelledby="inprog"><h2 id="inprog" className="text-xl font-extrabold mb-3">In progress</h2>
          <div className="grid gap-4 md:grid-cols-2">{active.map((p) => (
            <Link key={p.id} href={`/programs/${p.id}/day/${p.nextDay ?? 1}`} className="card card-hover p-5 flex items-center gap-4">
              <span className={cx('h-14 w-14 rounded-2xl grid place-items-center shrink-0', HUE[p.hue])}><ProgramIcon name={p.icon} className="h-7 w-7" /></span>
              <div className="min-w-0 flex-1"><div className="font-bold truncate">{p.title}</div><div className="text-sm text-muted">Day {p.nextDay} next · {p.completeDays}/{p.totalDays} days</div><Progress value={p.pct} className="mt-2 !h-2" label={p.title + ' progress'} /></div>
              <ArrowRight className="text-brand-700 shrink-0" aria-hidden />
            </Link>))}</div></section>
      )}
      <div className="flex gap-2 flex-wrap mb-5" role="group" aria-label="Filter programs">{GROUPS.map(([id, label]) => <button key={id} aria-pressed={f === id} onClick={() => setF(id)} className={cx('chip !h-9 !px-4', f === id && '!bg-brand-600 !text-white')}>{label}</button>)}</div>
      {loading ? <SkeletonCards n={6} h="h-64" /> : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((p) => (
            <Link key={p.id} href={`/programs/${p.id}`} className="card card-hover p-6 flex flex-col">
              <div className="flex items-start justify-between"><span className={cx('h-14 w-14 rounded-2xl grid place-items-center', HUE[p.hue])}><ProgramIcon name={p.icon} className="h-7 w-7" /></span><Badge tone="gray">{p.level}</Badge></div>
              <h2 className="font-display text-xl font-extrabold mt-4 leading-snug">{p.title}</h2>
              <p className="text-muted text-[15px] mt-1">{p.subtitle}</p>
              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted font-medium"><span>{p.duration}</span><span className="inline-flex items-center gap-1"><Clock size={14} aria-hidden /> ~{p.minutesPerDay} min/day</span></div>
              <div className="mt-auto pt-5">{p.enrolled ? <><Progress value={p.pct} label="Progress" className="!h-2" /><div className="mt-1.5 text-sm font-semibold text-brand-700">{p.pct === 100 ? 'Completed 🎉' : `${p.completeDays}/${p.totalDays} days · Continue`}</div></> : <span className="inline-flex items-center gap-1 font-bold text-brand-700 text-sm">View plan <ArrowRight size={16} aria-hidden /></span>}</div>
            </Link>
          ))}
        </div>
      )}
      <Disclaimer className="mt-10 max-w-3xl" />
    </div>
  );
}
