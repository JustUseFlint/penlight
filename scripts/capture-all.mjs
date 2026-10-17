// Captures full-page screenshots of every main screen at desktop (1440) and mobile (390) into docs/screenshots.
// usage: BASE=http://localhost:3102 COOKIE=<session> node scripts/capture-all.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';
const base = process.env.BASE || 'http://localhost:3102';
const cookie = process.env.COOKIE;
const OUT = 'docs/screenshots'; fs.mkdirSync(OUT, { recursive: true });
const sizes = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } };
const api = async (p) => (await fetch(base + p, { headers: { cookie: `penlight_session=${cookie}` } })).json();
const lectures = (await api('/api/lectures')).lectures;
const lec = lectures.find((l) => /Cardiac/.test(l.title)) || lectures[0];
const aiLec = lectures.find((l) => l.mode === 'ai');
const attempts = (await api('/api/attempts')).attempts.filter((a) => a.status === 'finished');
const missed = attempts.find((a) => a.score < a.total) || attempts[0];
const decks = (await api('/api/decks')).decks;
const deck = decks.find((d) => d.kind === 'lecture') || decks[0];
const pages = [
  ['home', '/'], ['library', '/library'], ['lecture', `/library/${lec.id}`], ['deck', `/decks/${encodeURIComponent(deck.id)}`], ['study', '/study'],
  ['practice', '/practice'], ['practice-results', `/practice/${missed.id}`],
  ['games', '/games'], ['game-match', '/games/match'], ['game-speed', '/games/speed'], ['game-gap', '/games/gap'], ['game-sequence', '/games/sequence'],
  ['programs', '/programs'], ['program-detail', '/programs/teas-6w'], ['program-day', '/programs/teas-6w/day/3'], ['lesson', '/learn/S1'],
  ['progress', '/progress'], ['settings', '/settings'], ['login', '/login'], ['signup', '/signup'],
];
if (aiLec) pages.splice(3, 0, ['lecture-ai', `/library/${aiLec.id}`]);
const browser = await chromium.launch();
for (const theme of ['light', 'dark']) {
  for (const v of ['desktop', 'mobile']) {
    const ctx = await browser.newContext({ viewport: sizes[v], deviceScaleFactor: v === 'mobile' ? 2 : 1, isMobile: v === 'mobile', colorScheme: theme });
    await ctx.addCookies([{ name: 'penlight_tz', value: 'America/Indianapolis', url: base }]);
    if (!['login', 'signup'].length) {}
    await ctx.addCookies([{ name: 'penlight_session', value: cookie, url: base }]);
    const page = await ctx.newPage();
    if (theme === 'dark') await page.addInitScript(() => localStorage.setItem('penlight_theme', 'dark'));
    const list = theme === 'dark' ? pages.filter(([n]) => ['home', 'lecture', 'study', 'practice', 'progress', 'programs', 'game-match'].includes(n)) : pages;
    for (const [name, path] of list) {
      if ((name === 'login' || name === 'signup') && v === 'mobile' && theme === 'dark') continue;
      await page.goto(base + path, { waitUntil: 'networkidle' }); await page.waitForTimeout(900);
      const h = await page.evaluate(() => document.documentElement.scrollHeight);
      await page.setViewportSize({ width: sizes[v].width, height: Math.min(Math.max(sizes[v].height, h), 6000) });
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${OUT}/${theme === 'dark' ? 'dark-' : ''}${name}-${v}.png` });
      await page.setViewportSize(sizes[v]);
      console.log('shot', theme, name, v);
    }
    await ctx.close();
  }
}
await browser.close();
