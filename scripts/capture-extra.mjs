// In-progress states: flipped card, practice question + tutor feedback, mid-game screens, game results. usage: BASE=.. COOKIE=.. node scripts/capture-extra.mjs
import { chromium } from 'playwright';
const base = process.env.BASE || 'http://localhost:3102', cookie = process.env.COOKIE, OUT = 'docs/screenshots';
const sizes = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } };
const browser = await chromium.launch();
for (const v of ['desktop', 'mobile']) {
  const ctx = await browser.newContext({ viewport: sizes[v], deviceScaleFactor: v === 'mobile' ? 2 : 1, isMobile: v === 'mobile' });
  await ctx.addCookies([{ name: 'penlight_tz', value: 'America/Indianapolis', url: base }, { name: 'penlight_session', value: cookie, url: base }]);
  const page = await ctx.newPage();
  const snap = async (n) => { await page.waitForTimeout(500); await page.screenshot({ path: `${OUT}/${n}-${v}.png` }); console.log('shot', n, v); };
  // flashcard flipped
  await page.goto(base + '/study', { waitUntil: 'networkidle' }); await page.keyboard.press('Space'); await snap('study-flipped');
  // practice question with tutor feedback
  await page.goto(base + '/practice', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Mixed NCLEX/ }).click(); await page.getByRole('radio', { name: '5', exact: true }).click();
  await page.getByRole('button', { name: /Start test/ }).first().click(); await page.waitForURL(/\/practice\/[a-f0-9]+/);
  await page.locator('button[role=radio], button[role=checkbox]').first().waitFor();
  await snap('practice-question');
  await page.locator('button[role=radio], button[role=checkbox]').first().click();
  if (await page.locator('button[role=checkbox]').count()) await page.locator('button[role=checkbox]').nth(1).click();
  await page.getByRole('button', { name: 'Check answer' }).click(); await page.waitForTimeout(700); await snap('practice-feedback');
  // match mid-game
  await page.goto(base + '/games/match', { waitUntil: 'networkidle' }); await page.locator('ul[aria-label=Terms]').waitFor();
  const terms = await page.locator('ul[aria-label=Terms] button').allTextContents();
  const defs = await page.locator('ul[aria-label=Definitions] button').allTextContents();
  const data = await (await fetch(base + '/api/games/match', { headers: { cookie: `penlight_session=${cookie}` } })).json().catch(() => null);
  await page.locator('ul[aria-label=Terms] button').first().click(); await snap('game-match-selected');
  // speed mid-game
  await page.goto(base + '/games/speed', { waitUntil: 'networkidle' });
  for (let i = 0; i < 4; i++) { await page.keyboard.press('t'); await page.waitForTimeout(450); await page.keyboard.press(/^(Enter|n)$/.test('x') ? 'Enter' : 't').catch(() => {}); }
  await snap('game-speed-mid');
  // gap with feedback
  await page.goto(base + '/games/gap', { waitUntil: 'networkidle' }); await page.getByRole('group', { name: 'Word bank' }).getByRole('button').first().click(); await snap('game-gap-feedback');
  await ctx.close();
}
await browser.close();
