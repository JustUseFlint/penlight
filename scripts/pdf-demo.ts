import fs from 'node:fs';
import { loadSample } from '../src/lib/ingest/samples';
import { buildLite } from '../src/lib/lite/engine';
import { buildPdfHtml, renderPdf } from '../src/lib/pdf';
const slug = process.argv[2] || 'cardiac-conduction';
const s = loadSample(slug);
const out = buildLite(s.segments, { title: s.sample.title, durationSec: s.durationSec, seed: slug });
const html = buildPdfHtml({ title: s.sample.title, guide: out.guide, channel: s.sample.channel, sample: true, durationSec: s.durationSec, cards: out.cards, questions: out.questions, date: 'October 17, 2026' });
renderPdf(html, s.sample.title).then((b) => { fs.mkdirSync('/tmp/pdf', { recursive: true }); fs.writeFileSync(`/tmp/pdf/${slug}.pdf`, b); console.log('bytes', b.length); process.exit(0); });
