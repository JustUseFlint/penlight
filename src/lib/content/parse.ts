export interface ParsedQuestion {
  bank: string; exam: string; topic: string; tag: string;
  type: 'mcq' | 'sata';
  stem: string; options: string[]; correct: number[]; rationale: string;
}
export interface ParsedCard { deck: string; deckTitle: string; category: string; topic: string; tag: string; type: 'term' | 'cloze'; front: string; back: string }
export interface ParsedLesson { id: string; title: string; category: string; minutes: number; body: string }

type Draft = { bank: string; exam: string; topic: string; tag: string; stem: string; rationale: string; opts: { t: string; ok: boolean }[] };

export function parseQuestions(src: string, file = 'questions'): ParsedQuestion[] {
  const out: ParsedQuestion[] = [];
  const st = { bank: '', exam: '', topic: '', tag: '' };
  let cur: Draft | null = null;
  const flush = (line: number) => {
    if (!cur) return;
    const ok = cur.opts.filter((o) => o.ok).length;
    if (!cur.stem || cur.opts.length < 4 || !ok || !cur.rationale) throw new Error(`${file}:${line}: incomplete question "${cur.stem.slice(0, 50)}"`);
    out.push({ bank: cur.bank, exam: cur.exam, topic: cur.topic, tag: cur.tag, type: ok > 1 ? 'sata' : 'mcq', stem: cur.stem, options: cur.opts.map((o) => o.t), correct: cur.opts.map((o, i) => (o.ok ? i : -1)).filter((i) => i >= 0), rationale: cur.rationale });
    cur = null;
  };
  const lines = src.split('\n');
  lines.forEach((raw, i) => {
    const line = raw.trimEnd();
    if (!line.trim()) return;
    const dir = line.match(/^@(\w+)\s+(.*)$/);
    if (dir) { flush(i); (st as Record<string, string>)[dir[1]] = dir[2].trim(); return; }
    if (line.startsWith('Q: ')) { flush(i); cur = { ...st, stem: line.slice(3).trim(), rationale: '', opts: [] }; return; }
    if (!cur) throw new Error(`${file}:${i + 1}: unexpected line`);
    if (line.startsWith('+ ')) cur.opts.push({ t: line.slice(2).trim(), ok: true });
    else if (line.startsWith('- ')) cur.opts.push({ t: line.slice(2).trim(), ok: false });
    else if (line.startsWith('R: ')) cur.rationale = line.slice(3).trim();
    else cur.stem += ' ' + line.trim();
  });
  flush(lines.length);
  return out;
}

export function parseCards(src: string): ParsedCard[] {
  const out: ParsedCard[] = [];
  let deck = '', deckTitle = '', category = '', topic = '', tag = '';
  for (const raw of src.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('@deck ')) { [deck, deckTitle, category] = line.slice(6).split('|').map((s) => s.trim()); continue; }
    if (line.startsWith('@topic ')) { topic = line.slice(7).trim(); continue; }
    if (line.startsWith('@tag ')) { tag = line.slice(5).trim(); continue; }
    if (/\{\{c1::.+?\}\}/.test(line) && !line.includes(' => ')) { out.push({ deck, deckTitle, category, topic, tag, type: 'cloze', front: line, back: '' }); continue; }
    const i = line.indexOf(' => ');
    if (i < 0) throw new Error(`Bad card line: ${line}`);
    out.push({ deck, deckTitle, category, topic, tag, type: 'term', front: line.slice(0, i).trim(), back: line.slice(i + 4).trim() });
  }
  return out;
}

export function parseLessons(src: string): ParsedLesson[] {
  const out: ParsedLesson[] = [];
  let cur: ParsedLesson | null = null;
  for (const raw of src.split('\n')) {
    if (raw.startsWith('@lesson ')) {
      if (cur) out.push({ ...cur, body: cur.body.trim() });
      const [id, title, category, minutes] = raw.slice(8).split('|').map((s) => s.trim());
      cur = { id, title, category, minutes: Number(minutes) || 5, body: '' };
    } else if (cur) cur.body += raw + '\n';
  }
  if (cur) out.push({ ...cur, body: cur.body.trim() });
  return out;
}
