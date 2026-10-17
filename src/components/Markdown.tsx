import type { ReactNode } from 'react';

function inline(s: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g;
  let last = 0, m: RegExpExecArray | null, k = 0;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    if (m[2]) out.push(<strong key={k++}>{m[2]}</strong>);
    else if (m[3]) out.push(<em key={k++}>{m[3]}</em>);
    else if (m[4]) out.push(<code key={k++} className="rounded bg-line/70 px-1.5 py-0.5 text-[0.92em]">{m[4]}</code>);
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}

/** Tiny markdown subset for the authored lessons: ## headings, - lists, > callouts, **bold**, *italic*. */
export function Markdown({ source }: { source: string }) {
  const blocks: ReactNode[] = [];
  const lines = source.split('\n');
  let i = 0, key = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    if (l.startsWith('## ')) { blocks.push(<h2 key={key++}>{inline(l.slice(3))}</h2>); i++; continue; }
    if (l.startsWith('> ')) {
      const q: string[] = [];
      while (i < lines.length && lines[i].startsWith('> ')) q.push(lines[i++].slice(2));
      blocks.push(<blockquote key={key++}><span className="font-bold text-sun-600">★ </span>{inline(q.join(' '))}</blockquote>); continue;
    }
    if (/^[-*] /.test(l)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*] /.test(lines[i])) items.push(lines[i++].slice(2));
      blocks.push(<ul key={key++}>{items.map((t, j) => <li key={j}>{inline(t)}</li>)}</ul>); continue;
    }
    const p: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(## |> |[-*] )/.test(lines[i])) p.push(lines[i++]);
    blocks.push(<p key={key++}>{inline(p.join(' '))}</p>);
  }
  return <div className="prose-lesson">{blocks}</div>;
}
