import { route, body } from '@/lib/api';
import { createJob, type IngestInput } from '@/lib/ingest/pipeline';
import { parseVideoUrl } from '@/lib/ingest/url';
import { SAMPLES } from '@/lib/ingest/samples';
import { getSetting } from '@/lib/db';

export const GET = route(async () => ({ samples: SAMPLES.map(({ slug, title, blurb, topic }) => ({ slug, title, blurb, topic })) }));
export const POST = route(async ({ user, req }) => {
  const ct = req.headers.get('content-type') || '';
  let b: { kind?: string; url?: string; sourceUrl?: string; text?: string; title?: string; slug?: string; mode?: string; filename?: string };
  if (ct.includes('multipart/form-data')) {
    const fd = await req.formData();
    const f = fd.get('file');
    if (!(f instanceof File)) throw new Error('Choose a .txt, .srt, or .vtt file.');
    if (f.size > 2_000_000) throw new Error('That file is too large (2 MB max).');
    if (!/\.(txt|srt|vtt)$/i.test(f.name)) throw new Error('Only .txt, .srt, and .vtt files are supported.');
    b = { kind: 'upload', text: await f.text(), filename: f.name, title: (fd.get('title') as string) || undefined, mode: (fd.get('mode') as string) || undefined };
  } else b = await body(req);
  const pref = getSetting('ai_mode_pref') === 'lite' ? 'lite' : 'auto';
  const mode = (['auto', 'lite', 'ai'].includes(b.mode || '') ? b.mode : pref) as 'auto' | 'lite' | 'ai';
  let input: IngestInput;
  switch (b.kind) {
    case 'url': {
      const p = parseVideoUrl(b.url || '');
      if (!p.ok) throw new Error(p.error);
      input = { kind: 'url', url: p.url, mode };
      break;
    }
    case 'paste': {
      if ((b.text || '').trim().split(/\s+/).length < 80) throw new Error('Paste at least ~80 words of transcript text.');
      input = { kind: 'paste', text: b.text!, title: b.title?.slice(0, 200), sourceUrl: b.sourceUrl, mode };
      break;
    }
    case 'upload': input = { kind: 'upload', text: b.text || '', filename: b.filename || 'upload.txt', title: b.title, mode }; break;
    case 'sample': {
      if (!SAMPLES.find((s) => s.slug === b.slug)) throw new Error('Unknown sample lecture.');
      input = { kind: 'sample', slug: b.slug!, mode };
      break;
    }
    default: throw new Error('Unknown ingest type.');
  }
  return createJob(user.id, input);
});
