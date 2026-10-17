import fs from 'node:fs';
import path from 'node:path';
import type { Guide } from './types';
import { fmtTime } from './ingest/parse';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

function font(pkg: string, file: string) {
  try {
    const f = path.join(process.cwd(), 'node_modules', '@fontsource-variable', pkg, 'files', file);
    return `data:font/woff2;base64,${fs.readFileSync(f).toString('base64')}`;
  } catch { return ''; }
}

export interface PdfInput {
  title: string; guide: Guide; sourceUrl?: string | null; channel?: string | null; sample?: boolean;
  durationSec?: number | null; cards: { front: string; back: string }[]; questions: { stem: string; options: string[]; correct: number[]; rationale: string }[];
  date: string;
}

const LOGO = `<svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="9" fill="#0E8579"/><path d="M16 6.5c-3.6 0-6.2 2.7-6.2 6.2 0 2.2 1 3.7 2.2 4.9.7.7 1 1.4 1 2.2V21h6v-1.2c0-.8.3-1.5 1-2.2 1.2-1.2 2.2-2.7 2.2-4.9 0-3.5-2.6-6.2-6.2-6.2Z" fill="#fff"/><rect x="13" y="22.5" width="6" height="2.2" rx="1.1" fill="#A7E8DC"/></svg>`;

