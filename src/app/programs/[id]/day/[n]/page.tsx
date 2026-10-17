'use client';
import { use, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, BookOpen, Calculator, Check, Gamepad2, Layers, ListChecks } from 'lucide-react';
import { api, cx, useApi } from '@/lib/client';
import { Badge, Button, ButtonLink, Disclaimer, ErrorBox, Skeleton } from '@/components/ui';
import { useApp } from '@/components/AppContext';
import { fireConfetti } from '@/components/confetti';

interface Task { id: string; kind: 'lesson' | 'cards' | 'quiz' | 'drill' | 'game'; title: string; minutes: number; optional?: boolean; done: boolean; score: number | null; lesson?: string; tags?: string[]; exam?: string; topic?: string; count?: number; timed?: boolean; mode?: 'tutor' | 'exam'; drills?: string[]; game?: string }
interface Day { n: number; title: string; status: string; tasks: Task[] }
interface Detail { id: string; title: string; totalDays: number; weeklyPlan: { n: number; title: string; days: Day[] }[] }
const ICON = { lesson: BookOpen, cards: Layers, quiz: ListChecks, drill: Calculator, game: Gamepad2 };
const LABEL = { lesson: 'Lesson', cards: 'Flashcards', quiz: 'Practice', drill: 'Math drill', game: 'Game' };

