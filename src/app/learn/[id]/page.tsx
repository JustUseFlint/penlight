'use client';
import { Suspense, use, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Check, Clock, Layers, ListChecks } from 'lucide-react';
import { api, useApi } from '@/lib/client';
import { Badge, Button, ButtonLink, Disclaimer, ErrorBox, Skeleton } from '@/components/ui';
import { Markdown } from '@/components/Markdown';
import { useApp } from '@/components/AppContext';
import { fireConfetti } from '@/components/confetti';

interface Lesson { id: string; title: string; category: string; minutes: number; body: string }

function LessonInner({ id }: { id: string }) {
  const sp = useSearchParams();
  const router = useRouter();
  const { refresh, achievements, toast } = useApp();
  const { data, error, reload } = useApi<Lesson>(`/api/lessons/${id}`);
  const programId = sp.get('program'), taskId = sp.get('task');
  const [busy, setBusy] = useState(false);
  async function complete() {
    if (!programId || !taskId) return;
    setBusy(true);
    try {
      const r = await api<{ dayCompleted: boolean; newAchievements: string[] }>(`/api/programs/${programId}/tasks`, { body: { taskId } });
      achievements(r.newAchievements); refresh();
      if (r.dayCompleted) fireConfetti(0.8);
      toast({ title: r.dayCompleted ? 'Day complete! +40 XP' : 'Lesson marked as read. +10 XP' });
      router.push(`/programs/${programId}/day/${sp.get('day') || ''}`.replace(/\/$/, ''));
    } catch (e) { toast({ title: (e as Error).message, kind: 'error' }); setBusy(false); }
  }
  if (error) return <ErrorBox message={error} retry={reload} />;
  if (!data) return <div className="max-w-2xl mx-auto space-y-4"><Skeleton className="h-10 w-2/3" /><Skeleton className="h-96" /></div>;
  const tagFilter = `tags=${data.id}`;
  return (
    <div className="max-w-2xl mx-auto">
      <Link href={programId ? `/programs/${programId}` : '/programs'} className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink mb-4"><ArrowLeft size={16} aria-hidden /> {programId ? 'Back to program' : 'Programs'}</Link>
      <div className="flex gap-2 mb-3"><Badge tone="brand">{data.category}</Badge><Badge tone="gray"><Clock size={12} aria-hidden /> {data.minutes} min read</Badge></div>
      <h1 className="text-3xl md:text-4xl font-extrabold leading-tight mb-2">{data.title}</h1>
      <article className="card p-6 md:p-9 mt-5"><Markdown source={data.body} /></article>
      <div className="mt-6 flex flex-wrap gap-2">
        {programId && taskId && <Button size="lg" loading={busy} onClick={complete}><Check size={18} aria-hidden /> Mark as read</Button>}
        <ButtonLink variant="secondary" href={`/study?${tagFilter}&program=`.replace('&program=', '')}><Layers size={16} aria-hidden /> Practice with flashcards</ButtonLink>
        <ButtonLink variant="secondary" href={`/practice`}><ListChecks size={16} aria-hidden /> Practice questions</ButtonLink>
      </div>
      <Disclaimer className="mt-8" />
    </div>
  );
}
export default function LessonPage({ params }: { params: Promise<{ id: string }> }) { const { id } = use(params); return <Suspense fallback={<Skeleton className="h-96" />}><LessonInner id={id} /></Suspense>; }
