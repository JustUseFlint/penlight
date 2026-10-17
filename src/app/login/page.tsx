'use client';
import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/client';
import { Button, Logo } from '@/components/ui';

export default function AuthPage() {
  const signup = false as boolean;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    try { await api(signup ? '/api/auth/signup' : '/api/auth/login', { body: { email, password, name } }); location.href = '/'; }
    catch (e2) { setErr((e2 as Error).message); setBusy(false); }
  }
  return (
    <div className="max-w-md mx-auto pt-6 md:pt-14">
      <div className="text-center mb-6"><div className="inline-flex items-center gap-3 font-display font-extrabold text-3xl"><Logo size={44} /> Penlight</div></div>
      <form onSubmit={submit} className="card p-6 md:p-8 space-y-4">
        <div><h1 className="text-2xl font-extrabold">{signup ? 'Create your account' : 'Welcome back'}</h1><p className="text-muted text-sm mt-1">{signup ? 'Your guest progress comes with you. Accounts are stored locally on this server.' : 'Log in to pick up where you left off.'}</p></div>
        {signup && <div><label className="label" htmlFor="n">Name</label><input id="n" className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></div>}
        <div><label className="label" htmlFor="e">Email</label><input id="e" type="email" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></div>
        <div><label className="label" htmlFor="p">Password{signup && <span className="text-muted font-normal"> (8+ characters)</span>}</label><input id="p" type="password" required minLength={signup ? 8 : 1} className="input" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={signup ? 'new-password' : 'current-password'} /></div>
        {err && <p role="alert" className="text-sm font-semibold text-danger-600">{err}</p>}
        <Button type="submit" size="lg" className="w-full" loading={busy}>{signup ? 'Create account' : 'Log in'}</Button>
        <p className="text-sm text-center text-muted">{signup ? <>Already have an account? <Link className="font-bold text-brand-700" href="/login">Log in</Link></> : <>New here? <Link className="font-bold text-brand-700" href="/signup">Create an account</Link></>}{' · '}<Link className="font-bold text-brand-700" href="/">Continue as guest</Link></p>
      </form>
    </div>
  );
}