export function buildPdfHtml(i: PdfInput): string {
  const g = i.guide;
  const ts = (s?: number) => (s !== undefined && s >= 0 && !i.sample ? `<span class="ts">${fmtTime(s)}</span>` : s !== undefined && s >= 0 ? `<span class="ts">${fmtTime(s)}</span>` : '');
  const plainCloze = (s: string) => s.replace(/\{\{c1::(.+?)(?:::.+?)?\}\}/g, '$1');
  const sections = g.sections.map((s, n) => `
    <section class="sec">
      <h2><span class="num">${n + 1}</span>${esc(s.heading)}${ts(s.start)}</h2>
      <ul>${s.points.map((p) => `<li class="${p.mustKnow ? 'key' : ''}">${esc(p.text)}${ts(p.start)}</li>`).join('')}</ul>
      ${s.terms.length ? `<div class="terms">${s.terms.map((t) => `<span>${esc(t)}</span>`).join('')}</div>` : ''}
    </section>`).join('');
  const answerKey = i.questions.slice(0, 8);
  const L = ['A', 'B', 'C', 'D', 'E', 'F'];
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(i.title)}</title><style>
@font-face{font-family:'PJS';src:url(${font('plus-jakarta-sans', 'plus-jakarta-sans-latin-wght-normal.woff2')}) format('woff2');font-weight:200 800}
@font-face{font-family:'BG';src:url(${font('bricolage-grotesque', 'bricolage-grotesque-latin-wght-normal.woff2')}) format('woff2');font-weight:200 800}
@page{size:Letter;margin:20mm 17mm 22mm}
*{box-sizing:border-box}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:'PJS',system-ui,sans-serif;color:#1c2028;font-size:10.4pt;line-height:1.55;margin:0}
h1,h2,h3{font-family:'BG','PJS',sans-serif;letter-spacing:-.01em;margin:0}
.cover{height:11in;width:8.5in;padding:.9in .85in;background:linear-gradient(160deg,#0e8579 0%,#0a5f57 55%,#134440 100%);color:#fff;position:relative;overflow:hidden;page-break-after:always}
.cover:before{content:"";position:absolute;right:-1.6in;top:-1.6in;width:5in;height:5in;border-radius:50%;background:rgba(255,255,255,.07)}
.cover:after{content:"";position:absolute;left:-1in;bottom:-2in;width:6in;height:6in;border-radius:50%;background:rgba(255,176,32,.14)}
.cover .brand{display:flex;align-items:center;gap:10px;font-family:'BG';font-weight:700;font-size:17pt;position:relative;z-index:1}
.cover .kicker{margin-top:2.1in;text-transform:uppercase;letter-spacing:.18em;font-size:9pt;font-weight:700;color:#a7e8dc;position:relative;z-index:1}
.cover h1{font-size:34pt;line-height:1.08;margin-top:12px;max-width:6.2in;font-weight:700;position:relative;z-index:1}
.cover .meta{margin-top:20px;color:#d3f3ec;font-size:11pt;position:relative;z-index:1}
.cover .stats{position:absolute;left:.85in;right:.85in;bottom:1.1in;display:flex;gap:14px;z-index:1}
.cover .stat{flex:1;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.2);border-radius:14px;padding:12px 14px}
.cover .stat b{display:block;font-family:'BG';font-size:20pt}
.cover .stat span{font-size:8.5pt;color:#d3f3ec;text-transform:uppercase;letter-spacing:.08em}
.badge{display:inline-block;margin-top:16px;padding:4px 12px;border-radius:99px;background:#ffb020;color:#3b2600;font-weight:700;font-size:8.5pt;position:relative;z-index:1;margin-right:6px}
.badge.alt{background:rgba(255,255,255,.18);color:#fff}
.lead{font-size:11.5pt;color:#39424f;border-left:4px solid #16a394;padding:4px 0 4px 14px;margin:0 0 14px}
h2.part{font-size:18pt;margin:22px 0 10px;color:#0f5f57;display:flex;align-items:center;gap:8px}
h2.part:after{content:"";flex:1;height:1px;background:#e1e5e8}
.call{border-radius:14px;padding:12px 16px;margin:12px 0;break-inside:avoid}
.call h3{font-size:11pt;margin-bottom:6px}
.call ul{margin:0;padding-left:18px}.call li{margin:3px 0}
.call.must{background:#fff3e0;border:1px solid #ffd79a}.call.must h3{color:#a64b00}
.call.nurse{background:#e8f6fd;border:1px solid #bfe4f6}.call.nurse h3{color:#0b5d83}
.call.mnem{background:#f1ecff;border:1px solid #d9ccfb}.call.mnem h3{color:#5b2db8}
.call.obj{background:#eaf8f5;border:1px solid #bfe9e1}.call.obj h3{color:#0f5f57}
.sec{margin:16px 0}
h2{break-after:avoid}
.sec li{break-inside:avoid}
.sec h2{font-size:14pt;display:flex;align-items:center;gap:10px;margin-bottom:6px}
.num{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:9px;background:#0e8579;color:#fff;font-size:11pt}
.sec ul{margin:6px 0 0;padding-left:20px}.sec li{margin:5px 0}
li.key{list-style:none;margin-left:-20px;padding:6px 10px 6px 12px;background:#fff8e8;border-left:4px solid #ffb020;border-radius:0 8px 8px 0}
.ts{display:inline-block;margin-left:8px;padding:0 7px;border-radius:99px;background:#eef1f3;color:#5b6675;font-size:8pt;font-weight:600;vertical-align:1px;font-variant-numeric:tabular-nums}
.terms{margin-top:8px;display:flex;flex-wrap:wrap;gap:6px}.terms span{background:#eaf8f5;color:#0f5f57;border-radius:99px;padding:2px 10px;font-size:8.8pt;font-weight:600}
.gloss{width:100%;border-collapse:separate;border-spacing:0 0}
.gloss td{padding:7px 10px;border-bottom:1px solid #edf0f2;vertical-align:top}
.gloss td:first-child{width:28%;font-weight:700;color:#0f5f57}
.gloss tr{break-inside:avoid}
.check{list-style:none;padding:0;margin:0}.check li{padding:5px 0 5px 28px;position:relative}
.check li:before{content:"";position:absolute;left:0;top:8px;width:15px;height:15px;border:2px solid #16a394;border-radius:5px}
.q{break-inside:avoid;margin:12px 0}
.q .stem{font-weight:600}
.q ol{list-style:none;padding-left:0;margin:4px 0}.q li{margin:2px 0 2px 0}.q li b{display:inline-block;width:22px;color:#0e8579}
.key-row{break-inside:avoid;margin:8px 0;font-size:9.6pt}
.key-row b{color:#0e8579}
.note{font-size:8.6pt;color:#6b7482;margin-top:20px;border-top:1px solid #e1e5e8;padding-top:8px}
.cardgrid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.mini{border:1px solid #e1e5e8;border-radius:10px;padding:8px 10px;break-inside:avoid;font-size:9.2pt}.mini b{display:block;color:#0f5f57;margin-bottom:2px}
</style></head><body>
<div class="cover">
  <div class="brand">${LOGO} Penlight</div>
  <div class="kicker">Study guide</div>
  <h1>${esc(i.title)}</h1>
  <div class="meta">${i.channel ? esc(i.channel) + ' · ' : ''}${i.durationSec ? Math.round(i.durationSec / 60) + ' min lecture · ' : ''}${esc(i.date)}</div>
  <div><span class="badge">${g.mode === 'ai' ? 'AI-generated' : 'Lite mode (offline)'}</span>${i.sample ? '<span class="badge alt">Sample content</span>' : ''}</div>
  <div class="stats">
    <div class="stat"><b>${g.sections.length}</b><span>Sections</span></div>
    <div class="stat"><b>${g.glossary.length}</b><span>Key terms</span></div>
    <div class="stat"><b>${i.cards.length}</b><span>Flashcards</span></div>
    <div class="stat"><b>${i.questions.length}</b><span>Practice Qs</span></div>
  </div>
</div>
<div class="body">
  <h2 class="part">Overview</h2>
  <p class="lead">${esc(g.overview)}</p>
  ${g.objectives.length ? `<div class="call obj"><h3>What you should be able to do</h3><ul>${g.objectives.map((o) => `<li>${esc(o)}</li>`).join('')}</ul></div>` : ''}
  ${g.mustKnow.length ? `<div class="call must"><h3>Must-know points</h3><ul>${g.mustKnow.slice(0, 8).map((p) => `<li>${esc(p.text)}${ts(p.start)}</li>`).join('')}</ul></div>` : ''}
  <h2 class="part">Lecture notes</h2>
  ${sections}
  ${g.nursingConsiderations.map((n) => `<div class="call nurse"><h3>Nursing considerations: ${esc(n.title)}</h3><ul>${n.items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>`).join('')}
  ${g.mnemonics.length ? `<div class="call mnem"><h3>Memory aids</h3><ul>${g.mnemonics.map((m) => `<li><b>${esc(m.name)}:</b> ${esc(m.text)}</li>`).join('')}</ul></div>` : ''}
  ${g.glossary.length ? `<h2 class="part">Glossary</h2><table class="gloss">${g.glossary.map((t) => `<tr><td>${esc(t.term)}</td><td>${esc(t.definition)}</td></tr>`).join('')}</table>` : ''}
  ${g.quickReview.length ? `<h2 class="part">Quick review checklist</h2><ul class="check">${g.quickReview.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
  ${i.cards.length ? `<h2 class="part">Flashcard preview</h2><div class="cardgrid">${i.cards.slice(0, 10).map((c) => `<div class="mini"><b>${esc(plainCloze(c.front).slice(0, 140))}</b>${esc(c.back.slice(0, 160))}</div>`).join('')}</div>` : ''}
  ${answerKey.length ? `<h2 class="part">Self-test</h2>${answerKey.map((q, n) => `<div class="q"><div class="stem">${n + 1}. ${esc(q.stem)}${q.correct.length > 1 ? ' <i>(Select all that apply)</i>' : ''}</div><ol>${q.options.map((o, k) => `<li><b>${L[k]}.</b>${esc(o)}</li>`).join('')}</ol></div>`).join('')}
  <h2 class="part">Answer key</h2>${answerKey.map((q, n) => `<div class="key-row"><b>${n + 1}. ${q.correct.map((c) => L[c]).join(', ')}</b> — ${esc(q.rationale)}</div>`).join('')}` : ''}
  <div class="note">Penlight is a study aid, not medical advice or a substitute for your course materials, instructors, or clinical policies. ${g.mode === 'lite' ? 'This guide was generated offline in Lite mode by extracting and ranking sentences from the transcript, so review it against your own notes.' : 'AI-generated content can contain errors. Verify clinical facts with your textbook and instructor.'}${i.sourceUrl ? ' Source: ' + esc(i.sourceUrl) : ''}</div>
</div></body></html>`;
}

declare global { var __pwBrowser: import('playwright').Browser | undefined; var __pdfQueue: Promise<unknown> | undefined }

/** PDF_LOW_MEMORY=1 (set on small free hosts): one PDF at a time, a fresh Chromium per PDF that is closed afterwards. */
const LOW_MEM = process.env.PDF_LOW_MEMORY === '1';
const CHROME_ARGS = ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--disable-extensions', '--mute-audio'];

export function renderPdf(html: string, title: string): Promise<Buffer> {
  if (!LOW_MEM) return renderPdfInner(html, title);
  const run = (globalThis.__pdfQueue ?? Promise.resolve()).catch(() => undefined).then(() => renderPdfInner(html, title));
  globalThis.__pdfQueue = run;
  return run;
}

/** Cover is rendered separately (full bleed, no footer); the body gets "Page X of N" numbering. */
async function renderPdfInner(html: string, title: string): Promise<Buffer> {
  const { chromium } = await import('playwright');
  const { PDFDocument } = await import('pdf-lib');
  if (!globalThis.__pwBrowser || !globalThis.__pwBrowser.isConnected()) globalThis.__pwBrowser = await chromium.launch({ args: CHROME_ARGS });
  const coverM = html.match(/<div class="cover">[\s\S]*?<\/div>\s*<div class="body">/);
  const coverHtml = html.replace(/<div class="body">[\s\S]*$/, '</body></html>').replace('@page{size:Letter;margin:20mm 17mm 22mm}', '@page{size:Letter;margin:0}');
  const bodyHtml = html.replace(/<div class="cover">[\s\S]*?<\/div>\s*<div class="body">/, '<div class="body">');
  void coverM;
  const render = async (h: string, footer: boolean) => {
    const ctx = await globalThis.__pwBrowser!.newContext();
    try {
      const page = await ctx.newPage();
      await page.setContent(h, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      const f = `<div style="width:100%;font-family:Helvetica,Arial,sans-serif;font-size:8px;color:#6b7482;padding:0 17mm;display:flex;justify-content:space-between;-webkit-print-color-adjust:exact"><span>Penlight · ${esc(title).slice(0, 70)}</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`;
      return Buffer.from(await page.pdf({ format: 'Letter', printBackground: true, preferCSSPageSize: true, displayHeaderFooter: footer, headerTemplate: '<div></div>', footerTemplate: footer ? f : '<div></div>' }));
    } finally { await ctx.close(); }
  };
  let cover: Buffer, body: Buffer;
  try {
    if (LOW_MEM) { cover = await render(coverHtml, false); body = await render(bodyHtml, true); }
    else [cover, body] = await Promise.all([render(coverHtml, false), render(bodyHtml, true)]);
  } finally {
    if (LOW_MEM) { const b = globalThis.__pwBrowser; globalThis.__pwBrowser = undefined; await b?.close().catch(() => undefined); }
  }
  const out = await PDFDocument.create();
  for (const buf of [cover, body]) {
    const doc = await PDFDocument.load(buf);
    const pages = await out.copyPages(doc, doc.getPageIndices());
    pages.forEach((pg) => out.addPage(pg));
  }
  out.setTitle(title); out.setAuthor('Penlight'); out.setProducer('Penlight');
  return Buffer.from(await out.save());
}
