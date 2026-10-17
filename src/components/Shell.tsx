'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { BarChart3, BookOpen, Flame, Gamepad2, Home, Library, ListChecks, Map, Menu, Moon, Settings, Sun, X, Zap } from 'lucide-react';
import { useApp } from './AppContext';
import { Logo } from './ui';
import { cx } from '@/lib/client';

const NAV = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/library', label: 'Library', icon: Library },
  { href: '/programs', label: 'Programs', icon: Map },
  { href: '/practice', label: 'Practice', icon: ListChecks },
  { href: '/games', label: 'Games', icon: Gamepad2 },
  { href: '/progress', label: 'Progress', icon: BarChart3 },
  { href: '/settings', label: 'Settings', icon: Settings },
];
const MOBILE = ['/', '/library', '/programs', '/practice'];

function Chips() {
  const { summary, me } = useApp();
  return (
    <div className="flex items-center gap-2">
      <Link href="/progress" aria-label={`${summary?.streak.current ?? 0} day streak`} className={cx('inline-flex items-center gap-1.5 h-9 px-3 rounded-full font-bold text-sm tnum border', summary?.streak.activeToday ? 'bg-coral-50 border-coral-500/30 text-coral-600' : 'bg-surface border-line text-muted')}>
        <Flame size={16} aria-hidden /> {summary?.streak.current ?? 0}
      </Link>
      <Link href="/progress" aria-label={`Level ${summary?.xp.level ?? 1}, ${summary?.xp.xp ?? 0} XP`} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full font-bold text-sm tnum bg-sun-50 border border-sun-500/30 text-sun-600">
        <Zap size={16} aria-hidden /> {summary?.xp.xp ?? 0} <span className="hidden sm:inline text-xs font-semibold">Lv {summary?.xp.level ?? 1}</span>
      </Link>
      {me?.user.isGuest === false && <span className="hidden md:inline text-sm font-semibold text-muted ml-1 max-w-[120px] truncate">{me.user.name}</span>}
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { me, theme, setTheme } = useApp();
  const [more, setMore] = useState(false);
  const active = (href: string) => (href === '/' ? path === '/' : path.startsWith(href));
  const due = me?.due.due ?? 0;
  const bare = path.startsWith('/login') || path.startsWith('/signup');

  return (
    <div className="min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:bg-surface focus:px-4 focus:py-2 focus:rounded-lg focus:shadow-pop">Skip to content</a>
      {/* desktop sidebar */}
      <aside className="hidden md:flex fixed inset-y-0 left-0 w-64 flex-col border-r border-line bg-surface/80 backdrop-blur px-4 py-6 z-30" aria-label="Primary">
        <Link href="/" className="flex items-center gap-3 px-2 mb-8 font-display font-extrabold text-2xl tracking-tight"><Logo size={36} /> Penlight</Link>
        <nav className="flex flex-col gap-1">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} aria-current={active(href) ? 'page' : undefined}
              className={cx('flex items-center gap-3 h-12 px-3.5 rounded-xl font-semibold text-[15px] transition', active(href) ? 'bg-brand-50 text-brand-700 shadow-[inset_3px_0_0_rgb(var(--brand-600))]' : 'text-muted hover:text-ink hover:bg-brand-50/60')}>
              <Icon size={20} aria-hidden /> {label}
              {href === '/practice' ? null : label === 'Library' && due > 0 ? <span className="ml-auto text-xs bg-coral-500 text-white rounded-full px-2 h-5 inline-flex items-center tnum" aria-label={`${due} cards due`}>{due}</span> : null}
            </Link>
          ))}
        </nav>
        <div className="mt-auto space-y-3">
          <div className="rounded-2xl bg-brand-50 p-4">
            <div className="flex items-center gap-2 text-brand-700 font-bold text-sm"><BookOpen size={16} aria-hidden /> Daily goal</div>
            <p className="text-sm text-muted mt-1">A few cards and one question set keeps your streak alive.</p>
          </div>
          <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="flex w-full items-center gap-3 h-11 px-3.5 rounded-xl text-muted hover:text-ink hover:bg-brand-50/60 font-semibold text-sm" aria-label="Toggle dark mode">
            {theme === 'dark' ? <Sun size={18} aria-hidden /> : <Moon size={18} aria-hidden />} {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
        </div>
      </aside>

      {/* top bar */}
      {!bare && (
        <header className="sticky top-0 z-20 md:ml-64 h-16 px-4 md:px-10 flex items-center justify-between bg-bg/85 backdrop-blur border-b border-line/60">
          <Link href="/" className="md:hidden flex items-center gap-2 font-display font-extrabold text-xl"><Logo size={30} /> Penlight</Link>
          <div className="hidden md:block" />
          <Chips />
        </header>
      )}

      <main id="main" className={cx('md:ml-64 px-4 md:px-10 pb-28 md:pb-16', bare ? 'pt-6' : 'pt-6 md:pt-8')}>
        <div className="mx-auto max-w-[1120px]">{children}</div>
      </main>

      {/* mobile tab bar */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-surface/95 backdrop-blur border-t border-line pb-[env(safe-area-inset-bottom)]" aria-label="Primary mobile">
        <ul className="grid grid-cols-5">
          {NAV.filter((n) => MOBILE.includes(n.href)).map(({ href, label, icon: Icon }) => (
            <li key={href}>
              <Link href={href} aria-current={active(href) ? 'page' : undefined} className={cx('flex flex-col items-center justify-center gap-0.5 h-16 text-[11px] font-bold', active(href) ? 'text-brand-700' : 'text-muted')}>
                <span className={cx('h-8 w-12 rounded-full flex items-center justify-center transition', active(href) && 'bg-brand-100')}><Icon size={20} aria-hidden /></span>{label}
              </Link>
            </li>
          ))}
          <li>
            <button onClick={() => setMore(true)} aria-haspopup="dialog" className={cx('w-full flex flex-col items-center justify-center gap-0.5 h-16 text-[11px] font-bold', ['/games', '/progress', '/settings'].some(active) ? 'text-brand-700' : 'text-muted')}>
              <span className={cx('h-8 w-12 rounded-full flex items-center justify-center', ['/games', '/progress', '/settings'].some(active) && 'bg-brand-100')}><Menu size={20} aria-hidden /></span>More
            </button>
          </li>
        </ul>
      </nav>
      {more && (
        <div className="md:hidden fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="More">
          <button className="absolute inset-0 bg-ink/40" onClick={() => setMore(false)} aria-label="Close menu" />
          <div className="absolute bottom-0 inset-x-0 rounded-t-3xl bg-surface p-5 pb-8 animate-rise">
            <div className="flex items-center justify-between mb-3"><span className="font-display font-bold text-lg">More</span><button onClick={() => setMore(false)} className="h-10 w-10 grid place-items-center rounded-full hover:bg-line/60" aria-label="Close"><X size={20} /></button></div>
            <div className="grid grid-cols-3 gap-3">
              {NAV.filter((n) => ['/games', '/progress', '/settings'].includes(n.href)).map(({ href, label, icon: Icon }) => (
                <Link key={href} href={href} onClick={() => setMore(false)} className="card flex flex-col items-center gap-2 py-4 font-semibold text-sm"><Icon size={22} className="text-brand-600" aria-hidden />{label}</Link>
              ))}
            </div>
            <button onClick={() => { setTheme(theme === 'dark' ? 'light' : 'dark'); setMore(false); }} className="btn btn-secondary w-full mt-4">{theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />} {theme === 'dark' ? 'Light mode' : 'Dark mode'}</button>
          </div>
        </div>
      )}
    </div>
  );
}
