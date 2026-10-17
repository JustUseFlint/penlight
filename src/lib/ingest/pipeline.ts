import type Database from 'better-sqlite3';
import { getDb, now, uid } from '../db';
import { buildLite } from '../lite/engine';
import { buildAi } from '../llm/ai-engine';
import { getLlmConfig } from '../llm/config';
import type { StudyOutput } from '../types';
import { fetchCaptions, transcribeAudio } from './fetcher';
import { parseTranscriptText, wordCount, type Segment } from './parse';
import { loadSample } from './samples';
import { parseVideoUrl } from './url';
import { logActivity } from '../progress';

export type IngestInput =
  | { kind: 'url'; url: string; mode?: 'auto' | 'lite' | 'ai' }
  | { kind: 'paste'; text: string; title?: string; mode?: 'auto' | 'lite' | 'ai' }
  | { kind: 'upload'; text: string; filename: string; title?: string; mode?: 'auto' | 'lite' | 'ai' }
  | { kind: 'sample'; slug: string; mode?: 'auto' | 'lite' | 'ai' }
  | { kind: 'regenerate'; lectureId: string; mode: 'lite' | 'ai' };

export class IngestError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

function setJob(jobId: string, patch: { status?: string; stage?: string; progress?: number; message?: string; error?: string | null; error_code?: string | null; lecture_id?: string }) {
  const db = getDb();
  const cols = Object.keys(patch);
  db.prepare(`UPDATE jobs SET ${cols.map((c) => `${c}=@${c}`).join(', ')}, updated_at=@u WHERE id=@id`).run({ ...patch, u: now(), id: jobId });
}

export function createJob(userId: string, input: IngestInput): { jobId: string; lectureId: string } {
  const db = getDb();
  const jobId = uid();
  let lectureId: string;
  if (input.kind === 'regenerate') {
    lectureId = input.lectureId;
  } else {
    lectureId = uid();
    const title = input.kind === 'sample' ? loadSample(input.slug).sample.title : input.kind === 'url' ? input.url : input.title || ('filename' in input ? input.filename.replace(/\.[a-z0-9]+$/i, '') : 'Pasted lecture');
    db.prepare('INSERT INTO lectures(id,user_id,title,source_url,source_type,status,created_at,is_sample) VALUES(?,?,?,?,?,?,?,?)').run(
      lectureId, userId, title, input.kind === 'url' ? input.url : null, input.kind === 'sample' ? 'sample' : input.kind === 'url' ? 'url' : input.kind, 'processing', now(), input.kind === 'sample' ? 1 : 0);
  }
  db.prepare('INSERT INTO jobs(id,user_id,lecture_id,status,stage,progress,message,input_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(
    jobId, userId, lectureId, 'queued', 'queued', 0, 'Queued', JSON.stringify({ ...input, text: undefined }), now(), now());
  // fire-and-forget in this process; state lives in SQLite so the UI can poll
  setImmediate(() => {
    runJob(jobId, userId, lectureId, input).catch((e) => console.error('[penlight] job crashed', e));
  });
  return { jobId, lectureId };
}

