'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, KeyRound, LogOut, Moon, Plug, Sparkles, Sun, Trash2, Zap } from 'lucide-react';
import { api, useApi } from '@/lib/client';
import { Badge, Button, ButtonLink, ErrorBox, ModeBadge, PageHeader, Skeleton } from '@/components/ui';
import { useApp } from '@/components/AppContext';

interface LlmStatus { configured: boolean; mode: string; provider: string | null; model: string | null; baseUrl: string | null; source: string | null; keyHint: string | null }
interface Prov { id: string; label: string; baseUrl: string; model: string }

export default function SettingsPage() {
  const { me, refresh, toast, theme, setTheme } = useApp();
  const llm = useApi<{ status: LlmStatus; providers: Prov[] }>('/api/settings/llm');
  const [provider, setProvider] = useState('xai');
  const [key, setKey] = useState('');
  const [model, setModel] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [testMsg, setTestMsg] = useState<{ ok: boolean; message: string } | null>(null);
  const [name, setName] = useState('');
  const [goal, setGoal] = useState(150);
  const [exam, setExam] = useState('both');
  const [examDate, setExamDate] = useState('');
  const [sim, setSim] = useState(0);

  useEffect(() => { const s = llm.data?.status; if (s) { setProvider(s.provider || 'xai'); setModel(s.model || ''); setBaseUrl(s.provider === 'custom' ? s.baseUrl || '' : ''); } }, [llm.data]);
  useEffect(() => { if (me) { setName(me.user.name); setGoal(me.user.weeklyGoalMin); setExam(me.user.targetExam); setExamDate(me.user.examDate || ''); } }, [me]);
  const prov = llm.data?.providers.find((p) => p.id === provider);
  const st = llm.data?.status;

  async function saveLlm() {
    setBusy('save'); setTestMsg(null);
    try { await api('/api/settings/llm', { method: 'PUT', body: { provider, apiKey: key || undefined, model: model || undefined, baseUrl: provider === 'custom' || baseUrl ? baseUrl : undefined } }); setKey(''); await llm.reload(); refresh(); toast({ title: 'AI settings saved', kind: 'success' }); }
    catch (e) { toast({ title: (e as Error).message, kind: 'error' }); } finally { setBusy(null); }
  }
  async function test() {
    setBusy('test'); setTestMsg(null);
    try { setTestMsg(await api('/api/settings/llm/test', { method: 'POST', body: {} })); } catch (e) { setTestMsg({ ok: false, message: (e as Error).message }); } finally { setBusy(null); }
  }
  async function remove() {
    if (!confirm('Remove the saved API key? Penlight will switch back to Lite mode.')) return;
    await api('/api/settings/llm', { method: 'DELETE' }); await llm.reload(); refresh(); setTestMsg(null);
  }
  async function setMode(mode: 'auto' | 'lite') { await api('/api/settings/mode', { method: 'PUT', body: { mode } }); await llm.reload(); refresh(); }
  async function saveProfile() {
    setBusy('profile');
    try { await api('/api/me', { method: 'PATCH', body: { name, weeklyGoalMin: goal, targetExam: exam, examDate: examDate || null } }); await refresh(); toast({ title: 'Profile saved', kind: 'success' }); } finally { setBusy(null); }
  }
  async function logout() { await api('/api/auth/logout', { method: 'POST', body: {} }); location.href = '/'; }
  async function travel(days: number) { setSim(days); await api('/api/dev/time', { body: { days } }); refresh(); }

  return (
    <div className="max-w-3xl space-y-8">
      <PageHeader title="Settings" />
      {/* account */}
      <section className="card p-6" aria-labelledby="acct">
        <h2 id="acct" className="font-display text-xl font-extrabold mb-1">Profile & account</h2>
        {!me ? <Skeleton className="h-40" /> : (
          <>
            {me.user.isGuest ? (
              <div className="rounded-2xl bg-sun-50 border border-sun-100 p-4 my-3 flex flex-wrap items-center gap-3 justify-between"><p className="text-sm max-w-md"><b>You're using a guest profile.</b> Progress is saved in this browser. Create a free local account to keep it safe and sign in later.</p><div className="flex gap-2"><ButtonLink href="/signup" size="sm">Create account</ButtonLink><ButtonLink href="/login" size="sm" variant="secondary">Log in</ButtonLink></div></div>
            ) : <p className="text-sm text-muted my-2">Signed in as <b className="text-ink">{me.user.email}</b></p>}
            <div className="grid sm:grid-cols-2 gap-4 mt-3">
              <div><label className="label" htmlFor="nm">Display name</label><input id="nm" className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
              <div><label className="label" htmlFor="wg">Weekly goal (minutes)</label><input id="wg" type="number" min={30} max={1200} step={10} className="input tnum" value={goal} onChange={(e) => setGoal(Number(e.target.value))} /></div>
              <div><label className="label" htmlFor="ex">Preparing for</label><select id="ex" className="input" value={exam} onChange={(e) => setExam(e.target.value)}><option value="both">TEAS and NCLEX</option><option value="teas">TEAS 7</option><option value="nclex">NCLEX-RN</option></select></div>
              <div><label className="label" htmlFor="ed">Target exam date (optional)</label><input id="ed" type="date" className="input" value={examDate} onChange={(e) => setExamDate(e.target.value)} /></div>
            </div>
            <div className="mt-4 flex gap-2 flex-wrap"><Button onClick={saveProfile} loading={busy === 'profile'}>Save profile</Button>{!me.user.isGuest && <Button variant="secondary" onClick={logout}><LogOut size={16} aria-hidden /> Log out</Button>}</div>
          </>
        )}
      </section>

      <section className="card p-6" aria-labelledby="look">
        <h2 id="look" className="font-display text-xl font-extrabold mb-3">Appearance</h2>
        <div className="inline-flex p-1 rounded-xl bg-line/50" role="radiogroup" aria-label="Theme">{(['light', 'dark'] as const).map((t) => <button key={t} role="radio" aria-checked={theme === t} onClick={() => setTheme(t)} className={`h-10 px-5 rounded-lg text-sm font-bold inline-flex items-center gap-2 ${theme === t ? 'bg-surface shadow-card' : 'text-muted'}`}>{t === 'light' ? <Sun size={16} /> : <Moon size={16} />}{t === 'light' ? 'Light' : 'Dark'}</button>)}</div>
      </section>

      {/* AI */}
      <section className="card p-6" aria-labelledby="ai-h">
        <div className="flex items-start justify-between gap-3 flex-wrap"><div><h2 id="ai-h" className="font-display text-xl font-extrabold">AI provider</h2><p className="text-sm text-muted mt-1 max-w-xl">Penlight works fully offline in <b>Lite mode</b>. Add an API key to generate richer guides, flashcards and questions with AI. Any OpenAI-compatible service works, plus xAI and Anthropic.</p></div><ModeBadge mode={st?.configured && st.mode !== 'lite' ? 'ai' : 'lite'} /></div>
        {llm.error && <ErrorBox message={llm.error} retry={llm.reload} />}
        {st && (
          <div className="mt-4 rounded-2xl bg-line/40 p-4 text-sm flex flex-wrap items-center gap-x-6 gap-y-1">
            {st.configured ? <><span className="inline-flex items-center gap-1.5 font-bold text-brand-700"><Check size={16} aria-hidden /> Key saved</span><span>Provider: <b>{prov?.label ?? st.provider}</b></span><span>Model: <b>{st.model}</b></span><span className="tnum">Key: <b>{st.keyHint}</b></span>{st.source === 'env' && <Badge tone="gray">from environment variable</Badge>}</> : <span className="inline-flex items-center gap-2"><Zap size={16} aria-hidden /> No key configured. Using Lite mode.</span>}
          </div>
        )}
        <div className="grid sm:grid-cols-2 gap-4 mt-5">
          <div><label className="label" htmlFor="pv">Provider</label><select id="pv" className="input" value={provider} onChange={(e) => { setProvider(e.target.value); setModel(llm.data?.providers.find((p) => p.id === e.target.value)?.model ?? ''); }}>{llm.data?.providers.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></div>
          <div><label className="label" htmlFor="md">Model</label><input id="md" className="input" value={model} placeholder={prov?.model || 'e.g. gpt-4o-mini'} onChange={(e) => setModel(e.target.value)} /></div>
          <div className="sm:col-span-2"><label className="label" htmlFor="ky">API key</label><div className="relative"><KeyRound size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-faint" aria-hidden /><input id="ky" type="password" autoComplete="off" className="input !pl-11" placeholder={st?.configured ? 'Saved. Enter a new key to replace it' : 'Paste your API key'} value={key} onChange={(e) => setKey(e.target.value)} /></div><p className="text-xs text-muted mt-1.5">Stored encrypted on this server. It is never sent back to your browser after saving.</p></div>
          {(provider === 'custom' || baseUrl) && <div className="sm:col-span-2"><label className="label" htmlFor="bu">Base URL</label><input id="bu" className="input" placeholder="https://your-host/v1" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} /></div>}
          {provider !== 'custom' && !baseUrl && <button className="text-sm font-semibold text-brand-700 text-left sm:col-span-2" onClick={() => setBaseUrl(prov?.baseUrl || ' ')}>Use a custom base URL for this provider</button>}
        </div>
        <div className="mt-4 flex flex-wrap gap-2"><Button onClick={saveLlm} loading={busy === 'save'} disabled={!key && !st?.configured}>Save</Button><Button variant="secondary" onClick={test} loading={busy === 'test'} disabled={!st?.configured}><Plug size={16} aria-hidden /> Test connection</Button>{st?.configured && st.source !== 'env' && <Button variant="ghost" onClick={remove}><Trash2 size={16} aria-hidden /> Remove key</Button>}</div>
        {testMsg && <p role="status" className={`mt-3 text-sm font-semibold ${testMsg.ok ? 'text-brand-700' : 'text-danger-600'}`}>{testMsg.ok ? '✓ ' : '✕ '}{testMsg.message}</p>}
        {st?.configured && (
          <div className="mt-5 pt-5 border-t border-line"><div className="label">When building study sets</div>
            <div className="inline-flex p-1 rounded-xl bg-line/50" role="radiogroup" aria-label="Generation mode"><button role="radio" aria-checked={st.mode !== 'lite'} onClick={() => setMode('auto')} className={`h-10 px-4 rounded-lg text-sm font-bold inline-flex items-center gap-1.5 ${st.mode !== 'lite' ? 'bg-surface shadow-card' : 'text-muted'}`}><Sparkles size={14} /> Use AI (fall back to Lite)</button><button role="radio" aria-checked={st.mode === 'lite'} onClick={() => setMode('lite')} className={`h-10 px-4 rounded-lg text-sm font-bold ${st.mode === 'lite' ? 'bg-surface shadow-card' : 'text-muted'}`}>Always Lite</button></div></div>
        )}
        <p className="text-xs text-muted mt-5">You can also configure this with the environment variables <code className="bg-line/70 px-1 rounded">LLM_PROVIDER</code>, <code className="bg-line/70 px-1 rounded">LLM_API_KEY</code> and <code className="bg-line/70 px-1 rounded">LLM_MODEL</code> (and optionally <code className="bg-line/70 px-1 rounded">LLM_BASE_URL</code>). A key saved here takes priority.</p>
      </section>
      {me?.timeTravel && (
        <section className="card p-6 border-dashed" aria-labelledby="dev"><h2 id="dev" className="font-display text-lg font-extrabold">Developer: simulate days</h2><p className="text-sm text-muted mb-3">Enabled by ALLOW_TIME_TRAVEL=1. Shifts the app clock so spaced repetition and streaks can be verified.</p><div className="flex items-center gap-2"><input aria-label="Days offset" type="number" className="input !w-28" value={sim} onChange={(e) => setSim(Number(e.target.value))} /><Button size="sm" variant="secondary" onClick={() => travel(sim)}>Set offset (days)</Button></div></section>
      )}
      <p className="text-sm text-muted">Back to <Link href="/" className="font-semibold text-brand-700">Home</Link></p>
    </div>
  );
}
