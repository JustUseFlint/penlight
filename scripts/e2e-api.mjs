#!/usr/bin/env node
/**
 * API-level end-to-end verification against a FRESH database on port 3101.
 *   node scripts/e2e-api.mjs        (requires `npm run build` first)
 * Covers: guest/account flows, 3 sample lectures, paste/upload ingest, PDF, SRS over simulated days,
 * practice tests (tutor/exam, retake missed), games, programs day-by-day, dashboard, AI mode vs. mock server.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const PORT = 3101, MOCK = 4011, BASE = `http://localhost:${PORT}`;
const DATA = '/tmp/pl-e2e-data';
fs.rmSync(DATA, { recursive: true, force: true });
const procs = [];
const results = [];
const T = (name, ok, extra = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`); };
const eq = (name, a, b) => T(name, JSON.stringify(a) === JSON.stringify(b), `got ${JSON.stringify(a)} want ${JSON.stringify(b)}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Client {
  constructor() { this.cookies = {}; }
  async req(method, path, body, raw) {
    const headers = { cookie: Object.entries(this.cookies).map(([k, v]) => `${k}=${v}`).join('; ') + '; penlight_tz=America/Indianapolis' };
    let payload;
    if (body instanceof FormData) payload = body; else if (body !== undefined) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
    const res = await fetch(BASE + path, { method, headers, body: payload, redirect: 'manual' });
    for (const c of res.headers.getSetCookie?.() || []) { const [kv] = c.split(';'); const i = kv.indexOf('='); const k = kv.slice(0, i), v = kv.slice(i + 1); if (c.includes('Max-Age=0') || v === '') delete this.cookies[k]; else this.cookies[k] = v; }
    if (raw) return res;
    const text = await res.text(); let json; try { json = JSON.parse(text); } catch { json = text; }
    return { status: res.status, body: json };
  }
  get(p) { return this.req('GET', p); }
  post(p, b = {}) { return this.req('POST', p, b); }
}
const must = (r, what) => { if (r.status >= 400) throw new Error(`${what}: ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`); return r.body; };

async function waitJob(c, jobId, maxMs = 120000) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    const j = must(await c.get('/api/jobs/' + jobId), 'job');
    if (j.status === 'done' || j.status === 'error') return j;
    await sleep(400);
  }
  throw new Error('job timeout');
}

async function main() {
  procs.push(spawn('node', ['scripts/mock-llm.mjs', String(MOCK)], { stdio: 'ignore' }));
  const srv = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(PORT)], { env: { ...process.env, DATA_DIR: DATA, ALLOW_TIME_TRAVEL: '1', LLM_API_KEY: '', DISABLE_WHISPER: '1' }, stdio: 'ignore' });
  procs.push(srv);
  for (let i = 0; i < 60; i++) { try { const r = await fetch(BASE + '/api/me'); if (r.ok) break; } catch {} await sleep(500); }

  const c = new Client();
  // ---- guest
  const me = must(await c.get('/api/me'), 'me');
  T('guest profile auto-created', me.user.isGuest === true);
  let dash = must(await c.get('/api/dashboard'), 'dash');
  T('fresh dashboard has zero XP and no readiness', dash.xp.xp === 0, Object.keys(dash).join(','));

  // ---- 3 samples through the full pipeline
  const lectures = [];
  for (const slug of ['cardiac-conduction', 'medication-safety', 'potassium-sodium']) {
    const r = must(await c.post('/api/ingest', { kind: 'sample', slug }), 'ingest ' + slug);
    const j = await waitJob(c, r.jobId);
    T(`sample "${slug}" ingests (Lite)`, j.status === 'done', j.error || '');
    const l = must(await c.get('/api/lectures/' + r.lectureId), 'lecture');
    T(`  ${slug}: guide + counts + Lite label`, l.guide?.mode === 'lite' && l.counts.cards >= 20 && l.counts.questions >= 10, JSON.stringify(l.counts));
    const pdf = await c.req('GET', `/api/lectures/${r.lectureId}/pdf`, undefined, true);
    const buf = Buffer.from(await pdf.arrayBuffer());
    T(`  ${slug}: PDF served`, pdf.status === 200 && buf.slice(0, 4).toString() === '%PDF' && buf.length > 50_000, `${buf.length} bytes`);
    fs.mkdirSync('/tmp/e2e-pdf', { recursive: true }); fs.writeFileSync(`/tmp/e2e-pdf/${slug}.pdf`, buf);
    lectures.push({ slug, id: r.lectureId, deckId: l.deckId });
  }
  // ---- paste + upload (srt) ingest
  const paste = must(await c.post('/api/ingest', { kind: 'paste', title: 'Pasted lecture', text: fs.readFileSync('samples/fluid-electrolytes-potassium-sodium.txt', 'utf8') }), 'paste');
  T('pasted transcript ingests', (await waitJob(c, paste.jobId)).status === 'done');
  const srt = Array.from({ length: 60 }, (_, i) => `${i + 1}\n00:${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'},000 --> 00:${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '59' : '29'},000\nThe nurse monitors the client's heart rate and blood pressure after giving digoxin because toxicity can cause bradycardia number ${i}.`).join('\n\n');
  const fd = new FormData(); fd.append('file', new Blob([srt], { type: 'text/plain' }), 'lecture.srt'); fd.append('kind', 'upload'); fd.append('title', 'Uploaded SRT');
  const up = await c.req('POST', '/api/ingest', fd);
  T('upload .srt accepted', up.status === 200 && up.body.jobId, JSON.stringify(up.body).slice(0, 120));
  if (up.body.jobId) { const j = await waitJob(c, up.body.jobId); T('uploaded .srt ingests', j.status === 'done', j.error || ''); }
  const bad = await c.post('/api/ingest', { kind: 'url', url: 'http://127.0.0.1:3101/secret' });
  T('private-network URL rejected (SSRF guard)', bad.status >= 400);
  const bad2 = await c.post('/api/ingest', { kind: 'paste', text: 'too short' });
  T('too-short paste gives a friendly job error or 400', bad2.status >= 400 || (await waitJob(c, bad2.body.jobId)).status === 'error');

  // ---- flashcards + SRS across simulated days
  const deck = lectures[0].deckId;
  let q = must(await c.get(`/api/cards/queue?deck=${deck}`), 'queue');
  T('new queue respects the daily new-card limit (20)', q.cards.length === 20 && q.counts.new === 20, JSON.stringify(q.counts));
  const ids = q.cards.map((x) => x.id);
  // day 0: first 12 Good, 4 Hard, 4 Again
  for (let i = 0; i < ids.length; i++) must(await c.post('/api/cards/review', { cardId: ids[i], grade: i < 12 ? 2 : i < 16 ? 1 : 0 }), 'review');
  q = must(await c.get(`/api/cards/queue?deck=${deck}`), 'queue');
  T('after 20 new reviews, no more new cards today; "Again" cards are due within the session', q.counts.new === 0 && q.counts.due === 4, JSON.stringify(q.counts));
  must(await c.post('/api/dev/time', { days: 1 }), 'time');
  q = must(await c.get(`/api/cards/queue?deck=${deck}`), 'queue');
  T('day +1: Good/Hard cards (1d) + Again cards are due, 20 more new allowed', q.counts.due === 20 && q.counts.new === 20, JSON.stringify(q.counts));
  let dc = must(await c.get('/api/me'), 'me');
  T('nav due badge reflects due count', dc.due.due === 20, JSON.stringify(dc.due));
  for (const card of q.cards.filter((x) => ids.includes(x.id))) must(await c.post('/api/cards/review', { cardId: card.id, grade: 2 }), 'review');
  must(await c.post('/api/dev/time', { days: 2 }), 'time');
  q = must(await c.get(`/api/cards/queue?deck=${deck}`), 'queue');
  T('day +2: nothing from the first batch is due yet except lapsed relearns (intervals grew)', q.counts.due <= 4, JSON.stringify(q.counts));
  must(await c.post('/api/dev/time', { days: 9 }), 'time');
  q = must(await c.get(`/api/cards/queue?deck=${deck}&limit=100`), 'queue');
  T('day +9: graduated cards (6d interval) are due again', q.counts.due >= 12, JSON.stringify(q.counts));
  must(await c.post('/api/dev/time', { days: 0 }), 'time');

  // ---- deck edit/add/delete + Anki export
  const ndeck = must(await c.post('/api/decks', { title: 'My custom deck' }), 'deck');
  const nd = ndeck.id || ndeck.deckId || ndeck.deck?.id;
  const added = must(await c.post('/api/cards', { deckId: nd, front: 'Normal adult HR', back: '60–100 bpm' }), 'add card');
  const cid = added.id || added.cardId || added.card?.id;
  must(await c.req('PATCH', '/api/cards/' + cid, { front: 'Normal adult resting HR', back: '60–100 beats per minute' }), 'edit');
  const exp = await c.req('GET', `/api/decks/${nd}/export`, undefined, true);
  const csv = await exp.text();
  T('Anki CSV export has the edited card', exp.status === 200 && csv.includes('Normal adult resting HR'), csv.slice(0, 80).replace(/\n/g, '⏎'));
  must(await c.req('DELETE', '/api/cards/' + cid), 'delete');
  const exp2 = await (await c.req('GET', `/api/decks/${nd}/export`, undefined, true)).text();
  T('deleted card gone from export', !exp2.includes('Normal adult resting HR'));

  // ---- practice test: tutor, 10 q, then retake missed
  const opts = must(await c.get('/api/practice/options'), 'options');
  T('practice options list exams/topics', !!opts && Object.keys(opts).length > 0, Object.keys(opts).join(','));
  let at = must(await c.post('/api/attempts', { title: 'TEAS science', scope: { exam: 'teas' }, count: 10, mode: 'tutor', timed: false }), 'attempt');
  T('attempt served without answer key', at.questions.length === 10 && at.questions.every((x) => x.correct === undefined && x.rationale === undefined));
  let right = 0;
  for (let i = 0; i < 10; i++) {
    const qq = at.questions[i];
    const ans = qq.type === 'sata' ? [0, 1] : qq.type === 'numeric' ? '0' : [0];
    const r = must(await c.post(`/api/attempts/${at.id}/answer`, { index: i, answer: ans }), 'answer');
    if (r.correct) right++;
    if (i === 0) T('tutor mode reveals rationale immediately', typeof r.rationale === 'string' && r.rationale.length > 10);
  }
  const dup = await c.post(`/api/attempts/${at.id}/answer`, { index: 0, answer: [1] });
  T('tutor mode blocks changing an answer', dup.status >= 400);
  const fin = must(await c.post(`/api/attempts/${at.id}/finish`, { durationSec: 300 }), 'finish');
  T('finish returns score matching tutor feedback', fin.score === right && fin.total === 10, `${fin.score}/${fin.total}`);
  T('score report has per-topic breakdown and reviewable questions', fin.perTopic.length >= 1 && fin.questions.every((x) => x.rationale && x.correct), `${fin.perTopic.length} topics`);
  T('XP awarded = 5/correct + 10 (+15 if ≥80%)', fin.xp === right * 5 + 10 + (right >= 8 ? 15 : 0), `xp ${fin.xp}`);
  if (fin.score < fin.total) {
    const rt = must(await c.post('/api/attempts', { title: 'Retake missed', scope: { retakeOf: at.id }, count: 10, mode: 'exam' }), 'retake');
    T('retake-missed contains exactly the missed questions', rt.questions.length === fin.total - fin.score, `${rt.questions.length}`);
    const missedStems = fin.questions.filter((x) => !x.isCorrect).map((x) => x.stem).sort();
    T('retake stems match missed stems', JSON.stringify(rt.questions.map((x) => x.stem).sort()) === JSON.stringify(missedStems));
    // exam mode: answers save without feedback
    const r0 = must(await c.post(`/api/attempts/${rt.id}/answer`, { index: 0, answer: [0] }), 'ans');
    T('exam mode gives no feedback while testing', r0.correct === undefined && r0.rationale === undefined);
    must(await c.post(`/api/attempts/${rt.id}/finish`, { durationSec: 60 }), 'finish retake');
  }
  const hist = must(await c.get('/api/attempts'), 'attempts');
  T('attempts saved in history', hist.attempts.length >= 2, `${hist.attempts.length}`);
  const timed = must(await c.post('/api/attempts', { scope: { exam: 'dosage', drills: ['oral', 'iv-rate'] }, count: 5, mode: 'exam', timed: true }), 'drill');
  T('timed dosage drill attempt has a time limit and numeric questions', timed.timeLimitSec > 0 && timed.questions.every((x) => x.type === 'numeric'), `${timed.timeLimitSec}s`);

  // ---- games
  const games = must(await c.get('/api/games'), 'games');
  T('at least 4 games listed', games.games.length >= 4, games.games.map((g) => g.id).join(','));
  for (const g of ['match', 'speed', 'gap', 'sequence']) {
    const d = must(await c.get(`/api/games?game=${g}&lecture=${lectures[1].id}`), 'game data ' + g);
    T(`game "${g}" data builds from a lecture`, d && Object.keys(d).length > 1, Object.keys(d).join(','));
    const r = must(await c.post('/api/games', { game: g, source: 'e2e', correct: 8, total: 10, bestStreak: 5, seconds: 60 }), 'record');
    T(`game "${g}" result awards XP`, r.xp > 0, `xp ${r.xp}`);
  }

  // ---- programs day by day (dosage-2w complete; teas-3w first 3 days)
  const list = must(await c.get('/api/programs'), 'programs');
  T('8 programs listed', list.programs.length === 8, list.programs.map((p) => p.id).join(','));
  async function runProgram(pid, maxDays) {
    let det = must(await c.get('/api/programs/' + pid), 'detail');
    const days = det.weeklyPlan.flatMap((w) => w.days).slice(0, maxDays);
    let completedDays = 0;
    for (const d of days) {
      for (const t of d.tasks) {
        if (t.kind === 'quiz' || t.kind === 'drill') {
          const scope = t.kind === 'drill' ? { drills: t.drills, program: { programId: pid, taskId: t.id } } : { tags: t.tags, exam: t.exam, topic: t.topic, program: { programId: pid, taskId: t.id } };
          const a = must(await c.post('/api/attempts', { scope, count: t.count ?? 8, mode: 'tutor' }), 'prog attempt');
          for (let i = 0; i < a.questions.length; i++) await c.post(`/api/attempts/${a.id}/answer`, { index: i, answer: a.questions[i].type === 'numeric' ? '1' : [0] });
          must(await c.post(`/api/attempts/${a.id}/finish`, {}), 'finish');
        } else if (t.kind === 'cards') {
          const qs = new URLSearchParams({ program: '1' }); if (t.tags?.length) qs.set('tags', t.tags.join(',')); if (t.exam && !t.tags?.length) qs.set('exam', t.exam);
          const cq = must(await c.get('/api/cards/queue?' + qs), 'prog cards');
          for (const card of cq.cards.slice(0, 6)) await c.post('/api/cards/review', { cardId: card.id, grade: 2 });
          must(await c.post(`/api/programs/${pid}/tasks`, { taskId: t.id }), 'cards task');
        } else if (t.kind === 'game') {
          must(await c.post('/api/games', { game: t.game, correct: 7, total: 10, bestStreak: 4, seconds: 50, program: { programId: pid, taskId: t.id } }), 'game task');
        } else must(await c.post(`/api/programs/${pid}/tasks`, { taskId: t.id }), 'lesson task');
      }
      completedDays++;
    }
    det = must(await c.get('/api/programs/' + pid), 'detail2');
    const st = det.weeklyPlan.flatMap((w) => w.days).slice(0, maxDays).map((d) => d.status);
    T(`${pid}: first ${maxDays} days all marked complete`, st.every((s) => s === 'complete' || s === 'done'), st.join(','));
    return det;
  }
  const dos = await runProgram('dosage-2w', 10);
  T('dosage-2w reaches 100%', dos.pct === 100, `${dos.pct}%`);
  const t3 = await runProgram('teas-3w', 3);
  T('teas-3w progress is partial after 3 of 15 days', t3.pct > 0 && t3.pct < 100, `${t3.pct}%`);

  // ---- dashboard updated
  dash = must(await c.get('/api/dashboard'), 'dash2');
  fs.writeFileSync('/tmp/e2e-dashboard.json', JSON.stringify(dash, null, 1));
  const flat = JSON.stringify(dash);
  T('dashboard reflects activity (XP>0, activity feed, mastery, trend)', flat.length > 500 && dash.xp.xp > 0 && dash.recent.length > 0 && dash.mastery.length > 0 && dash.trend.length > 0, Object.keys(dash).join(','));

  // ---- accounts
  const wrong = await c.post('/api/auth/signup', { email: 'nope', password: 'x' });
  T('signup validates email/password', wrong.status >= 400);
  const xpBefore = dash.xp.xp;
  const su = must(await c.post('/api/auth/signup', { email: 'e2e@example.com', password: 'correct horse battery', name: 'Ada' }), 'signup');
  T('guest upgrades in place to account', su.upgraded === true);
  const me2 = must(await c.get('/api/me'), 'me2');
  T('progress kept after signup', me2.user.email === 'e2e@example.com' && !me2.user.isGuest);
  const dashA = must(await c.get('/api/dashboard'), 'dashA');
  T('XP unchanged by upgrade', dashA.xp.xp === xpBefore);
  must(await c.post('/api/auth/logout'), 'logout');
  const me3 = must(await c.get('/api/me'), 'me3');
  T('after logout a fresh guest has no progress', me3.user.isGuest === true && me3.user.email === null);
  const badLogin = await c.post('/api/auth/login', { email: 'e2e@example.com', password: 'wrong password' });
  T('wrong password rejected', badLogin.status >= 400);
  must(await c.post('/api/auth/login', { email: 'e2e@example.com', password: 'correct horse battery' }), 'login');
  const dashB = must(await c.get('/api/dashboard'), 'dashB');
  T('login restores progress', dashB.xp.xp === xpBefore);
  const other = new Client(); await other.get('/api/me');
  const peek = await other.get('/api/attempts/' + at.id);
  T("another user can't read this user's attempt", peek.status === 404 || peek.status === 403);

  // ---- AI mode against the mock OpenAI-compatible server
  const st0 = must(await c.get('/api/settings/llm'), 'llm');
  T('no key configured initially → Lite', st0.status.configured === false);
  const badSave = await c.req('PUT', '/api/settings/llm', { provider: 'custom', apiKey: 'wrong', baseUrl: `http://127.0.0.1:${MOCK}/v1`, model: 'mock-model' });
  const badTest = await c.post('/api/settings/llm/test');
  T('connection test fails clearly with a bad key', badTest.status >= 400 || badTest.body.ok === false, JSON.stringify(badTest.body).slice(0, 100));
  const saved = must(await c.req('PUT', '/api/settings/llm', { provider: 'custom', apiKey: 'mock-key', baseUrl: `http://127.0.0.1:${MOCK}/v1`, model: 'mock-model' }), 'save');
  T('saved key never returned to the client', !JSON.stringify(saved).includes('mock-key') && saved.status.configured === true && !!saved.status.keyHint, saved.status.keyHint);
  const re = must(await c.get('/api/settings/llm'), 'llm2');
  T('GET settings does not leak the key', !JSON.stringify(re).includes('mock-key'));
  const dbRaw = Buffer.concat(['penlight.db', 'penlight.db-wal'].filter((f) => fs.existsSync(`${DATA}/${f}`)).map((f) => fs.readFileSync(`${DATA}/${f}`)));
  T('key stored encrypted at rest (not plaintext in DB file)', !dbRaw.includes('mock-key'));
  const tst = must(await c.post('/api/settings/llm/test'), 'test');
  T('connection test passes against mock', tst.ok === true, tst.message);
  const ai = must(await c.post('/api/ingest', { kind: 'sample', slug: 'cardiac-conduction' }), 'ai ingest');
  const aij = await waitJob(c, ai.jobId);
  const ail = must(await c.get('/api/lectures/' + ai.lectureId), 'ai lecture');
  T('AI-mode ingest completes and is labelled "ai"', aij.status === 'done' && ail.guide.mode === 'ai' && ail.mode === 'ai', `${ail.mode}`);
  T('AI output includes the mock sections/cards/questions (invalid Q dropped)', ail.guide.sections.length === 4 && ail.counts.questions === 11, JSON.stringify(ail.counts));
  must(await c.req('PUT', '/api/settings/mode', { mode: 'lite' }), 'mode');
  const lt = must(await c.post('/api/ingest', { kind: 'sample', slug: 'medication-safety' }), 'lite again');
  await waitJob(c, lt.jobId);
  T('forcing Lite mode overrides a configured key', must(await c.get('/api/lectures/' + lt.lectureId), 'l').mode === 'lite');
  must(await c.req('PUT', '/api/settings/mode', { mode: 'auto' }), 'mode');
  // provider down → falls back to Lite
  must(await c.req('PUT', '/api/settings/llm', { provider: 'custom', apiKey: 'mock-key', baseUrl: 'http://127.0.0.1:9/v1', model: 'x' }), 'save dead');
  const fb = must(await c.post('/api/ingest', { kind: 'sample', slug: 'potassium-sodium' }), 'fb');
  const fbj = await waitJob(c, fb.jobId);
  const fbl = must(await c.get('/api/lectures/' + fb.lectureId), 'fbl');
  T('unreachable provider falls back to Lite with a notice', fbj.status === 'done' && fbl.mode === 'lite', `${fbl.mode}`);
  must(await c.req('DELETE', '/api/settings/llm'), 'clear');
  T('key can be removed', must(await c.get('/api/settings/llm'), 'x').status.configured === false);
}

main().catch((e) => { console.error('E2E ABORTED:', e.message); T('script ran to completion', false, e.message); }).finally(async () => {
  procs.forEach((p) => p.kill());
  const pass = results.filter((r) => r.ok).length;
  console.log(`\n${pass}/${results.length} checks passed`);
  process.exit(pass === results.length ? 0 : 1);
});
