'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { FileText, Link2, Loader2, Upload, Wand2 } from 'lucide-react';
import { api, cx } from '@/lib/client';
import { Button, ModeBadge } from './ui';
import { useApp } from './AppContext';

type Tab = 'link' | 'paste' | 'upload';
export function IngestBox({ hero = false, initialTab = 'link', samples }: { hero?: boolean; initialTab?: Tab; samples?: { slug: string; title: string }[] }) {
  const router = useRouter();
  const { me } = useApp();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function go(payload: Record<string, unknown> | FormData) {
    setBusy(true); setErr(null);
    try {
      let res: { jobId: string };
      if (payload instanceof FormData) {
        const r = await fetch('/api/ingest', { method: 'POST', body: payload });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'Upload failed');
        res = d;
      } else res = await api<{ jobId: string }>('/api/ingest', { body: payload });
      router.push(`/new/${res.jobId}`);
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  }
  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (tab === 'link') { if (!url.trim()) return setErr('Paste a YouTube or lecture video link first.'); return go({ kind: 'url', url: url.trim() }); }
    if (tab === 'paste') return go({ kind: 'paste', text, title: title.trim() || undefined });
    if (!file) return setErr('Choose a .txt, .srt, or .vtt file.');
    const fd = new FormData(); fd.append('file', file); if (title.trim()) fd.append('title', title.trim());
    return go(fd);
  }
  const tabs: { id: Tab; label: string; icon: typeof Link2 }[] = [{ id: 'link', label: 'Video link', icon: Link2 }, { id: 'paste', label: 'Paste transcript', icon: FileText }, { id: 'upload', label: 'Upload file', icon: Upload }];

  return (
    <div>
      <div role="tablist" aria-label="Source type" className="inline-flex p-1 rounded-xl bg-line/50 mb-3">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => { setTab(t.id); setErr(null); }}
            className={cx('inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg text-sm font-semibold transition', tab === t.id ? 'bg-surface shadow-card text-ink' : 'text-muted hover:text-ink')}>
            <t.icon size={15} aria-hidden /> <span className={cx(!hero && 'hidden sm:inline', hero && 'max-[420px]:hidden')}>{t.label}</span><span className={cx(hero ? 'min-[421px]:hidden' : 'sm:hidden')}>{t.label.split(' ')[0]}</span>
          </button>
        ))}
      </div>
      <form onSubmit={submit} className="space-y-3">
        {tab === 'link' && (
          <div className={cx('flex gap-2', hero ? 'flex-col sm:flex-row' : 'flex-col sm:flex-row')}>
            <label className="sr-only" htmlFor="video-url">Lecture video link</label>
            <input id="video-url" className={cx('input', hero && '!h-16 !rounded-2xl text-base sm:text-xl !px-5')} placeholder="Paste a lecture link (YouTube or other)" value={url} onChange={(e) => setUrl(e.target.value)} inputMode="url" autoComplete="off" />
            <Button size={hero ? 'lg' : undefined} loading={busy} type="submit" className="sm:w-auto shrink-0"><Wand2 size={18} aria-hidden /> Build study set</Button>
          </div>
        )}
        {tab === 'paste' && (
          <>
            <input className="input" placeholder="Title (optional)" aria-label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
            <textarea className="input !h-44 py-3 resize-y" placeholder="Paste the transcript here. Plain text, or text with timestamps like 00:12 …" aria-label="Transcript text" value={text} onChange={(e) => setText(e.target.value)} />
            <Button loading={busy} type="submit"><Wand2 size={18} aria-hidden /> Build study set</Button>
          </>
        )}
        {tab === 'upload' && (
          <>
            <input className="input" placeholder="Title (optional)" aria-label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
            <button type="button" onClick={() => fileRef.current?.click()} className="w-full rounded-2xl border-2 border-dashed border-line hover:border-brand-400 hover:bg-brand-50/50 transition py-8 text-center">
              <Upload className="mx-auto text-brand-600" aria-hidden />
              <div className="font-semibold mt-2">{file ? file.name : 'Choose a .srt, .vtt, or .txt file'}</div>
              <div className="text-sm text-muted">Up to 2 MB. Captions with timestamps link your key points back to the video.</div>
            </button>
            <input ref={fileRef} type="file" accept=".txt,.srt,.vtt" className="sr-only" aria-label="Transcript file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <Button loading={busy} type="submit"><Wand2 size={18} aria-hidden /> Build study set</Button>
          </>
        )}
        {err && <p role="alert" className="text-sm font-semibold text-danger-600">{err}</p>}
      </form>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
        <span className="inline-flex items-center gap-2">Output: <ModeBadge mode={me?.llm.configured && me.llm.mode !== 'lite' ? 'ai' : 'lite'} /></span>
        {tab === 'link' && /youtu/i.test(url) && <Link href="/new-from-youtube" className="font-bold text-brand-700">YouTube not working? Use the 30-second helper</Link>}
        {samples && samples.length > 0 && (
          <span className="inline-flex flex-wrap items-center gap-2">No lecture handy? Try a sample:
            {samples.map((s) => <button key={s.slug} disabled={busy} onClick={() => go({ kind: 'sample', slug: s.slug })} className="chip hover:bg-brand-100 transition" aria-label={`Try sample lecture: ${s.title}`}>{s.title.split(/[:&]/)[0].trim()}</button>)}
          </span>
        )}
        {busy && <Loader2 className="animate-spin" size={16} aria-hidden />}
      </div>
    </div>
  );
}
