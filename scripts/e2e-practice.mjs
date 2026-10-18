#!/usr/bin/env node
/**
 * Practice-tab end-to-end: EVERY test tile on /practice (and the lecture "Practice test" tab) is started, answered,
 * finished and checked on the results screen, through the real UI, on a desktop AND a phone viewport.
 *   node scripts/e2e-practice.mjs                       (local: requires `npm run build`; fresh DB on port 3102)
 *   E2E_BASE=https://penlight-4doc.onrender.com node scripts/e2e-practice.mjs   (against a live deploy)
 * Set E2E_QUICK=1 to run a smaller sample (every 3rd tile) against live.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { chromium, devices } from 'playwright';

const LIVE = process.env.E2E_BASE;
const PORT = 3102, BASE = LIVE || `http://localhost:${PORT}`, DATA = '/tmp/pl-practice-data';
const results = []; const T = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  — ' + x : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let srv;
if (!LIVE) {
  fs.rmSync(DATA, { recursive: true, force: true });
  srv = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(PORT)], { env: { ...process.env, DATA_DIR: DATA, DISABLE_WHISPER: '1' }, stdio: 'ignore' });
}
for (let i = 0; i < 120; i++) { try { if ((await fetch(BASE + '/api/health')).ok) break; } catch {} await sleep(1000); }

const browser = await chromium.launch();

/** Play the test that is currently open until the results screen. Returns {answered, types}. */
async function play(page, mode) {
  await page.waitForSelector('#stem', { timeout: 30000 });
  const total = Number((await page.locator('text=/Question 1 of \\d+/').first().innerText()).match(/of (\d+)/)[1]);
  const types = new Set();
  for (let i = 0; i < total; i++) {
    await page.waitForSelector('#stem');
    if (await page.locator('#num').count()) { types.add('numeric'); await page.locator('#num').fill('1'); }
    else {
      const sata = (await page.locator('button[role=checkbox]').count()) > 0; types.add(sata ? 'sata' : 'mcq');
      await page.locator('button[role=radio], button[role=checkbox]').first().click();
    }
    if (mode === 'tutor') {
      await page.getByRole('button', { name: /Check answer/ }).click();
      await page.waitForSelector('[role=status]:has-text("Rationale")', { timeout: 15000 });
      await page.getByRole('button', { name: i === total - 1 ? /See results/ : /Next question/ }).click();
    } else {
      await page.getByRole('button', { name: i === total - 1 ? /Finish test/ : /^Next/ }).click();
    }
  }
  await page.waitForSelector('text=Review questions', { timeout: 20000 });
  const txt = await page.locator('main').innerText();
  return { total, types: [...types], ok: /Review questions/i.test(txt) && /XP earned/i.test(txt) && /Score \d+ percent|\d+%/.test(txt) };
}

