import { getDb, now, uid } from './db';
import { logActivity, checkAchievements } from './progress';
import { rng, shuffle } from './lite/text';
import { GLOSSARY_MAP } from './lite/glossary';
import { SEQUENCES } from './sequences';
import { completeProgramTask } from './programs-db';
import type { Guide } from './types';

export type GameId = 'match' | 'speed' | 'gap' | 'sequence';
export const GAMES: { id: GameId; title: string; tagline: string }[] = [
  { id: 'match', title: 'Match Rush', tagline: 'Pair every term with its definition before time runs out.' },
  { id: 'speed', title: 'Speed Round', tagline: 'True or false, fast. Build a streak for bonus XP.' },
  { id: 'gap', title: 'Fill the Gap', tagline: 'Complete the sentence from the word bank.' },
  { id: 'sequence', title: 'Sequence Builder', tagline: 'Put the steps in the right order.' },
];

export interface GameSource { lectureId?: string; deck?: string; exam?: string; tags?: string[]; seed?: string }
interface CardRow { id: string; type: string; front: string; back: string; topic: string | null }

const STOPW = new Set('the a an and or of to in on for with by from as at is are was were be been it its this that these those which who whom than then so such into out over under between within without not no can may must should will also about their there they them his her has have had does do did one two three each per'.split(' '));

function loadCards(userId: string, src: GameSource): { cards: CardRow[]; label: string } {
  const db = getDb();
  const p: Record<string, unknown> = { u: userId };
  const where = ['(d.user_id IS NULL OR d.user_id=@u)'];
  let label = 'Mixed premade cards';
  if (src.lectureId) { where.push('c.deck_id=@d'); p.d = `lec:${src.lectureId}`; const l = db.prepare('SELECT title FROM lectures WHERE id=? AND user_id=?').get(src.lectureId, userId) as { title: string } | undefined; label = l?.title ?? 'Your study set'; }
  else if (src.deck) { where.push('c.deck_id=@d'); p.d = src.deck; label = (db.prepare('SELECT title FROM decks WHERE id=?').get(src.deck) as { title: string } | undefined)?.title ?? 'Deck'; }
  else if (src.tags?.length) { where.push(`c.tag IN (${src.tags.map((_, i) => `@t${i}`).join(',')})`); src.tags.forEach((t, i) => (p[`t${i}`] = t)); label = 'This week\'s lessons'; }
  else if (src.exam) { where.push('c.deck_id LIKE @pre'); p.pre = `${src.exam === 'dosage' ? 'dosage' : src.exam + '-'}%`; label = `${src.exam.toUpperCase()} cards`; }
  else where.push("d.kind='premade'");
  const cards = db.prepare(`SELECT c.id,c.type,c.front,c.back,c.topic FROM cards c JOIN decks d ON d.id=c.deck_id WHERE ${where.join(' AND ')}`).all(p) as CardRow[];
  return { cards, label };
}

const clozeAnswer = (front: string) => front.match(/\{\{c1::(.+?)(?:::.+?)?\}\}/)?.[1];
const plain = (s: string) => s.replace(/\{\{c1::(.+?)(?:::.+?)?\}\}/g, '$1');

const LOWINFO = new Set('however mentioned similarly unlike because therefore usually always never about approximately generally typically example before after during while although whether either neither include includes including called known given using used also often another other several various common commonly mostly normal normally likely means means'.split(' '));

