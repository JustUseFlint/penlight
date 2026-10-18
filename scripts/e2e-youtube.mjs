#!/usr/bin/env node
/**
 * YouTube workaround end-to-end (local build, fresh DB, port 3103).
 *   node scripts/e2e-youtube.mjs        (requires `npm run build`)
 * 1. Blocked-server flow: a YouTube link fails with the friendly "blocked" state and the guided helper appears;
 *    pasting a copied transcript builds a study set that keeps the video link (timestamp chips jump to the moment).
 * 2. The "Send to Penlight" bookmarklet is executed inside a MOCK YouTube page (real youtube.com URL, network mocked)
 *    for each of its three extraction strategies; the popup lands on /import and a study set is built.
 * 3. Optional live probe: when the machine can reach YouTube, the worker's fallback chain is run on real videos.
 * NOT verifiable here: the bookmarklet against real YouTube pages (this machine's IP gets Google's captcha).
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { chromium } from 'playwright';

const PORT = 3103, BASE = `http://localhost:${PORT}`, DATA = '/tmp/pl-yt-data';
const BOOKMARKLET_SRC = fs.readFileSync('src/lib/ytlet.ts', 'utf8').match(/BOOKMARKLET_SRC = String\.raw`([\s\S]*?)`;/)[1];
const results = []; const T = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  — ' + x : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.rmSync(DATA, { recursive: true, force: true });
const srv = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(PORT)], { env: { ...process.env, DATA_DIR: DATA, DISABLE_WHISPER: '1', PENLIGHT_SIMULATE_YT_BLOCK: '1' }, stdio: 'ignore' });
for (let i = 0; i < 90; i++) { try { if ((await fetch(BASE + '/api/health')).ok) break; } catch {} await sleep(500); }
const browser = await chromium.launch();

const lecture = fs.readFileSync('samples/cardiac-conduction-dysrhythmias.txt', 'utf8').replace(/\s+/g, ' ').split(/(?<=[.?!])\s+/).filter(Boolean);
const segs = lecture.map((t, i) => [i * 6, t]);
const stamped = segs.map(([s, t]) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}\n${t}`).join('\n');
const VID = 'abcDEF12345';

try {
  // ---------- 1. blocked flow + guided helper
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage(); page.on('dialog', (d) => d.accept());
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    await page.locator('#video-url').first().fill(`https://www.youtube.com/watch?v=${VID}`);
    T('IngestBox offers the helper link for YouTube URLs', (await page.getByRole('link', { name: /YouTube not working/ }).count()) === 1);
    await page.getByRole('button', { name: /Build study set/ }).first().click();
    await page.waitForURL(/\/new\//);
    await page.getByRole('heading', { name: /couldn.t finish/i }).waitFor({ timeout: 30000 });
    T('blocked video shows friendly message + guided helper', (await page.getByRole('heading', { name: /Use this YouTube video anyway/ }).count()) === 1);
    const href = await page.getByRole('link', { name: /Send to Penlight/ }).getAttribute('href');
    T('bookmark button carries a javascript: URL pointing at this site', href?.startsWith('javascript:') && decodeURIComponent(href).includes(`"${BASE}"`), `${href?.length} chars`);
    await page.getByRole('tab', { name: /Copy by hand/ }).click();
    T('"Open this video" link points at the right video', (await page.getByRole('link', { name: /open this video/ }).first().getAttribute('href')) === `https://www.youtube.com/watch?v=${VID}`);
    await page.getByLabel('Transcript text').fill(stamped);
    await page.getByRole('button', { name: /Build study set/ }).last().click();
    await page.waitForURL(/\/library\/[a-f0-9]+/, { timeout: 60000 });
    const lid = page.url().split('/library/')[1].split('#')[0];
    const l = await (await ctx.request.get(`${BASE}/api/lectures/${lid}`)).json();
    T('pasted-from-YouTube study set keeps the video link + thumbnail', l.source_url === `https://www.youtube.com/watch?v=${VID}` && /ytimg/.test(l.thumbnail || ''), `${l.source_url}`);
    const chip = await page.locator(`a[href*="watch?v=${VID}&t="], a[href*="watch?v=${VID}?t="]`).count();
    T('guide timestamp chips link to exact moments in the video', chip > 0, `${chip} chips`);
    await ctx.close();
  }

  // ---------- 2. bookmarklet in a mock YouTube page, three strategies
  const code = BOOKMARKLET_SRC.replace('__ORIGIN__', BASE);
  const mockHtml = (variant) => `<!doctype html><html><head><title>(3) Cardiac Conduction Review - YouTube</title></head><body><div id="player">video</div>
   <script>window.ytcfg={get:function(k){return ({INNERTUBE_CONTEXT:{client:{clientName:'WEB',clientVersion:'2.2026'}},INNERTUBE_API_KEY:'KEY'})[k]}};</script>
   ${variant === 'dom' ? `<button aria-label="Show transcript" onclick="document.body.insertAdjacentHTML('beforeend', window.__rows)">Show transcript</button>` : ''}
   <!--DATA--></body></html>`;
  const dataFor = (variant) => variant === 'innertube' ? '<script>var ytInitialData={"engagementPanels":[{"getTranscriptEndpoint":{"params":"CgtYWJjREVGMTIzNDUSEkNnQVNBbVZ1R2dBJTNEJTNE"}}]};</script>'
    : variant === 'timedtext' ? '<script>var ytInitialPlayerResponse={"captions":{"playerCaptionsTracklistRenderer":{"captionTracks":[{"baseUrl":"https://www.youtube.com/api/timedtext?v=abcDEF12345\\u0026caps=asr\\u0026lang=en","languageCode":"en","kind":"asr"},{"baseUrl":"https://www.youtube.com/api/timedtext?v=abcDEF12345\\u0026lang=en","languageCode":"en"}],"audioTracks":[]}}};</script>' : '';
  for (const variant of ['innertube', 'timedtext', 'dom']) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    let sawTranscriptCall = false;
    await ctx.route('https://www.youtube.com/**', async (route) => {
      const u = new URL(route.request().url());
      if (u.pathname === '/youtubei/v1/get_transcript') {
        sawTranscriptCall = true;
        const body = JSON.parse(route.request().postData() || '{}');
        if (!body.context || !body.params) return route.fulfill({ status: 400, body: '{}' });
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ actions: [{ updateEngagementPanelAction: { content: { transcriptRenderer: { content: { transcriptSearchPanelRenderer: { body: { transcriptSegmentListRenderer: { initialSegments: segs.map(([s, t]) => ({ transcriptSegmentRenderer: { startMs: String(s * 1000), snippet: { runs: [{ text: t }] } } })) } } } } } } } }] }) });
      }
      if (u.pathname === '/api/timedtext') {
        if (u.searchParams.get('caps') === 'asr') return route.fulfill({ status: 200, body: '' }); // auto track empty: manual one must win
        if (u.searchParams.get('fmt') !== 'json3') return route.fulfill({ status: 400, body: '' });
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ events: segs.map(([s, t]) => ({ tStartMs: s * 1000, segs: [{ utf8: t }] })) }) });
      }
      let html = mockHtml(variant).replace('<!--DATA-->', dataFor(variant));
      if (variant === 'dom') html = html.replace('<!--DATA-->', '') .replace('</body>', `<script>window.__rows=${JSON.stringify(segs.map(([s, t]) => `<ytd-transcript-segment-renderer><div class="segment-timestamp">${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}</div><yt-formatted-string class="segment-text">${t}</yt-formatted-string></ytd-transcript-segment-renderer>`).join(''))}</script></body>`);
      return route.fulfill({ contentType: 'text/html', body: html });
    });
    const yt = await ctx.newPage();
    await yt.goto(`https://www.youtube.com/watch?v=${VID}`);
    // the bookmark opens Penlight in a new tab
    const [pop] = await Promise.all([ctx.waitForEvent('page', { timeout: 30000 }), yt.evaluate(code)]);
    await pop.waitForURL(/\/library\/[a-f0-9]+/, { timeout: 90000 }).catch(() => {});
    const url = pop.url(); if (!/\/library\//.test(url)) console.log('  popup says:', (await pop.locator('main').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 300));
    let ok = /\/library\//.test(url);
    let detail = url.replace(BASE, '');
    if (ok) {
      const lid = url.split('/library/')[1].split('#')[0];
      const l = await (await ctx.request.get(`${BASE}/api/lectures/${lid}`)).json();
      ok = l.title === 'Cardiac Conduction Review' && l.source_url === `https://www.youtube.com/watch?v=${VID}` && l.counts.cards >= 15 && l.counts.questions >= 8;
      detail = `title "${l.title}", ${l.counts.cards} cards, ${l.counts.questions} questions`;
    }
    T(`bookmarklet strategy "${variant}" → study set built in Penlight`, ok, detail + (variant === 'innertube' ? `, get_transcript called=${sawTranscriptCall}` : ''));
    await ctx.close();
  }
  // wrong page → friendly toast, nothing sent
  {
    const ctx = await browser.newContext(); const p = await ctx.newPage();
    await ctx.route('https://example.com/**', (r) => r.fulfill({ contentType: 'text/html', body: '<html><body>hi</body></html>' }));
    await p.goto('https://example.com/'); await p.evaluate(code);
    T('bookmarklet on a non-YouTube page explains what to do', /Open a YouTube video/.test(await p.locator('#pl-say').innerText()));
    await ctx.close();
  }
  // import page rejects garbage gracefully
  {
    const ctx = await browser.newContext(); const p = await ctx.newPage();
    await p.goto(BASE + '/import#not-a-real-payload'); await p.waitForSelector('text=That didn’t come through');
    T('/import shows a friendly error for a bad link', true);
    await ctx.close();
  }

  // ---------- 3. optional live probe of the worker chain (only when this machine can reach YouTube)
  const py = fs.existsSync('.venv/bin/python') ? '.venv/bin/python' : 'python3';
  const live = spawnSync(py, ['worker/ingest.py', 'transcript', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'], { encoding: 'utf8', timeout: 120000, env: { ...process.env, PENLIGHT_SIMULATE_YT_BLOCK: '' } });
  let d = null; try { d = JSON.parse(live.stdout.trim().split('\n').pop()); } catch {}
  console.log(d?.ok ? `INFO  live YouTube probe from this machine: captions fetched via ${d.via} (${d.segments.length} lines)` : `INFO  live YouTube probe from this machine: ${d ? d.error_code + ': ' + d.message.slice(0, 90) : 'worker output unreadable: ' + live.stdout.slice(-120)}`);
  T('worker prints exactly one clean JSON document (no yt-dlp progress noise)', !!d && !/\[download\]/.test(live.stdout));
} finally {
  await browser.close(); srv.kill();
}
const pass = results.filter(Boolean).length;
console.log(`\n${pass}/${results.length} YouTube-workaround checks passed`);
process.exit(pass === results.length ? 0 : 1);
