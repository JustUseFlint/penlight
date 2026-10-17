#!/usr/bin/env node
/**
 * Seeds a realistic demo profile (4 weeks of study history) into a server started with ALLOW_TIME_TRAVEL=1.
 *   BASE=http://localhost:3102 node scripts/seed-demo.mjs   → prints the session cookie value
 * Uses a throw-away "oracle" guest to learn answer keys so the demo student's accuracy looks like a real learner's.
 */
const BASE = process.env.BASE || 'http://localhost:3102';
class Client {
  constructor() { this.cookies = {}; }
  async req(method, path, body) {
    const headers = { cookie: Object.entries(this.cookies).map(([k, v]) => `${k}=${v}`).join('; ') + '; penlight_tz=America/Indianapolis' };
    let payload; if (body !== undefined) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
    const res = await fetch(BASE + path, { method, headers, body: payload });
    for (const c of res.headers.getSetCookie?.() || []) { const [kv] = c.split(';'); const i = kv.indexOf('='); this.cookies[kv.slice(0, i)] = kv.slice(i + 1); }
    const t = await res.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
    if (res.status >= 400) throw new Error(`${method} ${path}: ${res.status} ${t.slice(0, 160)}`);
    return j;
  }
  get(p) { return this.req('GET', p); } post(p, b = {}) { return this.req('POST', p, b); }
}
let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function job(c, id) { for (;;) { const j = await c.get('/api/jobs/' + id); if (j.status === 'done' || j.status === 'error') return j; await sleep(300); } }

// 1) oracle learns the answer key
const key = new Map(); // stem -> {texts:[...]} | {num}
const oracle = new Client(); await oracle.get('/api/me');
for (const exam of ['teas', 'nclex', 'core']) for (let r = 0; r < 9; r++) {
  const a = await oracle.post('/api/attempts', { scope: { exam }, count: 40, mode: 'exam' });
  for (let i = 0; i < a.questions.length; i++) await oracle.post(`/api/attempts/${a.id}/answer`, { index: i, answer: a.questions[i].type === 'numeric' ? '0' : [0] });
  const f = await oracle.post(`/api/attempts/${a.id}/finish`, {});
  for (const q of f.questions) key.set(q.stem, { texts: Array.isArray(q.correct) ? q.correct.map((i) => q.options[i]) : null, num: Array.isArray(q.correct) ? null : q.correct.answer });
}
console.error('oracle knows', key.size, 'questions');
const answerFor = (q, p) => {
  const k = key.get(q.stem);
  if (!(k && rnd() < p)) return q.type === 'numeric' ? String((rnd() * 10).toFixed(1)) : q.type === 'sata' ? [0, 1 + Math.floor(rnd() * 3)] : [Math.floor(rnd() * q.options.length)];
  return q.type === 'numeric' ? String(k.num) : k.texts.map((t) => q.options.indexOf(t));
};

// 2) the demo student
const c = new Client(); await c.get('/api/me');
await c.req('PATCH', '/api/me', { targetExam: 'both', weeklyGoalMin: 150, name: 'Alex' }).catch(() => {});
await c.post('/api/dev/time', { days: -27 });
const lec = [];
for (const slug of ['cardiac-conduction', 'medication-safety', 'potassium-sodium']) {
  const r = await c.post('/api/ingest', { kind: 'sample', slug }); await job(c, r.jobId); lec.push(r.lectureId);
  await c.post('/api/dev/time', { days: -27 + lec.length * 2 });
}
await c.post('/api/programs/teas-6w/enroll'); await c.post('/api/programs/dosage-2w/enroll'); await c.post('/api/programs/nclex-8w/enroll');
const decks = (await c.get('/api/decks')).decks || [];
const deckIds = decks.map((d) => d.id);
let teasProg = await c.get('/api/programs/teas-6w'); const progDays = teasProg.weeklyPlan.flatMap((w) => w.days);
let dayIdx = 0;
for (let day = -27; day <= 0; day++) {
  await c.post('/api/dev/time', { days: day });
  if (rnd() < 0.18 && day < -1) continue; // a few missed days
  const p = 0.4 + 0.45 * ((day + 27) / 27);
  // flashcards
  const scope = day % 2 === 0 ? `deck=${deckIds[Math.floor(rnd() * deckIds.length)]}` : `exam=teas`;
  const q = await c.get(`/api/cards/queue?${scope}&limit=25`);
  for (const card of q.cards.slice(0, 10 + Math.floor(rnd() * 12))) await c.post('/api/cards/review', { cardId: card.id, grade: rnd() < p ? (rnd() < 0.2 ? 3 : 2) : rnd() < 0.5 ? 1 : 0 });
  // a test
  if (rnd() < 0.65 || day === 0) {
    const exam = ['teas', 'nclex', 'core', 'teas'][Math.floor(rnd() * 4)];
    const a = await c.post('/api/attempts', { title: { teas: 'TEAS 7 mixed practice', nclex: 'NCLEX-RN mixed practice', core: 'Core nursing review' }[exam], scope: { exam }, count: [5, 10, 10, 20][Math.floor(rnd() * 4)], mode: rnd() < 0.5 ? 'tutor' : 'exam' });
    for (let i = 0; i < a.questions.length; i++) await c.post(`/api/attempts/${a.id}/answer`, { index: i, answer: answerFor(a.questions[i], p) });
    await c.post(`/api/attempts/${a.id}/finish`, { durationSec: 240 + Math.floor(rnd() * 600) });
  }
  // program days
  if (dayIdx < 9 && rnd() < 0.8) {
    const d = progDays[dayIdx++];
    for (const t of d.tasks) { if (t.kind === 'lesson' || t.kind === 'cards') await c.post('/api/programs/teas-6w/tasks', { taskId: t.id }); else if (t.kind === 'game') await c.post('/api/games', { game: t.game, correct: 8, total: 10, bestStreak: 5, seconds: 70, program: { programId: 'teas-6w', taskId: t.id } }); else if (t.kind === 'quiz') { const a = await c.post('/api/attempts', { scope: { tags: t.tags, exam: t.exam, topic: t.topic, program: { programId: 'teas-6w', taskId: t.id } }, count: t.count ?? 8, mode: 'tutor' }); for (let i = 0; i < a.questions.length; i++) await c.post(`/api/attempts/${a.id}/answer`, { index: i, answer: answerFor(a.questions[i], p) }); await c.post(`/api/attempts/${a.id}/finish`, {}); } }
  }
  if (rnd() < 0.4) await c.post('/api/games', { game: ['match', 'speed', 'gap', 'sequence'][Math.floor(rnd() * 4)], correct: 6 + Math.floor(rnd() * 4), total: 10, bestStreak: 3 + Math.floor(rnd() * 5), seconds: 60 });
}
await c.post('/api/dev/time', { days: 0 });
console.log(c.cookies.penlight_session);