async function suite(label, ctxOpts, mobile) {
  const ctx = await browser.newContext(ctxOpts);
  await ctx.addCookies([{ name: 'penlight_tz', value: 'America/Indianapolis', url: BASE }]);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror ' + e.message.slice(0, 120)));
  page.on('dialog', (d) => d.accept());
  page.on('response', (r) => { if (r.status() >= 500) errors.push(`HTTP ${r.status()} ${r.url()}`); });
  // a study set so the "From my study sets" tile exists
  const ing = await (await ctx.request.post(BASE + '/api/ingest', { data: { kind: 'sample', slug: 'medication-safety' } })).json();
  for (let i = 0; i < 90; i++) { const j = await (await ctx.request.get(BASE + '/api/jobs/' + ing.jobId)).json(); if (j.status === 'done' || j.status === 'error') break; await sleep(1000); }
  await page.goto(BASE + '/practice', { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForSelector('button[aria-pressed]');
  const names = (await page.locator('button[aria-pressed]').allInnerTexts()).map((t) => t.split('\n')[0]);
  T(`[${label}] practice page lists tiles`, names.length >= 22, `${names.length} tiles`);
  T(`[${label}] a "From my study sets" tile is offered`, (await page.locator('h2', { hasText: 'From my study sets' }).count()) === 1);
  let list = names.map((n, i) => ({ n, i }));
  if (process.env.E2E_QUICK) list = list.filter((x) => x.i % 3 === 0);
  const seenTypes = new Set();
  for (const { n, i } of list) {
    const mode = !mobile && i % 2 ? 'exam' : 'tutor';
    try {
      await page.goto(BASE + '/practice', { waitUntil: 'networkidle' });
      await page.locator('button[aria-pressed]').filter({ hasText: n }).first().click();
      if (mobile) {
        // the Start control must be visible without hunting for it, then the one-tap start is used
        const bar = page.getByRole('button', { name: /Start .* test now/ });
        await bar.waitFor();
        const vis = await bar.evaluate((el) => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; });
        if (!vis) throw new Error('Start button not visible on phone after selecting tile');
        await bar.click();
      } else {
        await page.getByRole('radio', { name: '5', exact: true }).click();
        if (mode === 'exam') { await page.getByRole('radio', { name: /Exam/ }).click(); await page.getByRole('radio', { name: /Timed/ }).click(); }
        await page.getByRole('button', { name: /Start test/ }).first().click();
      }
      await page.waitForURL(/\/practice\/[a-f0-9]+$/, { timeout: 30000 });
      const r = await play(page, mode);
      r.types.forEach((t) => seenTypes.add(t));
      T(`[${label}] ${n} (${mode}${mode === 'exam' ? ', timed' : ''}) start→answer→finish→results`, r.ok, `${r.total} q, types ${r.types.join('/')}`);
    } catch (e) {
      T(`[${label}] ${n} (${mode})`, false, e.message.split('\n')[0].slice(0, 160));
      await page.screenshot({ path: `/tmp/practice-FAIL-${label}-${i}.png` }).catch(() => {});
    }
  }
  if (mobile) for (const u of ['/practice', '/progress', '/']) {
    await page.goto(BASE + u, { waitUntil: 'networkidle' }); await sleep(400);
    const w = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    T(`[${label}] ${u} has no sideways overflow after many finished tests`, w[0] === w[1], `scrollWidth ${w[0]} vs viewport ${w[1]}`);
  }
  T(`[${label}] covered question types mcq, sata, numeric`, ['mcq', 'sata', 'numeric'].every((t) => seenTypes.has(t)), [...seenTypes].join(','));
  // study-set tile + lecture "Practice test" tab
  let step = 'library tab';
  try {
    await page.goto(`${BASE}/library/${ing.lectureId}#test`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /Start test/ }).first().click();
    await page.waitForURL(/\/practice\/[a-f0-9]+$/, { timeout: 30000 });
    const r = await play(page, 'tutor'); T(`[${label}] lecture "Practice test" tab runs to results`, r.ok, `${r.total} q`);
    step = 'New test link';
    await page.getByRole('link', { name: 'New test' }).click(); await page.waitForURL(/\/practice$/);
    await page.waitForSelector('button[aria-pressed]');
    step = 'study-set tile';
    const tile = page.locator('button[aria-pressed]').filter({ hasText: /Study set/ }).first();
    await tile.click();
    step = 'start study-set test';
    if (mobile) await page.getByRole('button', { name: /Start .* test now/ }).click(); else await page.getByRole('button', { name: /Start test/ }).first().click();
    await page.waitForURL(/\/practice\/[a-f0-9]+$/, { timeout: 30000 });
    const r2 = await play(page, 'tutor'); T(`[${label}] "From my study sets" tile runs to results`, r2.ok, `${r2.total} q`);
    // retake missed (all answers were option A so some are missed)
    const rt = page.getByRole('button', { name: /Retake missed/ });
    if (await rt.count()) { await rt.click(); await page.waitForURL(/\/practice\/[a-f0-9]+$/); const r3 = await play(page, 'tutor'); T(`[${label}] retake-missed runs to results`, r3.ok, `${r3.total} q`); }
  } catch (e) { T(`[${label}] lecture/study-set flows (${step})`, false, e.message.slice(0, 300) + ' DIAG ' + JSON.stringify(await page.evaluate(() => { const b = document.querySelector('[aria-label^="Start"]'); if (!b) return 'nobtn'; const r = b.getBoundingClientRect(); const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { r: [r.left, r.top, r.right, r.bottom], iw: innerWidth, ih: innerHeight, sx: scrollX, sy: scrollY, sw: document.documentElement.scrollWidth, hit: h && (h.tagName + ' ' + (h.getAttribute('aria-label') || String(h.className).slice(0, 50))) }; }).catch((x) => String(x)))); await page.screenshot({ path: `/tmp/practice-FAIL-${label}-lec.png` }).catch(() => {}); }
  T(`[${label}] no server errors or uncaught page errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

await suite('desktop', { viewport: { width: 1280, height: 900 } }, false);
await suite('phone', { ...devices['iPhone 13'] }, true);
await browser.close(); srv?.kill();
const pass = results.filter(Boolean).length;
console.log(`\n${pass}/${results.length} practice checks passed`);
process.exit(pass === results.length ? 0 : 1);