async function runJob(jobId: string, userId: string, lectureId: string, input: IngestInput) {
  const db = getDb();
  try {
    setJob(jobId, { status: 'running', stage: 'fetching', progress: 0.03, message: 'Starting' });
    let segments: Segment[] = [];
    let meta: { title?: string; channel?: string | null; thumbnail?: string | null; duration?: number | null; url?: string | null } = {};
    let transcriptSource = 'paste';
    let durationSec: number | null = null;

    if (input.kind === 'regenerate') {
      const row = db.prepare('SELECT * FROM lectures WHERE id=? AND user_id=?').get(lectureId, userId) as { segments_json: string; title: string; duration_sec: number | null; transcript_source: string } | undefined;
      if (!row?.segments_json) throw new IngestError('missing', 'This study set has no stored transcript to regenerate from.');
      segments = JSON.parse(row.segments_json);
      meta = { title: row.title };
      durationSec = row.duration_sec;
      transcriptSource = row.transcript_source;
    } else if (input.kind === 'sample') {
      setJob(jobId, { stage: 'fetching', progress: 0.2, message: 'Loading sample transcript' });
      const s = loadSample(input.slug);
      segments = s.segments;
      durationSec = s.durationSec;
      meta = { title: s.sample.title, channel: s.sample.channel };
      transcriptSource = 'sample';
    } else if (input.kind === 'paste' || input.kind === 'upload') {
      setJob(jobId, { stage: 'fetching', progress: 0.2, message: input.kind === 'upload' ? 'Reading your file' : 'Reading your transcript' });
      const parsed = parseTranscriptText(input.text);
      segments = parsed.segments;
      transcriptSource = input.kind;
      if (parsed.format === 'plain') durationSec = Math.round(wordCount(segments) / 2.6);
      else durationSec = Math.round(Math.max(...segments.map((s) => s.start)) + 8);
      meta = { title: input.title || ('filename' in input ? input.filename.replace(/\.[a-z0-9]+$/i, '') : 'Pasted lecture') };
    } else {
      const parsed = parseVideoUrl(input.url);
      if (!parsed.ok) throw new IngestError('bad_url', parsed.error);
      setJob(jobId, { stage: 'fetching', progress: 0.08, message: 'Fetching the video and captions' });
      let res = await fetchCaptions(parsed.url, (p) => setJob(jobId, { stage: 'fetching', progress: 0.08 + p.pct * 0.25, message: p.message }));
      if (!res.ok && (res.error_code === 'no_captions' || res.error_code === 'failed') && process.env.DISABLE_WHISPER !== '1') {
        setJob(jobId, { stage: 'transcribing', progress: 0.3, message: 'No captions found. Transcribing the audio locally' });
        const t = await transcribeAudio(parsed.url, (p) => setJob(jobId, { stage: 'transcribing', progress: 0.3 + p.pct * 0.3, message: p.message }));
        if (t.ok) res = t;
        else if (t.error_code === 'whisper_unavailable' || t.error_code === 'no_ytdlp' || t.error_code === 'too_long') {
          throw new IngestError(t.error_code, `This video has no captions, and ${t.message}`);
        } else res = t;
      }
      if (!res.ok) throw new IngestError(res.error_code, res.message);
      segments = res.segments;
      transcriptSource = res.source;
      durationSec = res.meta.duration ?? null;
      meta = { title: res.meta.title, channel: res.meta.channel, thumbnail: res.meta.thumbnail, duration: res.meta.duration, url: res.meta.webpage_url || parsed.url };
    }

    if (!segments.length || wordCount(segments) < 80) throw new IngestError('too_short', 'That transcript is too short to build a study set from (under ~80 words). Try a longer lecture.');

    db.prepare('UPDATE lectures SET title=COALESCE(?,title), channel=COALESCE(?,channel), thumbnail=COALESCE(?,thumbnail), duration_sec=COALESCE(?,duration_sec), segments_json=?, transcript_source=?, word_count=?, source_url=COALESCE(?,source_url) WHERE id=?')
      .run(meta.title ?? null, meta.channel ?? null, meta.thumbnail ?? null, durationSec, JSON.stringify(segments), transcriptSource, wordCount(segments), meta.url ?? null, lectureId);

    // ---- extracting & generating
    setJob(jobId, { stage: 'extracting', progress: 0.62, message: 'Finding key terms and definitions' });
    const cfg = getLlmConfig();
    const want = input.mode ?? 'auto';
    const useAi = !!cfg && want !== 'lite';
    if (want === 'ai' && !cfg) throw new IngestError('no_key', 'AI mode needs an API key. Add one in Settings, or use Lite mode.');
    let out: StudyOutput;
    const title = meta.title || (db.prepare('SELECT title FROM lectures WHERE id=?').get(lectureId) as { title: string }).title;
    if (useAi && cfg) {
      try {
        setJob(jobId, { stage: 'generating', progress: 0.7, message: 'Asking the AI to write your study set' });
        out = await buildAi(cfg, segments, { title, durationSec }, (m, pct) => setJob(jobId, { stage: 'generating', progress: 0.68 + pct * 0.25, message: m }));
      } catch (e) {
        if (want === 'ai') throw new IngestError('ai_failed', `AI generation failed: ${(e as Error).message}`);
        setJob(jobId, { stage: 'generating', progress: 0.8, message: 'AI was unavailable. Falling back to Lite mode' });
        out = buildLite(segments, { title, durationSec, seed: lectureId });
        out.guide.notes = [`AI generation failed (${(e as Error).message.slice(0, 160)}), so this study set was built in Lite mode. You can retry AI from the study set page.`];
      }
    } else {
      setJob(jobId, { stage: 'generating', progress: 0.8, message: 'Building the study guide, flashcards and questions' });
      out = buildLite(segments, { title, durationSec, seed: lectureId });
    }
    saveStudyOutput(db, userId, lectureId, out, title);
    if (input.kind !== 'regenerate') logActivity(userId, { kind: 'lecture', label: `Created study set: ${title}`, xp: 25, minutes: 1, topic: out.guide.topic });
    setJob(jobId, { status: 'done', stage: 'done', progress: 1, message: 'Your study set is ready', lecture_id: lectureId });
  } catch (e) {
    const err = e instanceof IngestError ? e : new IngestError('failed', (e as Error).message || 'Something went wrong.');
    console.error('[penlight] ingest failed:', err.code, err.message);
    db.prepare("UPDATE lectures SET status='error' WHERE id=?").run(lectureId);
    if (input.kind === 'regenerate') db.prepare("UPDATE lectures SET status='ready' WHERE id=?").run(lectureId);
    setJob(jobId, { status: 'error', stage: 'error', error: err.message, error_code: err.code, message: 'Failed' });
  }
}

