import { getDb } from './db';
import type { Guide } from './types';

export function listLectures(userId: string) {
  return getDb().prepare(`SELECT l.id,l.title,l.channel,l.thumbnail,l.duration_sec,l.source_url,l.source_type,l.transcript_source,l.is_sample,l.mode,l.status,l.topic,l.word_count,l.created_at,
      (SELECT COUNT(*) FROM cards c WHERE c.deck_id='lec:'||l.id) cards,
      (SELECT COUNT(*) FROM questions q WHERE q.lecture_id=l.id) questions
    FROM lectures l WHERE l.user_id=? ORDER BY l.created_at DESC`).all(userId);
}

export function getLecture(userId: string, id: string) {
  const db = getDb();
  const l = db.prepare('SELECT * FROM lectures WHERE id=? AND user_id=?').get(id, userId) as (Record<string, unknown> & { guide_json: string | null; segments_json: string | null }) | undefined;
  if (!l) return null;
  const guide = l.guide_json ? (JSON.parse(l.guide_json) as Guide) : null;
  const { guide_json: _g, segments_json: _s, ...rest } = l;
  void _g; void _s;
  return {
    ...rest, guide,
    counts: {
      cards: (db.prepare('SELECT COUNT(*) n FROM cards WHERE deck_id=?').get(`lec:${id}`) as { n: number }).n,
      questions: (db.prepare('SELECT COUNT(*) n FROM questions WHERE lecture_id=?').get(id) as { n: number }).n,
    },
    deckId: `lec:${id}`,
  };
}
export function getSegments(userId: string, id: string): { start: number; text: string }[] {
  const r = getDb().prepare('SELECT segments_json FROM lectures WHERE id=? AND user_id=?').get(id, userId) as { segments_json: string | null } | undefined;
  return r?.segments_json ? JSON.parse(r.segments_json) : [];
}
export function deleteLecture(userId: string, id: string) {
  const db = getDb();
  db.prepare("DELETE FROM decks WHERE kind='lecture' AND ref_id=? AND user_id=?").run(id, userId);
  db.prepare('DELETE FROM questions WHERE lecture_id=?').run(id);
  return db.prepare('DELETE FROM lectures WHERE id=? AND user_id=?').run(id, userId).changes > 0;
}
export function renameLecture(userId: string, id: string, title: string) {
  return getDb().prepare('UPDATE lectures SET title=? WHERE id=? AND user_id=?').run(title.trim().slice(0, 140), id, userId).changes > 0;
}
