// usage: node scripts/shot.mjs <outDir> <name=path> [name=path ...]  (env: THEME=dark, VIEWS=desktop,mobile)
import { chromium } from 'playwright';
const [out, ...pages] = process.argv.slice(2);
const base = process.env.BASE || 'http://localhost:3100';
const views = (process.env.VIEWS || 'desktop,mobile').split(',');
const sizes = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } };
const browser = await chromium.launch();
for (const v of views) {
  const ctx = await browser.newContext({ viewport: sizes[v], deviceScaleFactor: v === 'mobile' ? 2 : 1, isMobile: v === 'mobile', colorScheme: process.env.THEME === 'dark' ? 'dark' : 'light' });
  await ctx.addCookies([{ name: 'penlight_tz', value: 'America/Indianapolis', url: base }]);
  if (process.env.COOKIE) await ctx.addCookies([{ name: 'penlight_session', value: process.env.COOKIE, url: base }]);
  const page = await ctx.newPage();
  for (const spec of pages) {
    const [name, path] = [spec.slice(0, spec.indexOf('=')), spec.slice(spec.indexOf('=') + 1)];
    await page.goto(base + path, { waitUntil: 'networkidle' });
    await page.waitForTimeout(700);
    const h = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.setViewportSize({ width: sizes[v].width, height: Math.max(sizes[v].height, h) });
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${out}/${name}-${v}.png` });
    await page.setViewportSize(sizes[v]);
    console.log('shot', name, v);
  }
  await ctx.close();
}
await browser.close();
