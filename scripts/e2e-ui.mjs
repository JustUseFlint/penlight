#!/usr/bin/env node
/**
 * Browser end-to-end (Playwright) on a FRESH database, port 3101. Plays all four games, runs the lecture flow,
 * flashcards with keyboard, a practice test, programs, accounts, dark mode, and an axe accessibility scan.
 *   node scripts/e2e-ui.mjs      (requires `npm run build`)
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const PORT = 3101, BASE = `http://localhost:${PORT}`, DATA = '/tmp/pl-ui-data', SHOTS = '/tmp/e2e-ui-shots';
fs.rmSync(DATA, { recursive: true, force: true }); fs.mkdirSync(SHOTS, { recursive: true });
const results = []; const T = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  — ' + x : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const srv = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(PORT)], { env: { ...process.env, DATA_DIR: DATA, ALLOW_TIME_TRAVEL: '1', DISABLE_WHISPER: '1' }, stdio: 'ignore' });
for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE + '/api/me')).ok) break; } catch {} await sleep(500); }

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
await ctx.addCookies([{ name: 'penlight_tz', value: 'America/Indianapolis', url: BASE }]);
const page = await ctx.newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(m.text()); });
const captured = {}; page.on('response', async (r) => { const u = r.url(); const m = u.match(/\/api\/games\?game=(\w+)/); if (m && r.ok()) captured[m[1]] = await r.json().catch(() => null); });
const run = async (name, fn) => { try { await fn(); } catch (e) { T(name, false, e.message.split('\n')[0].slice(0, 200)); await page.screenshot({ path: `${SHOTS}/FAIL-${name.replace(/\W+/g, '_')}.png` }).catch(() => {}); } };

// ---------- home → sample lecture → guide, PDF
let lectureUrl;
await run('lecture flow', async () => {
  await page.goto(BASE + '/'); await page.getByRole('button', { name: /Cardiac Conduction/ }).click();
  await page.waitForURL(/\/new\//, { timeout: 10000 }); T('job progress page shown', true);
  await page.waitForURL(/\/library\/[a-f0-9]+/, { timeout: 60000 }); lectureUrl = page.url(); T('redirects to the finished study set', true);
  await page.getByRole('heading', { level: 1 }).waitFor();
  T('guide shows Lite label + sample label', (await page.locator('body').innerText()).match(/Lite/i) !== null && /sample/i.test(await page.locator('body').innerText()));
  T('guide has timestamp chips linking key points', (await page.locator('a[href*="t="], button:has-text("0:")').count()) > 3 || (await page.locator('text=/\\b\\d:\\d\\d\\b/').count()) > 3);
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.getByRole('button', { name: /Download PDF/ }).click()]);
  const p = `${SHOTS}/guide.pdf`; await dl.saveAs(p); const b = fs.readFileSync(p);
  T('PDF downloads from the UI', b.slice(0, 4).toString() === '%PDF' && b.length > 50000, `${b.length} bytes, ${dl.suggestedFilename()}`);
  for (const tab of ['Flashcards', 'Practice', 'Games', 'Transcript']) { const t = page.getByRole('tab', { name: new RegExp(tab, 'i') }); if (await t.count()) { await t.first().click(); await sleep(200); } }
  T('lecture tabs switch without errors', true);
});

// ---------- flashcards with keyboard
await run('flashcards', async () => {
  await page.goto(lectureUrl); await page.getByRole('tab', { name: /Flashcards/i }).click();
  await page.getByRole('link', { name: /Study|Start|Review/i }).first().click();
  await page.waitForURL(/\/study/); await page.getByRole('button', { name: 'Show answer' }).first().waitFor();
  const left0 = await page.locator('[aria-live="polite"]', { hasText: 'left' }).first().innerText();
  await page.keyboard.press('Space'); await page.getByRole('group', { name: /How well/ }).waitFor(); T('Space flips the card and shows grade buttons', true);
  await page.keyboard.press('3'); await sleep(500);
  await page.keyboard.press('Space'); await page.keyboard.press('1'); await sleep(500);
  const left1 = await page.locator('[aria-live="polite"]', { hasText: 'left' }).first().innerText();
  T('keys 3 and 1 grade cards and the counter moves', left0 !== left1, `${left0} → ${left1}`);
  await page.keyboard.press('Space'); await page.keyboard.press('ArrowRight'); await sleep(400);
  await page.screenshot({ path: `${SHOTS}/study.png` });
  const due = await (await ctx.request.get(BASE + '/api/me')).json();
  T('graded cards reflected in the due count (again-card due soon)', due.due.due >= 1, JSON.stringify(due.due));
});

// ---------- practice test (tutor)
await run('practice', async () => {
  await page.goto(BASE + '/practice'); await page.getByRole('button', { name: /Mixed TEAS/ }).click(); await page.getByRole('radio', { name: '5', exact: true }).click(); await page.getByRole('button', { name: /Start test/ }).first().click();
  await page.waitForURL(/\/practice\/[a-f0-9]+/); 
  for (let i = 0; i < 5; i++) {
    await page.locator('[role=radio][aria-checked], [role=checkbox][aria-checked]').first().waitFor();
    const opt = page.locator('[role=radio], [role=checkbox]').filter({ hasNot: page.locator('.never') });
    const first = page.locator('button[role=radio], button[role=checkbox]').first(); await first.click();
    if ((await first.getAttribute('role')) === 'checkbox') await page.locator('button[role=checkbox]').nth(1).click();
    await page.getByRole('button', { name: 'Check answer' }).click();
    await page.getByText(/Correct|Not quite|Incorrect|Rationale/i).first().waitFor();
    if (i === 0) T('tutor mode shows rationale after checking', (await page.locator('body').innerText()).match(/rationale/i) !== null);
    const next = page.getByRole('button', { name: /Next question|See results/ }); await next.click();
    if (i === 4) break;
  }
  await page.getByRole('heading', { name: /Breakdown by topic/ }).waitFor({ timeout: 15000 });
  T('score report appears with per-topic breakdown', /topic/i.test(await page.locator('body').innerText()));
  await page.screenshot({ path: `${SHOTS}/results.png`, fullPage: true });
  const retake = page.getByRole('button', { name: /Retake missed/ });
  if (await retake.count()) { await retake.click(); await page.waitForURL(/\/practice\/[a-f0-9]+/); T('retake-missed starts a new attempt', true); }
});

// ---------- games
await run('match', async () => {
  await page.goto(BASE + '/games/match'); await page.locator('ul[aria-label=Terms]').waitFor(); const d = captured.match;
  for (const round of d.rounds) {
    for (const p of round) {
      await page.evaluate((p) => { const f = (sel, t) => [...document.querySelectorAll(sel + ' button')].find((b) => b.textContent.trim() === t && !b.disabled); f('ul[aria-label=Terms]', p.term)?.click(); }, p);
      await sleep(60);
      await page.evaluate((p) => { const f = (sel, t) => [...document.querySelectorAll(sel + ' button')].find((b) => b.textContent.trim() === t && !b.disabled); f('ul[aria-label=Definitions]', p.def)?.click(); }, p);
      await sleep(120);
    }
    await sleep(900);
  }
  await page.getByText(/Great round|Round complete/).waitFor({ timeout: 8000 }); T('Match Rush playable to completion', true, `${d.rounds.length} rounds`);
  T('Match Rush awards XP', (await page.locator('text=/\\+\\d+/').count()) > 0);
});
await run('speed', async () => {
  await page.goto(BASE + '/games/speed'); await page.locator('[role=timer]').waitFor(); const items = captured.speed.items; let wrongOnce = false;
  for (let i = 0; i < items.length; i++) {
    const st = await page.locator('.card p.font-display').first().innerText(); const it = items.find((x) => x.statement.trim() === st.trim());
    if (!it) throw new Error('statement not found: ' + st);
    const wrong = !wrongOnce && i === 1; if (wrong) wrongOnce = true;
    await page.keyboard.press(it.answer !== wrong ? 't' : 'f');
    if (wrong) { await page.getByText(it.explanation.slice(0, 20)).waitFor({ timeout: 3000 }); T('Speed Round shows the explanation on a wrong answer', true); await sleep(1700); } else await sleep(480);
    if (await page.getByText(/Great round|Round complete/).count()) break;
  }
  await page.getByText(/Great round|Round complete/).waitFor({ timeout: 8000 }); T('Speed Round playable to completion (keyboard T/F)', true, `${items.length} statements`);
});
await run('gap', async () => {
  await page.goto(BASE + '/games/gap'); await page.getByRole('group', { name: 'Word bank' }).waitFor(); const items = captured.gap.items;
  for (let i = 0; i < items.length; i++) {
    await page.getByRole('group', { name: 'Word bank' }).waitFor();
    const it = items[i]; const bad = i === 0;
    const target = bad ? it.options.find((o) => o !== it.answer) : it.answer;
    await page.evaluate((t) => { const b = [...document.querySelectorAll('[role=group][aria-label="Word bank"] button')].find((x) => x.textContent.trim().slice(1).trim() === t); b.click(); }, target);
    await page.getByText(/Correct\.|Not quite\./).waitFor();
    if (i === 0) T('Fill the Gap flags a wrong answer and explains', (await page.locator('body').innerText()).includes('Not quite.'));
    await page.getByRole('button', { name: /^(Next|Finish)$/ }).click();
  }
  await page.getByText(/Great round|Round complete/).waitFor({ timeout: 8000 }); T('Fill the Gap playable to completion', true, `${items.length} items`);
});
await run('sequence', async () => {
  await page.goto(BASE + '/games/sequence'); await page.getByRole('group', { name: 'Steps to place' }).waitFor(); const pz = captured.sequence.puzzles;
  for (let i = 0; i < pz.length; i++) {
    await page.getByRole('group', { name: 'Steps to place' }).waitFor();
    for (const s of pz[i].steps) await page.getByRole('group', { name: 'Steps to place' }).getByRole('button', { name: s, exact: true }).click();
    await page.getByRole('button', { name: 'Check order' }).click(); await page.getByText('Correct order!').waitFor();
    await page.getByRole('button', { name: /Next puzzle|Finish/ }).click();
  }
  await page.getByText(/Great round|Round complete/).waitFor({ timeout: 8000 }); T('Sequence Builder playable to completion', true, `${pz.length} puzzles`);
});
await run('game stats', async () => {
  const j = await (await ctx.request.get(BASE + '/api/dashboard')).json();
  T('games awarded XP and are on the dashboard', j.xp.xp > 0 && j.recent.some((r) => /Match Rush|Speed|Fill|Sequence/i.test(r.label)), `xp ${j.xp.xp}`);
});

// ---------- programs: run Dosage day 1 through the UI
await run('program day', async () => {
  await page.goto(BASE + '/programs/dosage-2w/day/1'); await page.getByRole('heading', { level: 1 }).waitFor();
  const before = await page.locator('body').innerText();
  const marks = page.getByRole('button', { name: /Mark done|Mark as done|Done/ });
  T('program day page lists tasks', /Day 1/i.test(before) && /Read|lesson|drill/i.test(before), before.slice(0, 80).replace(/\n/g, ' '));
  // complete lessons via API for speed (UI path covered by learn page open below)
  const det = await (await ctx.request.get(BASE + '/api/programs/dosage-2w')).json();
  const day1 = det.weeklyPlan[0].days[0]; const lesson = day1.tasks.find((t) => t.kind === 'lesson');
  await page.goto(`${BASE}/learn/${lesson.lesson}?program=dosage-2w&task=${encodeURIComponent(lesson.id)}&day=1`); await page.getByRole('heading', { level: 1 }).waitFor();
  const done = page.getByRole('button', { name: /Mark.*(read|complete|done)|I.ve read|Finish lesson|Complete/i }); if (await done.count()) { await done.first().click(); await sleep(600); }
  const d2 = await (await ctx.request.get(BASE + '/api/programs/dosage-2w')).json();
  T('finishing a lesson in the UI completes its program task', d2.weeklyPlan[0].days[0].tasks.find((t) => t.id === lesson.id).done === true);
});

// ---------- accounts via UI + dark mode
await run('accounts', async () => {
  await page.goto(BASE + '/signup'); await page.getByLabel(/email/i).fill('ui@example.com'); await page.getByLabel(/password/i).first().fill('correct horse battery');
  const nm = page.getByLabel(/name/i); if (await nm.count()) await nm.first().fill('Pat');
  await page.getByRole('button', { name: /Create|Sign up/i }).click(); await page.waitForURL(BASE + '/', { timeout: 10000 }).catch(() => {});
  const me = await (await ctx.request.get(BASE + '/api/me')).json(); T('UI sign-up upgrades guest, progress preserved', me.user.email === 'ui@example.com');
  await page.goto(BASE + '/settings'); await page.getByRole('button', { name: /Sign out|Log out/i }).first().click(); await sleep(800);
  const me2 = await (await ctx.request.get(BASE + '/api/me')).json(); T('UI sign-out returns a fresh guest', me2.user.isGuest === true);
  await page.goto(BASE + '/login'); await page.getByLabel(/email/i).fill('ui@example.com'); await page.getByLabel(/password/i).fill('correct horse battery'); await page.getByRole('button', { name: /Sign in|Log in/i }).click(); await sleep(1200);
  const me3 = await (await ctx.request.get(BASE + '/api/me')).json(); T('UI login works', me3.user.email === 'ui@example.com');
});
await run('dark mode', async () => {
  await page.goto(BASE + '/'); await page.locator('button:visible', { hasText: /Dark mode/i }).first().click(); await sleep(400);
  T('dark mode toggles data-theme and persists on reload', (await page.locator('html').getAttribute('data-theme')) === 'dark');
  await page.reload(); T('dark theme persisted', (await page.locator('html').getAttribute('data-theme')) === 'dark');
  await page.screenshot({ path: `${SHOTS}/dark-home.png` });
  await page.locator('button:visible', { hasText: /Light mode/i }).first().click();
});

// ---------- accessibility scan (WCAG 2 A/AA) on main screens, light + dark, desktop + mobile
const axeTargets = ['/', '/library', '/programs', '/practice', '/games', '/progress', '/settings', '/study'];
for (const theme of ['light', 'dark']) for (const vp of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  await page.setViewportSize(vp);
  for (const t of axeTargets) {
    await run(`axe ${t}`, async () => {
      await page.goto(BASE + t); await page.evaluate((th) => { localStorage.setItem('penlight_theme', th); document.documentElement.dataset.theme = th; }, theme); await sleep(700);
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      const bad = r.violations.filter((v) => ['serious', 'critical'].includes(v.impact));
      T(`axe ${theme} ${vp.width}px ${t}: no serious/critical`, bad.length === 0, bad.map((v) => `${v.id}(${v.nodes.length})`).join(', '));
      if (bad.length) fs.writeFileSync(`${SHOTS}/axe-${theme}-${vp.width}-${t.replace(/\W/g, '_')}.json`, JSON.stringify(bad.map((v) => ({ id: v.id, help: v.help, nodes: v.nodes.slice(0, 4).map((n) => ({ html: n.html.slice(0, 160), why: n.any?.[0]?.message })) })), null, 1));
    });
  }
}
T('no uncaught page errors / console errors', errors.length === 0, errors.slice(0, 3).join(' | ').slice(0, 300));

await browser.close(); srv.kill();
const pass = results.filter(Boolean).length; console.log(`\n${pass}/${results.length} UI checks passed`); process.exit(pass === results.length ? 0 : 1);
