'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Grid2x2, ListOrdered, Puzzle, Timer } from 'lucide-react';
import { cx, useApi } from '@/lib/client';
import { Badge, PageHeader, SkeletonCards } from '@/components/ui';

interface GameStat { game: string; plays: number; best: number; xp: number }
const META: Record<string, { icon: typeof Timer; tone: string; how: string }> = {
  match: { icon: Grid2x2, tone: 'bg-brand-50 text-brand-700', how: 'Tap a term, then its definition.' },
  speed: { icon: Timer, tone: 'bg-coral-50 text-coral-600', how: '60 seconds. T / F keys work too.' },
  gap: { icon: Puzzle, tone: 'bg-sun-50 text-sun-600', how: 'Pick the missing word.' },
  sequence: { icon: ListOrdered, tone: 'bg-grape-50 text-grape-600', how: 'Tap steps in the right order.' },
};
interface Lec { id: string; title: string; cards: number }
const SOURCES = [
  { id: 'premade', label: 'Mixed premade', q: '' }, { id: 'teas', label: 'TEAS cards', q: 'exam=teas' }, { id: 'nclex', label: 'NCLEX cards', q: 'exam=nclex' }, { id: 'core', label: 'Core nursing', q: 'exam=core' }, { id: 'dosage', label: 'Dosage', q: 'exam=dosage' },
];
export default function GamesPage() {
  const g = useApi<{ games: { id: string; title: string; tagline: string }[]; stats: GameStat[] }>('/api/games');
  const lecs = useApi<{ lectures: Lec[] }>('/api/lectures');
  const [src, setSrc] = useState('premade');
  const mine = lecs.data?.lectures.filter((l) => l.cards > 0) ?? [];
  const q = src.startsWith('lec:') ? `lecture=${src.slice(4)}` : SOURCES.find((s) => s.id === src)?.q ?? '';
  return (
    <div>
      <PageHeader title="Games" subtitle="Quick, quiet practice rounds. Earn XP, build streaks, and learn the vocabulary without feeling like studying." />
      <div className="mb-6">
        <div className="eyebrow mb-2">Play with</div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Game content source">
          {SOURCES.map((s) => <button key={s.id} aria-pressed={src === s.id} onClick={() => setSrc(s.id)} className={cx('chip !h-9 !px-4', src === s.id && '!bg-brand-600 !text-white')}>{s.label}</button>)}
          {mine.map((l) => <button key={l.id} aria-pressed={src === 'lec:' + l.id} onClick={() => setSrc('lec:' + l.id)} className={cx('chip !h-9 !px-4 max-w-[240px] truncate', src === 'lec:' + l.id && '!bg-brand-600 !text-white')}>📚 {l.title}</button>)}
        </div>
      </div>
      {g.loading ? <SkeletonCards n={4} h="h-48" /> : (
        <div className="grid gap-5 sm:grid-cols-2">
          {g.data?.games.map((x) => {
            const m = META[x.id]; const st = g.data!.stats.find((s) => s.game === x.id);
            return (
              <Link key={x.id} href={`/games/${x.id}${q ? '?' + q : ''}`} className="card card-hover p-6 flex flex-col">
                <div className="flex items-start justify-between"><span className={cx('h-14 w-14 rounded-2xl grid place-items-center', m.tone)}><m.icon size={28} aria-hidden /></span>{st ? <Badge tone="gray">{st.plays} play{st.plays === 1 ? '' : 's'} · best {st.best}</Badge> : <Badge tone="sky">New</Badge>}</div>
                <h2 className="font-display text-2xl font-extrabold mt-4">{x.title}</h2>
                <p className="text-muted mt-1">{x.tagline}</p><p className="text-sm text-faint mt-1">{m.how}</p>
                <span className="btn btn-primary mt-5 self-start">Play</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
