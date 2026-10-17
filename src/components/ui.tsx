'use client';
import Link from 'next/link';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from '@/lib/client';

export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="rgb(var(--brand-600))" />
      <path d="M16 6.5c-3.6 0-6.2 2.7-6.2 6.2 0 2.2 1 3.7 2.2 4.9.7.7 1 1.4 1 2.2V21h6v-1.2c0-.8.3-1.5 1-2.2 1.2-1.2 2.2-2.7 2.2-4.9 0-3.5-2.6-6.2-6.2-6.2Z" fill="#fff" />
      <rect x="13" y="22.5" width="6" height="2.2" rx="1.1" fill="#A7E8DC" />
    </svg>
  );
}

export function Skeleton({ className }: { className?: string }) { return <div className={cx('skeleton', className)} aria-hidden="true" />; }
export function SkeletonCards({ n = 3, h = 'h-32' }: { n?: number; h?: string }) {
  return <div className="grid gap-4 md:grid-cols-3" role="status" aria-label="Loading">{Array.from({ length: n }, (_, i) => <Skeleton key={i} className={h} />)}</div>;
}

export function Progress({ value, className, tone = 'brand', label }: { value: number; className?: string; tone?: 'brand' | 'coral' | 'sun' | 'sky' | 'grape'; label?: string }) {
  const bar = { brand: 'bg-brand-500', coral: 'bg-coral-500', sun: 'bg-sun-500', sky: 'bg-sky-500', grape: 'bg-grape-500' }[tone];
  return (
    <div className={cx('h-2.5 rounded-full bg-line/80 overflow-hidden', className)} role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100} aria-label={label || 'Progress'}>
      <div className={cx('h-full rounded-full transition-all duration-700 ease-out', bar)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function Badge({ children, tone = 'brand', className }: { children: ReactNode; tone?: 'brand' | 'coral' | 'sun' | 'sky' | 'grape' | 'gray'; className?: string }) {
  const t = { brand: 'bg-brand-50 text-brand-700', coral: 'bg-coral-50 text-coral-600', sun: 'bg-sun-50 text-sun-600', sky: 'bg-sky-50 text-sky-600', grape: 'bg-grape-50 text-grape-600', gray: 'bg-line/60 text-muted' }[tone];
  return <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 h-6 text-xs font-bold whitespace-nowrap', t, className)}>{children}</span>;
}

/** Clear Lite vs AI labelling used wherever generated content appears. */
export function ModeBadge({ mode }: { mode: string | null | undefined }) {
  if (mode === 'ai') return <Badge tone="grape" className="!h-6" ><span aria-hidden>✨</span> AI-generated</Badge>;
  return <Badge tone="sky"><span aria-hidden>⚡</span> Lite (offline)</Badge>;
}

export function ButtonLink({ href, children, variant = 'primary', size, className, ...rest }: { href: string; children: ReactNode; variant?: 'primary' | 'secondary' | 'ghost' | 'coral'; size?: 'sm' | 'lg'; className?: string } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>) {
  return <Link href={href} className={cx('btn', `btn-${variant}`, size && `btn-${size}`, className)} {...rest}>{children}</Link>;
}
export function Button({ variant = 'primary', size, className, loading, children, ...rest }: { variant?: 'primary' | 'secondary' | 'ghost' | 'coral'; size?: 'sm' | 'lg'; loading?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={cx('btn', `btn-${variant}`, size && `btn-${size}`, className)} {...rest} disabled={rest.disabled || loading}>
      {loading && <span className="h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function PageHeader({ title, subtitle, actions, eyebrow }: { title: string; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: string }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 mb-6 md:mb-8">
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-1.5">{eyebrow}</div>}
        <h1 className="text-[28px] md:text-4xl font-extrabold leading-tight">{title}</h1>
        {subtitle && <p className="text-muted mt-1.5 max-w-2xl text-[15px] md:text-base">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function EmptyState({ title, body, action, art }: { title: string; body: string; action?: ReactNode; art?: ReactNode }) {
  return (
    <div className="card p-8 md:p-12 text-center flex flex-col items-center">
      {art}
      <h3 className="text-xl font-bold mt-3">{title}</h3>
      <p className="text-muted mt-1.5 max-w-md">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorBox({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div role="alert" className="rounded-2xl border border-danger-500/30 bg-danger-50 text-danger-600 px-4 py-3 text-sm font-medium flex items-center justify-between gap-3">
      <span>{message}</span>{retry && <button className="underline font-bold" onClick={retry}>Retry</button>}
    </div>
  );
}

export function Disclaimer({ className }: { className?: string }) {
  return (
    <p className={cx('text-xs text-muted leading-relaxed', className)}>
      <strong className="text-ink">Study aid only.</strong> Penlight is not medical advice and does not replace your textbooks, instructors, or facility policies. Practice questions are original, are not affiliated with or endorsed by ATI, NCSBN, or any testing organization, and readiness scores are estimates, not predictions of exam results.
    </p>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: string }) {
  return (
    <div className="card p-4 md:p-5">
      <div className="eyebrow">{label}</div>
      <div className={cx('mt-1 text-3xl font-extrabold font-display tnum', tone)}>{value}</div>
      {sub && <div className="text-sm text-muted mt-0.5">{sub}</div>}
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange, label }: { tabs: { id: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-1 overflow-x-auto no-scrollbar border-b border-line -mx-1 px-1">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} id={`tab-${t.id}`} onClick={() => onChange(t.id)}
          className={cx('relative px-4 h-12 font-semibold text-[15px] whitespace-nowrap transition', value === t.id ? 'text-brand-700' : 'text-muted hover:text-ink')}>
          {t.label}{t.count !== undefined && <span className="ml-1.5 text-xs text-faint tnum">{t.count}</span>}
          {value === t.id && <span className="absolute left-3 right-3 -bottom-px h-[3px] rounded-t bg-brand-600" />}
        </button>
      ))}
    </div>
  );
}
