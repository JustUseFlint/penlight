import { route } from '@/lib/api';
import { getDb } from '@/lib/db';
import { getLecture } from '@/lib/library';
import { buildPdfHtml, renderPdf } from '@/lib/pdf';
import { logActivity } from '@/lib/progress';
export const maxDuration = 60;
export const GET = route<{ id: string }>(async ({ user }, { id }) => {
  const l = getLecture(user.id, id) as (ReturnType<typeof getLecture> & { title: string; channel: string | null; source_url: string | null; duration_sec: number | null; is_sample: number; created_at: number }) | null;
  if (!l || !l.guide) throw new Error('Study set not found');
  const db = getDb();
  const cards = db.prepare('SELECT front, back FROM cards WHERE deck_id=? ORDER BY rowid').all(`lec:${id}`) as { front: string; back: string }[];
  const qs = (db.prepare('SELECT stem, options_json, correct_json, rationale FROM questions WHERE lecture_id=? ORDER BY rowid').all(id) as { stem: string; options_json: string; correct_json: string; rationale: string }[])
    .map((q) => ({ stem: q.stem, options: JSON.parse(q.options_json) as string[], correct: JSON.parse(q.correct_json) as number[], rationale: q.rationale }));
  const html = buildPdfHtml({ title: l.title, guide: l.guide, sourceUrl: l.source_url, channel: l.channel, sample: !!l.is_sample, durationSec: l.duration_sec, cards, questions: qs, date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) });
  const pdf = await renderPdf(html, l.title);
  logActivity(user.id, { kind: 'export', label: `Exported PDF: ${l.title}`, xp: 0, minutes: 0 });
  const name = l.title.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 60) || 'study-guide';
  return new Response(new Uint8Array(pdf), { headers: { 'content-type': 'application/pdf', 'content-disposition': `attachment; filename="penlight-${name}.pdf"`, 'cache-control': 'no-store' } });
});