export function saveStudyOutput(db: Database.Database, userId: string, lectureId: string, out: StudyOutput, title: string) {
  const tx = db.transaction(() => {
    // wipe previous generated content for this lecture (regeneration)
    db.prepare("DELETE FROM decks WHERE kind='lecture' AND ref_id=? AND user_id=?").run(lectureId, userId);
    db.prepare('DELETE FROM questions WHERE lecture_id=?').run(lectureId);
    const deckId = `lec:${lectureId}`;
    db.prepare('INSERT INTO decks(id,user_id,kind,ref_id,title,description,category,created_at) VALUES(?,?,?,?,?,?,?,?)').run(deckId, userId, 'lecture', lectureId, title, `Flashcards from “${title}”`, out.guide.topic, now());
    const insCard = db.prepare('INSERT INTO cards(id,deck_id,type,front,back,extra_json,topic,origin,created_at) VALUES(?,?,?,?,?,?,?,?,?)');
    const insState = db.prepare('INSERT OR IGNORE INTO card_state(user_id,card_id,due_at) VALUES(?,?,?)');
    for (const c of out.cards) {
      const id = uid();
      insCard.run(id, deckId, c.type, c.front, c.back, JSON.stringify({ start: c.start, mnemonic: c.mnemonic }), c.topic || out.guide.topic, out.guide.mode, now());
      insState.run(userId, id, now());
    }
    const insQ = db.prepare('INSERT INTO questions(id,bank,exam,topic,type,stem,options_json,correct_json,rationale,difficulty,origin,lecture_id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)');
    for (const q of out.questions) insQ.run(uid(), `lecture:${lectureId}`, 'lecture', q.topic, q.type, q.stem, JSON.stringify(q.options), JSON.stringify(q.correct), q.rationale, q.difficulty, out.guide.mode, lectureId, now());
    db.prepare("UPDATE lectures SET guide_json=?, mode=?, status='ready', topic=? WHERE id=?").run(JSON.stringify(out.guide), out.guide.mode, out.guide.topic, lectureId);
  });
  tx();
}
