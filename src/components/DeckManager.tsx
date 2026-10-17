'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Download, Pencil, Play, Plus, Trash2, X } from 'lucide-react';
import { api, useApi } from '@/lib/client';
import { Badge, Button, ButtonLink, ErrorBox, Skeleton } from './ui';
import { useApp } from './AppContext';

interface Card { id: string; type: string; front: string; back: string; status: string; extra: { start?: number } | null; origin: string }
interface Deck { id: string; title: string; editable: boolean; cards: Card[]; counts: { total: number; due: number; new: number; mature: number; young: number } }

export const clozeView = (s: string) => s.replace(/\{\{c1::(.+?)(?:::.+?)?\}\}/g, '[…]');
const statusTone = (s: string) => (s === 'new' ? 'sky' : s === 'learning' ? 'coral' : s === 'young' ? 'sun' : 'brand') as 'sky' | 'coral' | 'sun' | 'brand';

export function DeckManager({ deckId, lectureId }: { deckId: string; lectureId?: string }) {
  const { refresh, toast } = useApp();
  const { data, error, loading, reload } = useApi<Deck>(`/api/decks/${encodeURIComponent(deckId)}`);
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('all');

  const open = (c?: Card) => { setEditing(c ? c.id : 'new'); setFront(c?.front ?? ''); setBack(c?.back ?? ''); };
  async function save() {
    setBusy(true);
    try {
      if (editing === 'new') await api('/api/cards', { body: { deckId, front, back, type: /\{\{c1::/.test(front) ? 'cloze' : 'term' } });
      else await api(`/api/cards/${editing}`, { method: 'PATCH', body: { front, back } });
      setEditing(null); await reload(); refresh();
    } catch (e) { toast({ title: (e as Error).message, kind: 'error' }); } finally { setBusy(false); }
  }
  async function del(id: string) {
    if (!confirm('Delete this card?')) return;
    try { await api(`/api/cards/${id}`, { method: 'DELETE' }); await reload(); refresh(); } catch (e) { toast({ title: (e as Error).message, kind: 'error' }); }
  }
  if (error) return <ErrorBox message={error} retry={reload} />;
  if (loading || !data) return <div className="space-y-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}</div>;
  const cards = data.cards.filter((c) => filter === 'all' || c.status === filter);
  const studyHref = lectureId ? `/study?lecture=${lectureId}` : `/study?deck=${encodeURIComponent(deckId)}`;
  return (
    <div>
      <div className="card p-5 flex flex-wrap items-center gap-x-8 gap-y-4">
        <div className="flex gap-6 flex-wrap">
          {[['Total', data.counts.total, ''], ['Due', data.counts.due, 'text-coral-600'], ['New', data.counts.new, 'text-sky-600'], ['Learning', data.counts.young, 'text-sun-600'], ['Mastered', data.counts.mature, 'text-brand-700']].map(([l, v, t]) => (
            <div key={l as string}><div className="eyebrow">{l}</div><div className={`font-display text-3xl font-extrabold tnum ${t}`}>{v}</div></div>
          ))}
        </div>
        <div className="flex gap-2 ml-auto flex-wrap">
          <ButtonLink href={studyHref}><Play size={16} aria-hidden /> Study now</ButtonLink>
          <a className="btn btn-secondary" href={`/api/decks/${encodeURIComponent(deckId)}/export`} download><Download size={16} aria-hidden /> Anki CSV</a>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 mt-6 mb-3">
        <div className="flex gap-1.5 flex-wrap" role="group" aria-label="Filter cards">
          {['all', 'new', 'learning', 'young', 'mature'].map((f) => <button key={f} onClick={() => setFilter(f)} aria-pressed={filter === f} className={`chip capitalize ${filter === f ? '!bg-brand-600 !text-white' : ''}`}>{f === 'young' ? 'In progress' : f === 'mature' ? 'Mastered' : f}</button>)}
        </div>
        {data.editable ? <Button size="sm" variant="secondary" onClick={() => open()}><Plus size={16} aria-hidden /> Add card</Button> : <Badge tone="gray">Premade deck · read-only</Badge>}
      </div>
      {editing && (
        <div className="card p-5 mb-4 border-brand-400">
          <div className="grid md:grid-cols-2 gap-3">
            <div><label className="label" htmlFor="cf">Front (use {'{{c1::answer}}'} for fill-in-the-blank)</label><textarea id="cf" className="input !h-28 py-3" value={front} onChange={(e) => setFront(e.target.value)} /></div>
            <div><label className="label" htmlFor="cb">Back</label><textarea id="cb" className="input !h-28 py-3" value={back} onChange={(e) => setBack(e.target.value)} /></div>
          </div>
          <div className="flex gap-2 mt-3"><Button size="sm" onClick={save} loading={busy}>Save card</Button><Button size="sm" variant="ghost" onClick={() => setEditing(null)}><X size={14} aria-hidden /> Cancel</Button></div>
        </div>
      )}
      <ul className="grid gap-2.5" aria-label="Cards">
        {cards.map((c) => (
          <li key={c.id} className="card p-4 flex gap-3 items-start">
            <div className="min-w-0 flex-1 grid md:grid-cols-2 gap-x-6 gap-y-1">
              <div className="font-semibold">{clozeView(c.front)}</div>
              <div className="text-muted">{c.type === 'cloze' ? c.front.match(/\{\{c1::(.+?)(?:::.+?)?\}\}/)?.[1] : c.back}</div>
            </div>
            <Badge tone={statusTone(c.status)} className="hidden sm:inline-flex capitalize">{c.status === 'young' ? 'in progress' : c.status}</Badge>
            {data.editable && <div className="flex gap-1 shrink-0">
              <button className="h-9 w-9 grid place-items-center rounded-lg hover:bg-line/60" aria-label={`Edit card: ${clozeView(c.front).slice(0, 40)}`} onClick={() => open(c)}><Pencil size={16} /></button>
              <button className="h-9 w-9 grid place-items-center rounded-lg hover:bg-danger-50 text-danger-600" aria-label={`Delete card: ${clozeView(c.front).slice(0, 40)}`} onClick={() => del(c.id)}><Trash2 size={16} /></button>
            </div>}
          </li>
        ))}
        {cards.length === 0 && <li className="text-muted text-center py-8">No cards in this filter.</li>}
      </ul>
      {lectureId && <p className="text-sm text-muted mt-4">Tip: <Link className="text-brand-700 font-semibold underline" href={`/decks/${encodeURIComponent(deckId)}`}>open this deck on its own page</Link>.</p>}
    </div>
  );
}
