'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { api } from '@/lib/client';
import { decodeImportHash, segmentsToStampedText } from '@/lib/ytlet';
import { ButtonLink } from '@/components/ui';
import { useApp } from '@/components/AppContext';

/** Landing page for the "Send to Penlight" bookmarklet: reads the transcript from the URL fragment and starts the study set. */
export default function ImportPage() {
  const router = useRouter();
  const [state, setState] = useState<{ phase: 'reading' | 'sending' | 'error'; title?: string; words?: number; msg?: string }>({ phase: 'reading' });
  const { me } = useApp();
  const started = useRef(false);
  useEffect(() => {
    if (!me || started.current) return; // wait until the session cookie exists, so the job belongs to the same guest the next pages see
    started.current = true;
    const d = decodeImportHash(window.location.hash);
    history.replaceState(null, '', '/import'); // keep the big fragment out of history
    if (!d || !d.segments.length) { setState({ phase: 'error', msg: 'I could not read a transcript from that link. Click “Send to Penlight” again while a YouTube video is open.' }); return; }
    const text = segmentsToStampedText(d.segments);
    const words = text.split(/\s+/).length;
    setState({ phase: 'sending', title: d.title, words });
    if (words < 80) { setState({ phase: 'error', title: d.title, msg: 'That transcript is too short to build a study set from (under about 80 words). Try a longer lecture.' }); return; }
    api<{ jobId: string }>('/api/ingest', { body: { kind: 'paste', text, title: d.title, sourceUrl: d.url } })
      .then((r) => router.replace(`/new/${r.jobId}`))
      .catch((e) => setState({ phase: 'error', title: d.title, msg: (e as Error).message }));
  }, [router, me]);
  return (
    <div className="max-w-xl mx-auto pt-6 md:pt-14">
      <div className="card p-6 md:p-8 text-center">
        {state.phase === 'error' ? (
          <>
            <span className="mx-auto h-12 w-12 rounded-full bg-danger-50 text-danger-600 grid place-items-center mb-3"><AlertTriangle aria-hidden /></span>
            <h1 className="text-2xl font-extrabold">That didn’t come through</h1>
            <p role="alert" className="text-muted mt-2">{state.msg}</p>
            <div className="mt-5 flex gap-2 justify-center flex-wrap"><ButtonLink href="/new-from-youtube">Try the other method</ButtonLink><ButtonLink href="/" variant="ghost">Home</ButtonLink></div>
          </>
        ) : (
          <>
            <Loader2 className="mx-auto animate-spin text-brand-600 mb-3" size={32} aria-hidden />
            <h1 className="text-2xl font-extrabold">Got your transcript</h1>
            <p className="text-muted mt-2" aria-live="polite">{state.title ? `“${state.title}” · ${state.words?.toLocaleString()} words. Building your study set…` : 'Reading it…'}</p>
          </>
        )}
      </div>
    </div>
  );
}
