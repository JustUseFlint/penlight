import type Database from 'better-sqlite3';
import crypto from 'node:crypto';
import { loadContent } from './load';

const h = (s: string) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 10);

/** Idempotent: inserts premade decks, cards and questions with stable ids. */
export function seedPremade(db: Database.Database) {
  const { questions, cards } = loadContent();
  const have = db.prepare("SELECT (SELECT COUNT(*) FROM questions WHERE origin='premade') q, (SELECT COUNT(*) FROM cards WHERE origin='premade') c").get() as { q: number; c: number };
  if (have.q === questions.length && have.c === cards.length) return;
  const t = Date.now();
  db.transaction(() => {
    const insDeck = db.prepare("INSERT INTO decks(id,user_id,kind,title,category,created_at) VALUES(?,NULL,'premade',?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title, category=excluded.category");
    const insCard = db.prepare("INSERT OR REPLACE INTO cards(id,deck_id,type,front,back,topic,origin,tag,created_at) VALUES(?,?,?,?,?,?,'premade',?,?)");
    for (const c of cards) {
      insDeck.run(c.deck, c.deckTitle, c.category, t);
      insCard.run(`${c.deck}:${h(c.front)}`, c.deck, c.type, c.front, c.back, c.topic, c.tag, t);
    }
    const insQ = db.prepare("INSERT OR REPLACE INTO questions(id,bank,exam,topic,type,stem,options_json,correct_json,rationale,difficulty,origin,tag,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,'premade',?,?)");
    for (const q of questions) insQ.run(`${q.bank}:${h(q.stem)}`, q.bank, q.exam, q.topic, q.type, q.stem, JSON.stringify(q.options), JSON.stringify(q.correct), q.rationale, q.type === 'sata' ? 3 : 2, q.tag, t);
  })();
}
