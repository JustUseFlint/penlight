'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bookmark, Check, Clipboard, ExternalLink, Laptop, Smartphone, Wand2 } from 'lucide-react';
import { api, cx } from '@/lib/client';
import { Button } from './ui';
import { bookmarkletCode, bookmarkletHref } from '@/lib/ytlet';

/**
 * Guided workaround for YouTube videos the server cannot read (YouTube blocks hosting-provider IPs).
 * Both paths use the student's OWN browser, which YouTube trusts:
 *   1. a bookmarklet that reads the transcript from the open YouTube tab and sends it here, or
 *   2. copy the "Show transcript" text and paste it (works on phones, no install).
 */
export function YouTubeHelper({ videoUrl, reason }: { videoUrl?: string | null; reason?: string }) {
  const router = useRouter();
  const [way, setWay] = useState<'button' | 'paste'>('button');
  const [copied, setCopied] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const link = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    // React refuses javascript: hrefs, so the bookmark link is set on the DOM node directly
    link.current?.setAttribute('href', bookmarkletHref(window.location.origin));
  }, [way]);
  async function copyCode() {
    try { await navigator.clipboard.writeText(bookmarkletCode(window.location.origin)); setCopied(true); setTimeout(() => setCopied(false), 3000); }
    catch { setErr('Your browser blocked copying. Use the drag method, or the "Copy by hand" tab.'); }
  }
  async function build() {
    setBusy(true); setErr(null);
    try {
      const r = await api<{ jobId: string }>('/api/ingest', { body: { kind: 'paste', text, sourceUrl: videoUrl || undefined } });
      router.push(`/new/${r.jobId}`);
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  }
  const seg = (on: boolean) => cx('inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg text-sm font-semibold transition', on ? 'bg-surface shadow-card text-ink' : 'text-muted hover:text-ink');
  const step = (n: number) => <span className="h-6 w-6 shrink-0 rounded-full bg-brand-600 text-white text-xs font-bold grid place-items-center mt-0.5">{n}</span>;
  return (
    <section className="rounded-2xl border border-brand-300 bg-brand-50/50 p-5" aria-labelledby="ythelp-h">
      <h2 id="ythelp-h" className="font-display text-lg font-extrabold">Use this YouTube video anyway (about 30 seconds)</h2>
      <p className="text-sm text-muted mt-1">{reason ?? 'YouTube refuses captions requests that come from web hosting servers like this one, but it gives them to your own browser. So let your browser fetch the transcript and hand it to Penlight.'}</p>
      <div role="tablist" aria-label="Choose a method" className="inline-flex p-1 rounded-xl bg-line/50 mt-4">
        <button role="tab" aria-selected={way === 'button'} onClick={() => setWay('button')} className={seg(way === 'button')}><Laptop size={15} aria-hidden /> One-click button</button>
        <button role="tab" aria-selected={way === 'paste'} onClick={() => setWay('paste')} className={seg(way === 'paste')}><Smartphone size={15} aria-hidden /> Copy by hand</button>
      </div>
      {way === 'button' ? (
        <ol className="mt-4 space-y-3.5 text-[15px]" aria-label="One-click button steps">
          <li className="flex gap-3">{step(1)}<div>
            <div>Show your bookmarks bar (Ctrl+Shift+B on Windows, Cmd+Shift+B on Mac), then <b>drag this button onto it</b>:</div>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              {/* eslint-disable-next-line jsx-a11y/anchor-is-valid */}
              <a ref={link} href="#" onClick={(e) => e.preventDefault()} draggable className="btn btn-primary cursor-grab select-none" title="Drag me to your bookmarks bar"><Bookmark size={16} aria-hidden /> Send to Penlight</a>
              <button type="button" onClick={copyCode} className="text-sm font-bold text-brand-700 inline-flex items-center gap-1.5">{copied ? <Check size={14} aria-hidden /> : <Clipboard size={14} aria-hidden />}{copied ? 'Copied. Paste it as a new bookmark’s address' : 'Can’t drag? Copy the code'}</button>
            </div></div></li>
          <li className="flex gap-3">{step(2)}<div>Open your lecture on YouTube{videoUrl && <> (<a className="font-bold text-brand-700 inline-flex items-center gap-1" href={videoUrl} target="_blank" rel="noreferrer">open this video <ExternalLink size={13} aria-hidden /></a>)</>}.</div></li>
          <li className="flex gap-3">{step(3)}<div>Click <b>Send to Penlight</b> in your bookmarks bar. Penlight opens in a new tab and builds your study set, with the captions linked to the video.</div></li>
        </ol>
      ) : (
        <ol className="mt-4 space-y-3.5 text-[15px]" aria-label="Copy by hand steps">
          <li className="flex gap-3">{step(1)}<div>Open the video on YouTube{videoUrl && <> (<a className="font-bold text-brand-700 inline-flex items-center gap-1" href={videoUrl} target="_blank" rel="noreferrer">open this video <ExternalLink size={13} aria-hidden /></a>)</>}. On a phone, use your browser (not the app) and choose “Desktop site” in its menu.</div></li>
          <li className="flex gap-3">{step(2)}<div>Under the video tap <b>…more</b>, then <b>Show transcript</b>. Select all the text in the transcript box and copy it.</div></li>
          <li className="flex gap-3">{step(3)}<div className="flex-1 min-w-0">Paste it here:
            <textarea className="input !h-36 py-3 mt-2 resize-y w-full" aria-label="Transcript text" placeholder="0:00 Welcome to today's lecture…" value={text} onChange={(e) => setText(e.target.value)} />
            <div className="mt-2 flex items-center gap-3 flex-wrap"><Button loading={busy} onClick={build} disabled={text.trim().split(/\s+/).length < 80}><Wand2 size={16} aria-hidden /> Build study set</Button>
              <span className="text-xs text-muted">{text.trim() ? `${text.trim().split(/\s+/).length} words` : 'Needs at least about 80 words'}</span></div></div></li>
        </ol>
      )}
      {err && <p role="alert" className="text-sm font-semibold text-danger-600 mt-3">{err}</p>}
    </section>
  );
}
