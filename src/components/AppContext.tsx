'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '@/lib/client';
import { fireConfetti } from './confetti';

export interface Me {
  user: { id: string; email: string | null; name: string; isGuest: boolean; targetExam: string; examDate: string | null; weeklyGoalMin: number; theme: string };
  llm: { configured: boolean; mode: string; provider: string | null; model: string | null; baseUrl: string | null; source: string | null; keyHint: string | null };
  due: { due: number; newReady: number };
  timeTravel: boolean;
}
export interface Summary { xp: { level: number; xp: number; floor: number; next: number; pct: number }; streak: { current: number; longest: number; activeToday: boolean } }
interface Ctx {
  me: Me | null; summary: Summary | null; refresh: () => Promise<void>;
  toast: (t: { title: string; body?: string; kind?: 'success' | 'info' | 'achievement' | 'error' }) => void;
  theme: 'light' | 'dark'; setTheme: (t: 'light' | 'dark') => void;
  achievements: (keys: string[]) => void;
}
const C = createContext<Ctx>(null as unknown as Ctx);
export const useApp = () => useContext(C);

const ACH_TITLES: Record<string, string> = { first_set: 'First Study Set', first_review: 'Card Shark', cards_50: 'Deck Builder', first_test: 'Test Taker', perfect_test: 'Flawless', q_100: 'Century', streak_3: 'On a Roll', streak_7: 'Week Warrior', all_games: 'Game Night', program_day: 'Day One Done', dosage_10: 'Math Whiz', level_5: 'Level 5' };

export function AppProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [toasts, setToasts] = useState<{ id: number; title: string; body?: string; kind: string }[]>([]);
  const [theme, setThemeState] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    try { document.cookie = `penlight_tz=${Intl.DateTimeFormat().resolvedOptions().timeZone}; path=/; max-age=31536000; samesite=lax`; } catch { /* ignore */ }
    const t = (localStorage.getItem('penlight_theme') as 'light' | 'dark' | null) || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    setThemeState(t);
  }, []);
  const refresh = useCallback(async () => {
    try {
      const [m, d] = await Promise.all([api<Me>('/api/me'), api<Summary>('/api/dashboard')]);
      setMe(m); setSummary({ xp: d.xp, streak: d.streak });
    } catch { /* ignore */ }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const toast = useCallback<Ctx['toast']>((t) => {
    const id = Date.now() + Math.random();
    setToasts((x) => [...x.slice(-2), { id, title: t.title, body: t.body, kind: t.kind || 'info' }]);
    setTimeout(() => setToasts((x) => x.filter((y) => y.id !== id)), 5200);
  }, []);
  const achievements = useCallback((keys: string[]) => { keys.forEach((k, i) => setTimeout(() => toast({ title: `Achievement unlocked: ${ACH_TITLES[k] || k}`, kind: 'achievement' }), i * 600)); if (keys.length) fireConfetti(0.6); }, [toast]);
  const setTheme = useCallback((t: 'light' | 'dark') => {
    setThemeState(t); localStorage.setItem('penlight_theme', t); document.documentElement.dataset.theme = t;
    api('/api/me', { method: 'PATCH', body: { theme: t } }).catch(() => {});
  }, []);
  const value = useMemo(() => ({ me, summary, refresh, toast, theme, setTheme, achievements }), [me, summary, refresh, toast, theme, setTheme, achievements]);
  return (
    <C.Provider value={value}>
      {children}
      <div className="fixed z-[70] left-1/2 -translate-x-1/2 bottom-24 md:bottom-8 flex flex-col gap-2 w-[min(92vw,380px)]" aria-live="polite" role="status">
        {toasts.map((t) => (
          <div key={t.id} className={`animate-pop rounded-2xl px-4 py-3 shadow-pop border text-sm font-semibold ${t.kind === 'achievement' ? 'bg-sun-50 border-sun-500/40 text-ink' : t.kind === 'error' ? 'bg-danger-50 border-danger-500/40 text-danger-600' : 'bg-surface border-line text-ink'}`}>
            {t.kind === 'achievement' && <span aria-hidden className="mr-1.5">🏆</span>}{t.title}{t.body && <div className="font-normal text-muted mt-0.5">{t.body}</div>}
          </div>
        ))}
      </div>
    </C.Provider>
  );
}
