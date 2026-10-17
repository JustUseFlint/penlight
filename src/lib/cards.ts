import { getDb, now, uid } from './db';
import { endOfLocalDay, logActivity, checkAchievements } from './progress';
import { schedule, previewIntervals, masteryOf, DAY, type Grade, type CardState } from './srs';

export const NEW_PER_DAY = Number(process.env.NEW_CARDS_PER_DAY || 20);

export interface CardScope { deck?: string; lectureId?: string; tags?: string[]; topic?: string; exam?: string; all?: boolean }

interface Row { id: string; deck_id: string; type: string; front: string; back: string; extra_json: string | null; topic: string | null; tag: string | null; origin: string; ease: number | null; interval_days: number | null; reps: number | null; lapses: number | null; due_at: number | null; last_reviewed: number | null; introduced_at: number | null }

function scopeSql(userId: string, scope: CardScope) {
  const where: string[] = ["(d.user_id IS NULL OR d.user_id=@u)"];
  const p: Record<string, unknown> = { u: userId };
  if (scope.deck) { where.push('c.deck_id=@deck'); p.deck = scope.deck; }
  if (scope.lectureId) { where.push('c.deck_id=@deck2'); p.deck2 = `lec:${scope.lectureId}`; }
  if (scope.tags?.length) { where.push(`c.tag IN (${scope.tags.map((_, i) => `@t${i}`).join(',')})`); scope.tags.forEach((t, i) => (p[`t${i}`] = t)); }
  if (scope.topic) { where.push('c.topic=@topic'); p.topic = scope.topic; }
  if (scope.exam) {
    const decks = scope.exam === 'teas' ? "'teas-%'" : scope.exam === 'nclex' ? "'nclex-%'" : scope.exam === 'core' ? "'core-%'" : "'dosage%'";
    where.push(`c.deck_id LIKE ${decks}`);
  }
  if (!scope.deck && !scope.lectureId && !scope.tags?.length && !scope.topic && !scope.exam) where.push('(d.user_id=@u OR s.last_reviewed IS NOT NULL)');
  return { where: where.join(' AND '), p };
}

const isNew = (r: Row) => !r.last_reviewed;

function fmt(r: Row) {
  const state: CardState = { ease: r.ease ?? 2.5, interval_days: r.interval_days ?? 0, reps: r.reps ?? 0, lapses: r.lapses ?? 0 };
  return {
    id: r.id, deckId: r.deck_id, type: r.type, front: r.front, back: r.back, topic: r.topic, tag: r.tag, origin: r.origin,
    extra: r.extra_json ? JSON.parse(r.extra_json) : null,
    isNew: isNew(r), status: isNew(r) ? 'new' : masteryOf({ reps: state.reps, interval_days: state.interval_days }),
    intervals: previewIntervals(state, 0),
    dueAt: r.due_at,
  };
}

const SELECT = `SELECT c.id,c.deck_id,c.type,c.front,c.back,c.extra_json,c.topic,c.tag,c.origin, s.ease,s.interval_days,s.reps,s.lapses,s.due_at,s.last_reviewed,s.introduced_at
  FROM cards c JOIN decks d ON d.id=c.deck_id LEFT JOIN card_state s ON s.card_id=c.id AND s.user_id=@u`;

export function newIntroducedToday(userId: string, tz: string): number {
  const t = now();
  const eod = endOfLocalDay(t, tz);
  const start = eod - DAY;
  return (getDb().prepare('SELECT COUNT(*) n FROM card_state WHERE user_id=? AND introduced_at>=? AND introduced_at<?').get(userId, start, eod) as { n: number }).n;
}

/** Build today's queue: due reviews first (oldest due first), then new cards up to the daily allowance. */
export function buildQueue(userId: string, scope: CardScope, tz: string, opts: { limit?: number; newLimit?: number; ignoreDailyLimit?: boolean } = {}) {
  const { where, p } = scopeSql(userId, scope);
  const rows = getDb().prepare(`${SELECT} WHERE ${where}`).all(p) as Row[];
  const eod = endOfLocalDay(now(), tz);
  const due = rows.filter((r) => !isNew(r) && (r.due_at ?? 0) <= eod).sort((a, b) => (a.due_at ?? 0) - (b.due_at ?? 0));
  const fresh = rows.filter(isNew);
  const allowance = opts.ignoreDailyLimit ? (opts.newLimit ?? 15) : Math.max(0, Math.min(opts.newLimit ?? NEW_PER_DAY, NEW_PER_DAY - newIntroducedToday(userId, tz)));
  // stable pseudo-random order for new cards but keep lesson order within the same tag (author order)
  const newPick = fresh.slice(0, allowance);
  const limit = opts.limit ?? 60;
  const queue = [...due, ...newPick].slice(0, limit);
  return {
    cards: queue.map(fmt),
    counts: { due: due.length, new: newPick.length, newAvailable: fresh.length, total: rows.length, newAllowance: allowance },
  };
}