export default function DayPage({ params }: { params: Promise<{ id: string; n: string }> }) {
  const { id, n } = use(params);
  const num = Number(n);
  const router = useRouter();
  const { refresh, toast, achievements } = useApp();
  const { data: p, error, reload } = useApi<Detail>(`/api/programs/${id}`);
  const [busy, setBusy] = useState<string | null>(null);
  const wasDone = useRef<boolean | null>(null);
  const day = p?.weeklyPlan.flatMap((w) => w.days).find((d) => d.n === num);
  const week = p?.weeklyPlan.find((w) => w.days.some((d) => d.n === num));
  const required = day?.tasks.filter((t) => !t.optional) ?? [];
  const allDone = required.length > 0 && required.every((t) => t.done);
  useEffect(() => { if (!day) return; if (wasDone.current === false && allDone) fireConfetti(1); wasDone.current = allDone; }, [allDone, day]);
  useEffect(() => { if (p) api(`/api/programs/${id}/enroll`, { method: 'POST', body: {} }).catch(() => {}); }, [id, p?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <ErrorBox message={error} retry={reload} />;
  if (!p || !day) return <div className="max-w-2xl mx-auto space-y-4"><Skeleton className="h-12" /><Skeleton className="h-40" /><Skeleton className="h-40" /></div>;

  async function runTask(t: Task) {
    setBusy(t.id);
    const prog = { programId: id, taskId: t.id };
    try {
      if (t.kind === 'lesson') router.push(`/learn/${t.lesson}?program=${id}&task=${encodeURIComponent(t.id)}&day=${num}`);
      else if (t.kind === 'cards') {
        const q = new URLSearchParams({ program: id, task: t.id });
        if (t.tags?.length) q.set('tags', t.tags.join(',')); if (t.topic) q.set('topic', t.topic); if (t.exam && !t.tags?.length) q.set('exam', t.exam);
        router.push(`/study?${q}`);
      } else if (t.kind === 'quiz' || t.kind === 'drill') {
        const scope = t.kind === 'drill' ? { drills: t.drills, program: prog } : { tags: t.tags, exam: t.exam, topic: t.topic, program: prog };
        const a = await api<{ id: string }>('/api/attempts', { body: { title: `${p!.title}: Day ${num}`, scope, count: t.count ?? 8, mode: t.mode ?? 'tutor', timed: !!t.timed } });
        router.push(`/practice/${a.id}`);
      } else if (t.kind === 'game') {
        const q = new URLSearchParams({ program: id, task: t.id }); if (t.tags?.length) q.set('tags', t.tags.join(','));
        router.push(`/games/${t.game}?${q}`);
      }
    } catch (e) { toast({ title: (e as Error).message, kind: 'error' }); setBusy(null); }
  }
  async function markDone(t: Task) {
    setBusy(t.id);
    try { const r = await api<{ newAchievements: string[]; dayCompleted: boolean }>(`/api/programs/${id}/tasks`, { body: { taskId: t.id } }); achievements(r.newAchievements); await reload(); refresh(); }
    catch (e) { toast({ title: (e as Error).message, kind: 'error' }); } finally { setBusy(null); }
  }
  const next = num < p.totalDays ? num + 1 : null;
  return (
    <div className="max-w-2xl mx-auto">
      <Link href={`/programs/${id}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink mb-4"><ArrowLeft size={16} aria-hidden /> {p.title}</Link>
      <div className="eyebrow">Week {week?.n} · Day {num} of {p.totalDays}</div>
      <h1 className="text-3xl md:text-4xl font-extrabold leading-tight mt-1 mb-2">{day.title}</h1>
      <p className="text-muted mb-6">About {required.reduce((a, t) => a + t.minutes, 0)} minutes. {required.filter((t) => t.done).length} of {required.length} tasks done.</p>
      {allDone && (
        <div className="rounded-2xl bg-brand-50 border border-brand-200 p-5 mb-6 flex items-center gap-4 animate-pop" role="status"><span className="h-12 w-12 rounded-full bg-brand-600 text-white grid place-items-center shrink-0"><Check /></span><div className="flex-1"><div className="font-display text-xl font-extrabold text-brand-700">Day {num} complete!</div><div className="text-sm text-muted">Nice work. Come back tomorrow to keep your streak.</div></div>{next && <ButtonLink href={`/programs/${id}/day/${next}`} size="sm">Day {next} <ArrowRight size={16} aria-hidden /></ButtonLink>}</div>
      )}
      <ol className="space-y-3">
        {day.tasks.map((t, i) => {
          const Icon = ICON[t.kind];
          return (
            <li key={t.id} className={cx('card p-4 md:p-5 flex items-center gap-4', t.done && 'bg-brand-50/50')}>
              <span className={cx('h-12 w-12 rounded-2xl grid place-items-center shrink-0', t.done ? 'bg-brand-600 text-white' : 'bg-brand-50 text-brand-700')}>{t.done ? <Check aria-label="Done" /> : <Icon size={22} aria-hidden />}</span>
              <div className="min-w-0 flex-1"><div className="flex items-center gap-2 mb-0.5"><span className="eyebrow">{i + 1}. {LABEL[t.kind]}</span>{t.optional && <Badge tone="gray">Optional</Badge>}{t.done && t.score !== null && <Badge tone="brand">{Math.round(t.score)}%</Badge>}</div><div className="font-semibold leading-snug">{t.title}</div><div className="text-sm text-muted">{t.minutes} min{t.kind === 'quiz' && t.count ? ` · ${t.count} questions${t.timed ? ' · timed' : ''}` : ''}</div></div>
              <div className="flex flex-col sm:flex-row gap-2 shrink-0">
                <Button size="sm" variant={t.done ? 'secondary' : 'primary'} loading={busy === t.id} onClick={() => runTask(t)}>{t.done ? 'Redo' : 'Start'}</Button>
                {!t.done && <Button size="sm" variant="ghost" onClick={() => markDone(t)} aria-label={`Mark "${t.title}" as done`}>Mark done</Button>}
              </div>
            </li>
          );
        })}
      </ol>
      <div className="mt-8 flex justify-between">
        {num > 1 ? <ButtonLink variant="secondary" href={`/programs/${id}/day/${num - 1}`}><ArrowLeft size={16} aria-hidden /> Day {num - 1}</ButtonLink> : <span />}
        {next && <ButtonLink variant="secondary" href={`/programs/${id}/day/${next}`}>Day {next} <ArrowRight size={16} aria-hidden /></ButtonLink>}
      </div>
      <Disclaimer className="mt-8" />
    </div>
  );
}