/** Pick a good word to blank from a definition. Returns null unless the result is a meaningful, answerable gap. */
function pickBlank(text: string, front: string): { before: string; word: string; after: string } | null {
  const words = text.trim().split(/\s+/);
  if (words.length < 6 || text.length < 35 || text.length > 170) return null;
  if ((text.match(/,/g) || []).length > 2 || /\b(first|next|then|finally)\b.*,.*,/i.test(text)) return null; // lists / signal-word lists make bad gaps
  const re = /[A-Za-z][A-Za-z'-]{4,}/g;
  let m: RegExpExecArray | null;
  const cands: { i: number; w: string; score: number }[] = [];
  while ((m = re.exec(text))) {
    const w = m[0], lw = w.toLowerCase();
    if (STOPW.has(lw) || LOWINFO.has(lw) || front.toLowerCase().includes(lw)) continue;
    const inGloss = GLOSSARY_MAP.has(lw) || GLOSSARY_MAP.has(lw.replace(/s$/, ''));
    cands.push({ i: m.index, w, score: (inGloss ? 20 : 0) + Math.min(w.length, 12) + (/[a-z]{3}(?:emia|osis|itis|pnea|cardia|uria|algia|pathy|ectomy|oma)\b/.test(lw) ? 8 : 0) });
  }
  if (!cands.length) return null;
  const best = cands.sort((a, b) => b.score - a.score)[0];
  const sentence = `${front.trim().replace(/[?:.]+$/, '')}: ${text.slice(0, best.i)}`;
  return { before: sentence, word: best.w, after: text.slice(best.i + best.w.length) };
}

export function gameData(userId: string, game: GameId, src: GameSource) {
  const r = rng(src.seed || uid());
  const { cards, label } = loadCards(userId, src);
  let guide: Guide | null = null;
  if (src.lectureId) {
    const row = getDb().prepare('SELECT guide_json FROM lectures WHERE id=? AND user_id=?').get(src.lectureId, userId) as { guide_json: string | null } | undefined;
    guide = row?.guide_json ? JSON.parse(row.guide_json) : null;
  }
  const pairs = cards.filter((c) => c.type !== 'cloze' && c.front.length <= 60 && c.back.length <= 120 && c.back.length >= 3 && !/\{\{/.test(c.front));
  if (game === 'match') {
    const pool = shuffle(pairs, r).slice(0, 24);
    return { game, label, rounds: Array.from({ length: Math.ceil(pool.length / 6) }, (_, i) => pool.slice(i * 6, i * 6 + 6).map((c) => ({ id: c.id, term: c.front, def: c.back }))).filter((x) => x.length >= 3), available: pairs.length };
  }
  if (game === 'speed') {
    type Item = { statement: string; answer: boolean; explanation: string };
    const items: Item[] = [];
    if (guide) for (const t of guide.games.tf) items.push({ statement: t.statement, answer: t.answer, explanation: t.explanation });
    const pool = shuffle(pairs, r);
    for (let i = 0; i < pool.length && items.length < 30; i++) {
      const c = pool[i];
      const sameTopic = pool.filter((x) => x.id !== c.id && x.topic && x.topic === c.topic && x.back !== c.back);
      const other = sameTopic.length >= 2 ? sameTopic[Math.floor(r() * sameTopic.length)] : pool[(i + 1 + Math.floor(r() * (pool.length - 1))) % pool.length];
      const truthy = r() < 0.5 || other.id === c.id || other.back === c.back;
      items.push({ statement: `${c.front}: ${truthy ? c.back : other.back}`, answer: truthy, explanation: truthy ? `Correct. ${c.front}: ${c.back}` : `False. ${c.front}: ${c.back}` });
    }
    return { game, label, items: shuffle(items, r).slice(0, 30), seconds: 60 };
  }
  if (game === 'gap') {
    type Item = { sentence: string; answer: string; options: string[]; explanation: string };
    const raw: { before: string; word: string; after: string; ex: string; topic: string }[] = [];
    for (const c of cards) {
      if (c.type === 'cloze') {
        const a = clozeAnswer(c.front);
        if (!a) continue;
        const i = c.front.search(/\{\{c1::/);
        const mm = c.front.match(/\{\{c1::.+?(?:::.+?)?\}\}/)!;
        raw.push({ before: plain(c.front.slice(0, i)), word: a, after: plain(c.front.slice(i + mm[0].length)), ex: plain(c.front), topic: c.topic ?? '' });
      } else if (c.type !== 'qa') {
        const b = pickBlank(c.back, c.front);
        if (b) raw.push({ ...b, ex: `${c.front}: ${c.back}`, topic: c.topic ?? '' });
      }
    }
    const picked = shuffle(raw, r).slice(0, 14);
    const items: Item[] = picked.map((x) => {
      const ok = (x2: { word: string; topic: string }) => x2.word.toLowerCase() !== x.word.toLowerCase() && Math.abs(x2.word.length - x.word.length) <= 5;
      const same = raw.filter((y) => ok(y) && y.topic && y.topic === x.topic).map((y) => y.word);
      const other = raw.filter((y) => ok(y)).map((y) => y.word);
      const distract = [...shuffle([...new Set(same)], r), ...shuffle([...new Set(other)], r)].filter((w, k, a) => a.findIndex((z) => z.toLowerCase() === w.toLowerCase()) === k).slice(0, 3);
      return { sentence: `${x.before}____${x.after}`, answer: x.word, options: shuffle([x.word, ...distract], r), explanation: x.ex };
    }).filter((i) => i.options.length >= 3);
    return { game, label, items };
  }
  // sequence
  const fromGuide = (guide?.games.sequences ?? []).filter((s) => s.steps.length >= 3).map((s) => ({ title: s.title, topic: guide!.topic, steps: s.steps }));
  const premade = src.lectureId ? [] : SEQUENCES;
  const all = [...fromGuide, ...shuffle(premade, r)];
  const usedStatic = src.lectureId && fromGuide.length < 2 ? shuffle(SEQUENCES, r).slice(0, 3) : [];
  return { game, label, puzzles: [...all, ...usedStatic].slice(0, 6), note: src.lectureId && fromGuide.length < 2 ? 'Your lecture had few clear step-by-step processes, so general nursing sequences were added.' : null };
}

export function recordGame(userId: string, g: { game: GameId; source?: string; correct: number; total: number; bestStreak?: number; seconds?: number; program?: { programId: string; taskId: string } }, tz = 'UTC') {
  if (!GAMES.find((x) => x.id === g.game)) throw new Error('Unknown game');
  const total = Math.max(1, Math.min(200, g.total));
  const correct = Math.max(0, Math.min(total, g.correct));
  const acc = correct / total;
  const xp = Math.round(correct * 3 + (acc >= 0.8 ? 10 : 0) + Math.min(10, (g.bestStreak || 0)) + 5);
  const minutes = Math.max(1, Math.round((g.seconds || 60) / 60));
  const id = uid();
  const db = getDb();
  db.prepare('INSERT INTO game_sessions(id,user_id,game,source,score,xp,detail_json,ts) VALUES(?,?,?,?,?,?,?,?)').run(id, userId, g.game, g.source ?? null, correct, xp, JSON.stringify({ total, bestStreak: g.bestStreak, seconds: g.seconds }), now());
  logActivity(userId, { kind: 'game', label: `${GAMES.find((x) => x.id === g.game)!.title}: ${correct}/${total}`, xp, minutes, meta: { game: g.game } });
  if (g.program) completeProgramTask(userId, g.program.programId, g.program.taskId, Math.round(acc * 100), tz);
  const ach = checkAchievements(userId, tz);
  return { xp, newAchievements: ach };
}

export function gameStats(userId: string) {
  return getDb().prepare('SELECT game, COUNT(*) plays, MAX(score) best, SUM(xp) xp FROM game_sessions WHERE user_id=? GROUP BY game').all(userId) as { game: GameId; plays: number; best: number; xp: number }[];
}
