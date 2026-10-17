'use client';
import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Download, ExternalLink, Info, Loader2, RefreshCw, Sparkles, Trash2 } from 'lucide-react';
import { api, fmtDur, useApi } from '@/lib/client';
import { Badge, Button, ErrorBox, ModeBadge, Skeleton, Tabs, Disclaimer } from '@/components/ui';
import type { Guide } from '@/lib/types';
import { DeckManager } from '@/components/DeckManager';
import { TestLauncher } from '@/components/TestLauncher';
import { useApp } from '@/components/AppContext';
import { fmtClock } from '@/lib/fmt';

interface Lecture { id: string; title: string; channel: string | null; source_url: string | null; source_type: string; transcript_source: string | null; is_sample: number; duration_sec: number | null; word_count: number | null; mode: string | null; status: string; guide: Guide | null; counts: { cards: number; questions: number }; deckId: string; segments?: { start: number; text: string }[] }
type TabId = 'guide' | 'cards' | 'test' | 'games' | 'transcript';

function TsLink({ start, url, sample }: { start?: number; url: string | null; sample: boolean }) {
  if (start === undefined || start < 0) return null;
  const yt = url && /youtu/.test(url) && !sample ? url.replace(/[?&]t=\d+s?/, '') + (url.includes('?') ? '&' : '?') + `t=${Math.floor(start)}s` : null;
  const cls = 'ml-2 inline-flex items-center h-5 px-2 rounded-full text-[11px] font-bold tnum align-middle';
  return yt ? <a href={yt} target="_blank" rel="noreferrer" className={`${cls} bg-sky-50 text-sky-600 hover:bg-sky-100`} aria-label={`Jump to ${fmtClock(start)} in the video`}>{fmtClock(start)}</a> : <span className={`${cls} bg-line/60 text-muted`} title="Position in the lecture">{fmtClock(start)}</span>;
}

function GuideView({ l }: { l: Lecture }) {
  const g = l.guide!;
  const sample = !!l.is_sample;
  return (
    <div className="grid lg:grid-cols-[1fr_300px] gap-8 items-start">
      <article className="space-y-8 min-w-0">
        <section><p className="text-lg leading-8 border-l-4 border-brand-500 pl-4">{g.overview}</p></section>
        {g.objectives.length > 0 && (
          <section className="rounded-2xl bg-brand-50 border border-brand-100 p-5"><h2 className="font-display text-lg font-bold text-brand-700 mb-2">What you should be able to do</h2><ul className="space-y-1.5 list-disc pl-5 marker:text-brand-500">{g.objectives.map((o, i) => <li key={i}>{o}</li>)}</ul></section>
        )}
        {g.mustKnow.length > 0 && (
          <section className="rounded-2xl bg-sun-50 border border-sun-100 p-5"><h2 className="font-display text-lg font-bold text-sun-600 mb-2">⭐ Must-know points</h2><ul className="space-y-2 list-disc pl-5 marker:text-sun-500">{g.mustKnow.slice(0, 8).map((p, i) => <li key={i}>{p.text}<TsLink start={p.start} url={l.source_url} sample={sample} /></li>)}</ul></section>
        )}
        <section aria-labelledby="notes-h">
          <h2 id="notes-h" className="text-2xl font-extrabold mb-4">Lecture notes</h2>
          <div className="space-y-6">
            {g.sections.map((s, i) => (
              <div key={i} className="card p-5 md:p-6">
                <h3 className="font-display text-xl font-bold flex items-center gap-3"><span className="h-8 w-8 rounded-xl bg-brand-600 text-white grid place-items-center text-sm shrink-0">{i + 1}</span><span>{s.heading}<TsLink start={s.start} url={l.source_url} sample={sample} /></span></h3>
                <ul className="mt-3 space-y-2.5 list-disc pl-5 marker:text-brand-400">
                  {s.points.map((p, j) => <li key={j} className={p.mustKnow ? 'bg-sun-50 -ml-5 pl-4 list-none border-l-4 border-sun-500 rounded-r-lg py-1 pr-2' : ''}>{p.text}<TsLink start={p.start} url={l.source_url} sample={sample} /></li>)}
                </ul>
                {s.terms.length > 0 && <div className="mt-4 flex flex-wrap gap-1.5">{s.terms.map((t) => <span key={t} className="chip">{t}</span>)}</div>}
              </div>
            ))}
          </div>
        </section>
        {g.nursingConsiderations.map((n, i) => (
          <section key={i} className="rounded-2xl bg-sky-50 border border-sky-100 p-5"><h2 className="font-display text-lg font-bold text-sky-600 mb-2">Nursing considerations: {n.title}</h2><ul className="space-y-1.5 list-disc pl-5 marker:text-sky-500">{n.items.map((x, j) => <li key={j}>{x}</li>)}</ul></section>
        ))}
        {g.mnemonics.length > 0 && <section className="rounded-2xl bg-grape-50 border border-grape-100 p-5"><h2 className="font-display text-lg font-bold text-grape-600 mb-2">Memory aids</h2><ul className="space-y-2">{g.mnemonics.map((m, i) => <li key={i}><strong>{m.name}:</strong> {m.text}</li>)}</ul></section>}
        {g.glossary.length > 0 && (
          <section aria-labelledby="gl-h"><h2 id="gl-h" className="text-2xl font-extrabold mb-4">Glossary</h2>
            <dl className="card divide-y divide-line">{g.glossary.map((t, i) => <div key={i} className="grid sm:grid-cols-[220px_1fr] gap-x-6 gap-y-1 p-4"><dt className="font-bold text-brand-700">{t.term}{t.inferred && <span className="ml-2 text-[11px] font-semibold text-muted" title="This definition is the lecture sentence where the term first appears">from context</span>}</dt><dd className="text-muted">{t.definition}<TsLink start={t.start} url={l.source_url} sample={sample} /></dd></div>)}</dl></section>
        )}
        {g.quickReview.length > 0 && <section><h2 className="text-2xl font-extrabold mb-3">Quick review</h2><ul className="space-y-2">{g.quickReview.map((q, i) => <li key={i} className="flex gap-3"><span className="mt-1.5 h-4 w-4 rounded-[5px] border-2 border-brand-500 shrink-0" aria-hidden />{q}</li>)}</ul></section>}
      </article>
      <aside className="lg:sticky lg:top-24 space-y-4">
        <div className="card p-5"><div className="eyebrow mb-2">At a glance</div>
          <dl className="grid grid-cols-2 gap-3 text-sm">{[['Sections', g.stats.sections], ['Key terms', g.glossary.length], ['Flashcards', l.counts.cards], ['Questions', l.counts.questions]].map(([k, v]) => <div key={k as string}><dt className="text-muted">{k}</dt><dd className="font-display text-2xl font-extrabold tnum">{v}</dd></div>)}</dl></div>
        {g.sections.length > 3 && <nav className="card p-5 hidden lg:block" aria-label="Sections"><div className="eyebrow mb-2">Sections</div><ol className="space-y-1.5 text-sm">{g.sections.map((s, i) => <li key={i} className="flex gap-2"><span className="text-faint tnum w-4">{i + 1}</span><span className="font-medium">{s.heading}</span></li>)}</ol></nav>}
      </aside>
    </div>
  );
}

