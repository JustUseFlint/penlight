'use client';
import { useId } from 'react';

export function Ring({ value, size = 96, stroke = 10, tone = 'brand-500', children, label }: { value: number; size?: number; stroke?: number; tone?: string; children?: React.ReactNode; label?: string }) {
  const r = (size - stroke) / 2, C = 2 * Math.PI * r, v = Math.max(0, Math.min(100, value));
  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }} role="img" aria-label={label ?? `${Math.round(v)} percent`}>
      <svg width={size} height={size} className="-rotate-90"><circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(var(--line))" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`rgb(var(--${tone}))`} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C - (C * v) / 100} style={{ transition: 'stroke-dashoffset .9s cubic-bezier(.3,.8,.3,1)' }} /></svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}

/** Semi-circle readiness gauge, 0 to 100, with colored zones. */
export function Gauge({ value, label, band }: { value: number | null; label: string; band: string }) {
  const id = useId();
  const w = 220, h = 124, cx = 110, cy = 112, r = 90;
  const pt = (p: number) => { const a = Math.PI * (1 - p / 100); return [cx + r * Math.cos(a), cy - r * Math.sin(a)]; };
  const arc = (a: number, b: number) => { const [x1, y1] = pt(a), [x2, y2] = pt(b); return `M${x1} ${y1} A${r} ${r} 0 0 1 ${x2} ${y2}`; };
  const v = value ?? 0;
  const [nx, ny] = pt(v);
  const color = v >= 82 ? 'brand-500' : v >= 70 ? 'sky-500' : v >= 55 ? 'sun-500' : 'coral-500';
  return (
    <figure className="text-center" aria-label={value === null ? `${label}: not enough data` : `${label} readiness estimate ${value} percent, ${band}`}>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full max-w-[260px] mx-auto">
        <defs><linearGradient id={id} x1="0" x2="1"><stop offset="0" stopColor="rgb(var(--coral-500))" /><stop offset=".5" stopColor="rgb(var(--sun-500))" /><stop offset="1" stopColor="rgb(var(--brand-500))" /></linearGradient></defs>
        <path d={arc(0, 100)} stroke="rgb(var(--line))" strokeWidth="16" fill="none" strokeLinecap="round" />
        {value !== null && <path d={arc(0, Math.max(1, v))} stroke={`url(#${id})`} strokeWidth="16" fill="none" strokeLinecap="round" style={{ transition: 'all .8s' }} />}
        {value !== null && <circle cx={nx} cy={ny} r="9" fill="rgb(var(--surface))" stroke={`rgb(var(--${color}))`} strokeWidth="5" />}
        <text x={cx} y={cy - 18} textAnchor="middle" className="fill-ink font-display" style={{ fontSize: 36, fontWeight: 800 }}>{value === null ? '—' : `${value}%`}</text>
      </svg>
      <figcaption className="-mt-1"><div className="font-bold">{label}</div><div className="text-sm text-muted">{value === null ? 'Not enough data yet' : band}</div></figcaption>
    </figure>
  );
}

export function TrendChart({ points }: { points: { pct: number; title: string; ts: number }[] }) {
  const w = 560, h = 190, px = 34, py = 18;
  if (points.length === 0) return null;
  const n = points.length;
  const x = (i: number) => (n === 1 ? w / 2 : px + (i * (w - px * 2)) / (n - 1));
  const y = (p: number) => py + ((100 - p) * (h - py * 2)) / 100;
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i)} ${y(p.pct)}`).join(' ');
  const area = `${d} L${x(n - 1)} ${h - py} L${x(0)} ${h - py} Z`;
  const gid = useId();
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label={`Test score trend: ${points.map((p) => p.pct + '%').join(', ')}`}>
      <defs><linearGradient id={gid} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="rgb(var(--brand-500))" stopOpacity=".28" /><stop offset="1" stopColor="rgb(var(--brand-500))" stopOpacity="0" /></linearGradient></defs>
      {[0, 25, 50, 75, 100].map((g) => (<g key={g}><line x1={px} x2={w - px} y1={y(g)} y2={y(g)} stroke="rgb(var(--line))" strokeDasharray={g === 0 ? undefined : '3 5'} /><text x={px - 8} y={y(g) + 4} textAnchor="end" className="fill-faint" style={{ fontSize: 10 }}>{g}</text></g>))}
      <line x1={px} x2={w - px} y1={y(70)} y2={y(70)} stroke="rgb(var(--sun-500))" strokeOpacity=".6" strokeWidth="1.500" />
      {n > 1 && <path d={area} fill={`url(#${gid})`} />}
      {n > 1 && <path d={d} fill="none" stroke="rgb(var(--brand-600))" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />}
      {points.map((p, i) => (<g key={i}><circle cx={x(i)} cy={y(p.pct)} r="5.500" fill="rgb(var(--surface))" stroke="rgb(var(--brand-600))" strokeWidth="3"><title>{`${p.title}: ${p.pct}%`}</title></circle></g>))}
    </svg>
  );
}

export function Heatmap({ data, weeks = 18 }: { data: Record<string, number>; weeks?: number }) {
  const today = new Date(); today.setHours(12, 0, 0, 0);
  const cells: { key: string; v: number; date: Date }[] = [];
  const dow = (today.getDay() + 6) % 7;
  const start = new Date(today); start.setDate(today.getDate() - dow - (weeks - 1) * 7);
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    const key = new Intl.DateTimeFormat('en-CA').format(d);
    cells.push({ key, v: data[key] || 0, date: d });
  }
  const level = (v: number) => (v <= 0 ? 0 : v < 20 ? 1 : v < 60 ? 2 : v < 120 ? 3 : 4);
  const fill = ['rgb(var(--line))', 'rgb(var(--brand-200))', 'rgb(var(--brand-300))', 'rgb(var(--brand-500))', 'rgb(var(--brand-700))'];
  const total = Object.values(data).filter((v) => v > 0).length;
  return (
    <div>
      <div className="overflow-x-auto no-scrollbar pb-1">
        <svg width={weeks * 16} height={7 * 16} role="img" aria-label={`Study heatmap for the last ${weeks} weeks: ${total} active days`} className="block">
          {cells.map((c, i) => (c.date > today ? null : <rect key={c.key} x={Math.floor(i / 7) * 16} y={(i % 7) * 16} width="12" height="12" rx="3.500" fill={fill[level(c.v)]}><title>{`${c.key}: ${c.v} XP`}</title></rect>))}
        </svg>
      </div>
      <div className="flex items-center gap-1.5 text-xs text-muted mt-2">Less {fill.map((f, i) => <span key={i} className="h-3 w-3 rounded-[4px]" style={{ background: f }} />)} More</div>
    </div>
  );
}