/** Counts across everything the user has touched, for dashboards and nav badges. */
export function dueCounts(userId: string, tz: string) {
  const eod = endOfLocalDay(now(), tz);
  const r = getDb().prepare("SELECT COUNT(*) n FROM card_state WHERE user_id=? AND last_reviewed IS NOT NULL AND due_at<=?").get(userId, eod) as { n: number };
  const fresh = (getDb().prepare("SELECT COUNT(*) n FROM card_state s JOIN cards c ON c.id=s.card_id WHERE s.user_id=? AND s.last_reviewed IS NULL").get(userId) as { n: number }).n;
  return { due: r.n, newReady: Math.max(0, Math.min(fresh, NEW_PER_DAY - newIntroducedToday(userId, tz))) };
}

export function reviewCard(userId: string, cardId: string, grade: Grade, tz: string) {
  const db = getDb();
  const card = db.prepare("SELECT c.id FROM cards c JOIN decks d ON d.id=c.deck_id WHERE c.id=? AND (d.user_id IS NULL OR d.user_id=?)").get(cardId, userId);
  if (!card) throw new Error('Card not found');
  const cur = db.prepare('SELECT * FROM card_state WHERE user_id=? AND card_id=?').get(userId, cardId) as { ease: number; interval_days: number; reps: number; lapses: number; last_reviewed: number | null; introduced_at: number | null } | undefined;
  const prev: CardState = cur ?? { ease: 2.5, interval_days: 0, reps: 0, lapses: 0 };
  const t = now();
  const next = schedule(prev, grade, t);
  const introduced = cur?.introduced_at ?? (cur?.last_reviewed ? null : t);
  db.prepare(`INSERT INTO card_state(user_id,card_id,ease,interval_days,reps,lapses,due_at,last_reviewed,introduced_at) VALUES(?,?,?,?,?,?,?,?,?)
    ON CONFLICT(user_id,card_id) DO UPDATE SET ease=excluded.ease, interval_days=excluded.interval_days, reps=excluded.reps, lapses=excluded.lapses, due_at=excluded.due_at, last_reviewed=excluded.last_reviewed, introduced_at=COALESCE(card_state.introduced_at, excluded.introduced_at)`)
    .run(userId, cardId, next.ease, next.interval_days, next.reps, next.lapses, next.due_at, t, introduced);
  logReview(userId, grade >= 2 ? 3 : 2);
  const ach = checkAchievements(userId, tz);
  return { ease: next.ease, intervalDays: next.interval_days, dueAt: next.due_at, newAchievements: ach };
}

/** Review activity is rolled into one row per session (gap < 20 min) so the activity feed stays readable. */
function logReview(userId: string, xp: number) {
  const db = getDb();
  const t = now();
  const last = db.prepare("SELECT id, ts, xp, minutes, meta_json FROM activity WHERE user_id=? AND kind='review' ORDER BY id DESC LIMIT 1").get(userId) as { id: number; ts: number; xp: number; minutes: number; meta_json: string } | undefined;
  if (last && t - last.ts < 20 * 60_000 && t - last.ts >= 0) {
    const meta = JSON.parse(last.meta_json || '{}') as { cards?: number };
    const cards = (meta.cards || 0) + 1;
    db.prepare('UPDATE activity SET xp=?, minutes=?, label=?, meta_json=?, ts=? WHERE id=?').run(last.xp + xp, Math.round((last.minutes + Math.min(1.5, (t - last.ts) / 60000 + 0.2)) * 10) / 10, `Reviewed ${cards} flashcards`, JSON.stringify({ cards }), t, last.id);
  } else {
    logActivity(userId, { kind: 'review', label: 'Reviewed 1 flashcard', xp, minutes: 0.3, meta: { cards: 1 } });
  }
}

export function listDecks(userId: string, tz: string) {
  const eod = endOfLocalDay(now(), tz);
  const rows = getDb().prepare(`
    SELECT d.id, d.title, d.kind, d.category, d.ref_id, d.description, COUNT(c.id) total,
      SUM(CASE WHEN s.last_reviewed IS NOT NULL AND s.due_at<=@eod THEN 1 ELSE 0 END) due,
      SUM(CASE WHEN s.last_reviewed IS NULL THEN 1 ELSE 0 END) fresh,
      SUM(CASE WHEN s.last_reviewed IS NOT NULL AND s.interval_days>=21 THEN 1 ELSE 0 END) mature
    FROM decks d JOIN cards c ON c.deck_id=d.id LEFT JOIN card_state s ON s.card_id=c.id AND s.user_id=@u
    WHERE d.user_id IS NULL OR d.user_id=@u GROUP BY d.id ORDER BY d.kind='premade', d.created_at DESC, d.title`).all({ u: userId, eod }) as { id: string; title: string; kind: string; category: string; ref_id: string | null; description: string | null; total: number; due: number; fresh: number; mature: number }[];
  return rows;
}