export default function LecturePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { me, toast } = useApp();
  const [tab, setTab] = useState<TabId>('guide');
  const { data: l, error, loading, reload } = useApi<Lecture>(`/api/lectures/${id}`);
  const tr = useApi<Lecture>(tab === 'transcript' ? `/api/lectures/${id}?transcript=1` : null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [regen, setRegen] = useState<string | null>(null);
  useEffect(() => { const h = location.hash.replace('#', '') as TabId; if (['guide', 'cards', 'test', 'games', 'transcript'].includes(h)) setTab(h); }, []);

  async function pdf() {
    setPdfBusy(true);
    try {
      const r = await fetch(`/api/lectures/${id}/pdf`);
      if (!r.ok) throw new Error((await r.json()).error || 'PDF failed');
      const blob = await r.blob();
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = (r.headers.get('content-disposition')?.match(/filename="(.+)"/)?.[1]) || 'study-guide.pdf'; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch (e) { toast({ title: (e as Error).message, kind: 'error' }); } finally { setPdfBusy(false); }
  }
  async function regenerate(mode: 'lite' | 'ai') {
    setRegen(mode);
    try { const j = await api<{ jobId: string }>(`/api/lectures/${id}/regenerate`, { body: { mode } }); router.push(`/new/${j.jobId}`); }
    catch (e) { toast({ title: (e as Error).message, kind: 'error' }); setRegen(null); }
  }
  async function del() {
    if (!confirm('Delete this study set and its flashcards and questions?')) return;
    await api(`/api/lectures/${id}`, { method: 'DELETE' }); router.push('/library');
  }

  if (error) return <ErrorBox message={error} retry={reload} />;
  if (loading || !l) return <div className="space-y-4"><Skeleton className="h-10 w-2/3" /><Skeleton className="h-6 w-1/3" /><Skeleton className="h-64" /></div>;
  const hasAi = !!me?.llm.configured;
  return (
    <div>
      <Link href="/library" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink mb-4"><ArrowLeft size={16} aria-hidden /> Library</Link>
      <header className="mb-6">
        <div className="flex flex-wrap items-center gap-2 mb-3"><ModeBadge mode={l.mode} />{l.is_sample ? <Badge tone="sun">Sample content</Badge> : null}{l.transcript_source && <Badge tone="gray">Transcript: {l.transcript_source.replace('captions-', 'captions · ').replace('-', ' ')}</Badge>}</div>
        <h1 className="text-3xl md:text-4xl font-extrabold leading-tight">{l.title}</h1>
        <p className="text-muted mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">{[l.channel, fmtDur(l.duration_sec), l.word_count ? `${l.word_count.toLocaleString()} words` : null].filter(Boolean).join(' · ')}{l.source_url && /^https?:/.test(l.source_url) && <a href={l.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-700 font-semibold">Source <ExternalLink size={14} aria-hidden /></a>}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button onClick={pdf} loading={pdfBusy}><Download size={16} aria-hidden /> Download PDF guide</Button>
          <Button variant="secondary" onClick={() => regenerate('lite')} loading={regen === 'lite'}><RefreshCw size={16} aria-hidden /> Regenerate (Lite)</Button>
          {hasAi && <Button variant="secondary" onClick={() => regenerate('ai')} loading={regen === 'ai'}><Sparkles size={16} aria-hidden /> Regenerate with AI</Button>}
          <Button variant="ghost" onClick={del} aria-label="Delete study set"><Trash2 size={16} aria-hidden /> Delete</Button>
        </div>
        {l.mode !== 'ai' && (
          <p className="mt-4 text-sm text-muted flex gap-2 max-w-3xl"><Info size={16} className="shrink-0 mt-0.5 text-sky-600" aria-hidden /><span><strong className="text-ink">Lite mode</strong> builds this set offline by extracting and ranking sentences from the transcript. It is dependable but less polished than AI output: section titles are heuristic and distractors can be generic. {hasAi ? 'Try “Regenerate with AI” for a richer set.' : <>Add an API key in <Link href="/settings" className="underline font-semibold text-brand-700">Settings</Link> to unlock AI mode.</>}</span></p>
        )}
        {l.guide?.notes?.map((n, i) => <p key={i} className="mt-3 text-sm rounded-xl bg-sun-50 border border-sun-100 px-4 py-2.5 max-w-3xl">{n}</p>)}
      </header>
      <Tabs label="Study set sections" value={tab} onChange={(t) => { setTab(t); history.replaceState(null, '', `#${t}`); }} tabs={[{ id: 'guide', label: 'Study guide' }, { id: 'cards', label: 'Flashcards', count: l.counts.cards }, { id: 'test', label: 'Practice test', count: l.counts.questions }, { id: 'games', label: 'Games' }, { id: 'transcript', label: 'Transcript' }]} />
      <div className="pt-6" role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {tab === 'guide' && l.guide && <GuideView l={l} />}
        {tab === 'cards' && <DeckManager deckId={l.deckId} lectureId={l.id} />}
        {tab === 'test' && (
          <div className="max-w-3xl space-y-4">
            <p className="text-muted">Questions generated from this lecture. {l.mode !== 'ai' && 'In Lite mode, wrong options come from other terms in the same lecture, so they are plausible but occasionally easy to eliminate.'}</p>
            <TestLauncher title={`Practice: ${l.title}`} scope={{ lectureId: l.id }} defaultCount={Math.min(10, Math.max(5, l.counts.questions))} disabled={l.counts.questions === 0} />
          </div>
        )}
        {tab === 'games' && (
          <div className="grid gap-4 sm:grid-cols-2 max-w-3xl">
            {[['match', 'Match Rush', 'Pair terms with definitions from this lecture.'], ['speed', 'Speed Round', 'True or false against the clock.'], ['gap', 'Fill the Gap', 'Complete sentences from the word bank.'], ['sequence', 'Sequence Builder', 'Put the steps in order.']].map(([g, t, d]) => (
              <Link key={g} href={`/games/${g}?lecture=${l.id}`} className="card card-hover p-5"><div className="font-display font-bold text-lg">{t}</div><p className="text-sm text-muted mt-1">{d}</p></Link>
            ))}
          </div>
        )}
        {tab === 'transcript' && (
          <div className="max-w-3xl">
            {tr.loading ? <Skeleton className="h-64" /> : <div className="card p-5 md:p-6 space-y-2 leading-7 max-h-[70vh] overflow-auto">{(tr.data?.segments ?? []).map((s, i) => <p key={i}>{s.start >= 0 && <TsLink start={s.start} url={l.source_url} sample={!!l.is_sample} />} {s.text}</p>)}</div>}
          </div>
        )}
      </div>
      <Disclaimer className="mt-10 max-w-3xl" />
    </div>
  );
}
