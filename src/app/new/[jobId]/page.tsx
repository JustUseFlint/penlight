'use client';
import { use, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Check, Loader2 } from 'lucide-react';
import { api } from '@/lib/client';
import { Progress, ButtonLink } from '@/components/ui';
import { IngestBox } from '@/components/IngestBox';
import { fireConfetti } from '@/components/confetti';
import { useApp } from '@/components/AppContext';

interface Job { id: string; status: 'queued' | 'running' | 'done' | 'error'; stage: string; progress: number; message: string | null; error: string | null; error_code: string | null; lecture_id: string | null }
const STEPS = [
  { id: 'fetching', label: 'Fetching video & captions' },
  { id: 'transcribing', label: 'Transcribing audio (only if no captions)' },
  { id: 'extracting', label: 'Finding key terms & definitions' },
  { id: 'generating', label: 'Writing guide, cards & questions' },
];

export default function JobPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = use(params);
  const router = useRouter();
  const { refresh } = useApp();
  const [job, setJob] = useState<Job | null>(null);
  const [fetchErr, setFetchErr] = useState<string | null>(null);
  const seenStages = useRef(new Set<string>());
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        const j = await api<Job>(`/api/jobs/${jobId}`);
        if (stop) return;
        seenStages.current.add(j.stage);
        setJob(j);
        if (j.status === 'done') { fireConfetti(); refresh(); setTimeout(() => router.replace(`/library/${j.lecture_id}`), 1400); return; }
        if (j.status === 'error') return;
      } catch (e) { if (!stop) setFetchErr((e as Error).message); return; }
      setTimeout(tick, 800);
    };
    tick();
    return () => { stop = true; };
  }, [jobId, router, refresh]);

  const idx = job ? STEPS.findIndex((s) => s.id === job.stage) : 0;
  const err = job?.status === 'error';
  const hint: Record<string, string> = {
    blocked: 'YouTube is blocking automated caption requests from this network right now. Paste the transcript instead (YouTube: ⋯ → Show transcript), or upload a .srt/.vtt file.',
    no_captions: 'This video has no captions available. Paste or upload a transcript, or enable the audio fallback (see README).',
    restricted: 'This video is restricted (private, members-only, or age-gated), so captions are unavailable.',
    whisper_unavailable: 'No captions were found and the optional local transcription tool is not installed. Paste or upload a transcript instead.',
  };

  return (
    <div className="max-w-2xl mx-auto pt-4 md:pt-10">
      <div className="card p-6 md:p-8">
        <div className="flex items-center gap-3 mb-1">
          {err ? <span className="h-10 w-10 rounded-full bg-danger-50 text-danger-600 grid place-items-center"><AlertTriangle size={20} /></span> : job?.status === 'done' ? <span className="h-10 w-10 rounded-full bg-brand-100 text-brand-700 grid place-items-center animate-pop"><Check size={20} /></span> : <span className="h-10 w-10 rounded-full bg-brand-50 text-brand-600 grid place-items-center"><Loader2 className="animate-spin" size={20} /></span>}
          <div>
            <h1 className="text-2xl font-extrabold">{err ? "We couldn't finish that one" : job?.status === 'done' ? 'Your study set is ready' : 'Building your study set'}</h1>
            <p className="text-muted text-sm" aria-live="polite">{fetchErr ?? job?.message ?? 'Starting…'}</p>
          </div>
        </div>
        {!err && <Progress value={(job?.progress ?? 0.02) * 100} className="mt-5" label="Job progress" />}
        {!err && (
          <ol className="mt-6 space-y-3">
            {STEPS.map((s, i) => {
              const done = job?.status === 'done' || i < idx;
              const cur = i === idx && job?.status !== 'done';
              if (s.id === 'transcribing' && !seenStages.current.has('transcribing')) return null;
              return (
                <li key={s.id} className="flex items-center gap-3 text-[15px]">
                  <span className={`h-7 w-7 rounded-full grid place-items-center text-xs font-bold ${done ? 'bg-brand-600 text-white' : cur ? 'bg-brand-100 text-brand-700 ring-4 ring-brand-100' : 'bg-line text-faint'}`}>{done ? <Check size={14} /> : i + 1}</span>
                  <span className={done ? 'text-muted' : cur ? 'font-semibold' : 'text-faint'}>{s.label}</span>
                </li>
              );
            })}
          </ol>
        )}
        {err && (
          <div className="mt-5">
            <p role="alert" className="rounded-xl bg-danger-50 text-danger-600 px-4 py-3 text-sm font-medium">{job?.error}</p>
            {job?.error_code && hint[job.error_code] && <p className="text-sm text-muted mt-3">{hint[job.error_code]}</p>}
            <div className="mt-6 pt-6 border-t border-line">
              <h2 className="font-bold mb-3">Try a transcript instead</h2>
              <IngestBox initialTab="paste" />
            </div>
            <div className="mt-4"><ButtonLink href="/" variant="ghost" size="sm">Back to home</ButtonLink></div>
          </div>
        )}
      </div>
    </div>
  );
}