export function getDeck(userId: string, deckId: string, tz: string) {
  const db = getDb();
  const d = db.prepare('SELECT * FROM decks WHERE id=? AND (user_id IS NULL OR user_id=?)').get(deckId, userId) as { id: string; title: string; kind: string; category: string; user_id: string | null; ref_id: string | null } | undefined;
  if (!d) return null;
  const rows = db.prepare(`${SELECT} WHERE c.deck_id=@deck AND (d.user_id IS NULL OR d.user_id=@u) ORDER BY c.rowid`).all({ u: userId, deck: deckId }) as Row[];
  const eod = endOfLocalDay(now(), tz);
  const cards = rows.map(fmt);
  return {
    id: d.id, title: d.title, kind: d.kind, category: d.category, editable: d.user_id === userId, lectureId: d.ref_id,
    cards,
    counts: {
      total: cards.length,
      due: rows.filter((r) => !isNew(r) && (r.due_at ?? 0) <= eod).length,
      new: rows.filter(isNew).length,
      mature: rows.filter((r) => !isNew(r) && (r.interval_days ?? 0) >= 21).length,
      young: rows.filter((r) => !isNew(r) && (r.interval_days ?? 0) < 21).length,
    },
  };
}

function ownedDeck(userId: string, deckId: string) {
  const d = getDb().prepare('SELECT id FROM decks WHERE id=? AND user_id=?').get(deckId, userId);
  if (!d) throw new Error('You can only edit your own decks. Premade decks are read-only.');
}
export function createDeck(userId: string, title: string) {
  const id = `custom:${uid()}`;
  getDb().prepare("INSERT INTO decks(id,user_id,kind,title,category,created_at) VALUES(?,?,'custom',?,'My cards',?)").run(id, userId, title.trim().slice(0, 80) || 'My deck', now());
  return id;
}
export function addCard(userId: string, deckId: string, front: string, back: string, type: 'term' | 'qa' | 'cloze' = 'term') {
  ownedDeck(userId, deckId);
  front = front.trim(); back = back.trim();
  if (!front || (type !== 'cloze' && !back)) throw new Error('Both sides of the card need some text.');
  const id = uid();
  getDb().prepare("INSERT INTO cards(id,deck_id,type,front,back,origin,created_at) VALUES(?,?,?,?,?,'user',?)").run(id, deckId, type, front.slice(0, 1000), back.slice(0, 2000), now());
  getDb().prepare('INSERT OR IGNORE INTO card_state(user_id,card_id,due_at) VALUES(?,?,?)').run(userId, id, now());
  return id;
}
function ownedCard(userId: string, cardId: string) {
  const c = getDb().prepare('SELECT c.id FROM cards c JOIN decks d ON d.id=c.deck_id WHERE c.id=? AND d.user_id=?').get(cardId, userId);
  if (!c) throw new Error('You can only edit cards in your own decks. Premade decks are read-only.');
}
export function updateCard(userId: string, cardId: string, front: string, back: string) {
  ownedCard(userId, cardId);
  if (!front.trim()) throw new Error('The front of the card cannot be empty.');
  getDb().prepare('UPDATE cards SET front=?, back=? WHERE id=?').run(front.trim().slice(0, 1000), back.trim().slice(0, 2000), cardId);
}
export function deleteCard(userId: string, cardId: string) {
  ownedCard(userId, cardId);
  getDb().prepare('DELETE FROM cards WHERE id=?').run(cardId);
}

const csvCell = (s: string) => `"${s.replace(/"/g, '""').replace(/\r?\n/g, '<br>')}"`;
/** Anki-compatible CSV (Basic note type: Front, Back, Tags). Cloze cards are flattened to Basic so any Anki install can import them. */
export function ankiCsv(userId: string, deckId: string): { filename: string; body: string } | null {
  const db = getDb();
  const d = db.prepare('SELECT title FROM decks WHERE id=? AND (user_id IS NULL OR user_id=?)').get(deckId, userId) as { title: string } | undefined;
  if (!d) return null;
  const cards = db.prepare('SELECT type, front, back, topic FROM cards WHERE deck_id=? ORDER BY rowid').all(deckId) as { type: string; front: string; back: string; topic: string | null }[];
  const lines = ['#separator:comma', '#html:true', '#notetype:Basic', `#deck:${d.title.replace(/[\r\n]/g, ' ')}`, '#tags column:3'];
  for (const c of cards) {
    let front = c.front, back = c.back;
    if (c.type === 'cloze') {
      back = `${c.front.replace(/\{\{c1::(.+?)(?:::.+?)?\}\}/g, '<b>$1</b>')}${c.back ? '<br><br>' + c.back : ''}`;
      front = c.front.replace(/\{\{c1::.+?\}\}/g, '[...]');
    }
    const tag = (c.topic || 'penlight').replace(/[^A-Za-z0-9_-]+/g, '_');
    lines.push([csvCell(front), csvCell(back), csvCell(tag)].join(','));
  }
  return { filename: `${d.title.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'deck'}-anki.csv`, body: lines.join('\n') + '\n' };
}
