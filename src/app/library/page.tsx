'use client';
import Link from 'next/link';
import { Layers, ListChecks, Plus } from 'lucide-react';
import { useApi, fmtDur, timeAgo } from '@/lib/client';
import { Badge, ButtonLink, EmptyState, ErrorBox, ModeBadge, PageHeader, SkeletonCards } from '@/components/ui';
import { EmptyArt } from '@/components/art';
import { IngestBox } from '@/components/IngestBox';

interface Lec { id: string; title: string; channel: string | null; duration_sec: number | null; source_type: string; is_sample: number; mode: string | null; status: string; topic: string | null; word_count: number | null; created_at: number; cards: number; questions: number }
interface DeckRow { id: string; title: string; kind: string; category: string; total: number; due: number; fresh: number; mature: number }

export default function LibraryPage() {
  const lecs = useApi<{ lectures: Lec[] }>('/api/lectures');
  const decks = useApi<{ decks: DeckRow[] }>('/api/decks');
  const samples = useApi<{ samples: { slug: string; title: string }[] }>('/api/ingest');
  const premade = decks.data?.decks.filter((d) => d.kind === 'premade') ?? [];
  const groups = ['TEAS', 'NCLEX', 'Core', 'Dosage'] as const;
  const groupOf = (id: string) => (id.startsWith('teas') ? 'TEAS' : id.startsWith('nclex') ? 'NCLEX' : id.startsWith('core') ? 'Core' : 'Dosage');
  return (
    <div>
      <PageHeader title="Library" subtitle="Your study sets, plus premade flashcard decks for the TEAS, NCLEX and core nursing courses." />
      <section aria-labelledby="mine" className="mb-12">
        <div className="flex items-center justify-between mb-4"><h2 id="mine" className="text-2xl font-extrabold">My study sets</h2></div>
        {lecs.error && <ErrorBox message={lecs.error} retry={lecs.reload} />}
        {lecs.loading ? <SkeletonCards n={3} h="h-44" /> : lecs.data && lecs.data.lectures.length === 0 ? (
          <EmptyState art={<EmptyArt kind="books" />} title="No study sets yet" body="Paste a lecture link or transcript and Penlight will turn it into a guide, flashcards, practice questions and games." action={<div className="w-[min(92vw,640px)] text-left"><IngestBox samples={samples.data?.samples} /></div>} />
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {lecs.data?.lectures.map((l) => (
                <Link key={l.id} href={l.status === 'ready' ? `/library/${l.id}` : `/library`} className="card card-hover p-5 flex flex-col">
                  <div className="flex flex-wrap gap-1.5 mb-3"><ModeBadge mode={l.mode} />{l.is_sample ? <Badge tone="sun">Sample content</Badge> : null}{l.status !== 'ready' && <Badge tone="coral">{l.status}</Badge>}</div>
                  <h3 className="font-display font-bold text-lg leading-snug line-clamp-2">{l.title}</h3>
                  <p className="text-sm text-muted mt-1">{[l.topic, fmtDur(l.duration_sec), `${l.word_count?.toLocaleString() ?? '–'} words`].filter(Boolean).join(' · ')}</p>
                  <div className="mt-auto pt-4 flex items-center gap-4 text-sm font-semibold text-muted"><span className="inline-flex items-center gap-1.5"><Layers size={15} aria-hidden /> {l.cards}</span><span className="inline-flex items-center gap-1.5"><ListChecks size={15} aria-hidden /> {l.questions}</span><span className="ml-auto font-medium">{timeAgo(l.created_at)}</span></div>
                </Link>
              ))}
              <Link href="/" className="rounded-2xl border-2 border-dashed border-line hover:border-brand-400 hover:bg-brand-50/50 transition p-5 flex flex-col items-center justify-center text-center min-h-[176px] text-muted"><Plus className="text-brand-600" aria-hidden /><span className="font-bold mt-1 text-ink">New study set</span><span className="text-sm">Paste a link or transcript</span></Link>
            </div>
          </>
        )}
      </section>
      <section aria-labelledby="premade">
        <h2 id="premade" className="text-2xl font-extrabold mb-1">Premade decks</h2>
        <p className="text-muted mb-5">Original flashcards written for Penlight. Study the full deck, or follow a program to meet them in order.</p>
        {decks.loading ? <SkeletonCards n={6} h="h-28" /> : groups.map((g) => {
          const list = premade.filter((d) => groupOf(d.id) === g);
          if (!list.length) return null;
          return (
            <div key={g} className="mb-7">
              <div className="eyebrow mb-2.5">{g === 'Core' ? 'Core nursing tracks' : g === 'Dosage' ? 'Dosage & medical math' : g}</div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((d) => (
                  <Link key={d.id} href={`/decks/${encodeURIComponent(d.id)}`} className="card card-hover p-4 flex flex-col">
                    <div className="font-bold leading-snug">{d.title}</div>
                    <div className="text-sm text-muted mt-1">{d.total} cards</div>
                    <div className="mt-3 flex gap-1.5 flex-wrap">{d.due > 0 && <Badge tone="coral">{d.due} due</Badge>}{d.mature > 0 && <Badge tone="brand">{d.mature} mastered</Badge>}{d.fresh === d.total && <Badge tone="sky">Not started</Badge>}</div>
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </section>
      <ButtonLink href="/study" variant="secondary" className="mt-2">Review everything due</ButtonLink>
    </div>
  );
}
