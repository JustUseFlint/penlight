import { cookies } from 'next/headers';
import crypto from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import { getDb, now, uid } from './db';

const COOKIE = 'penlight_session';
const TTL = 1000 * 60 * 60 * 24 * 60; // 60 days

export interface User {
  id: string;
  email: string | null;
  name: string;
  is_guest: number;
  target_exam: string;
  exam_date: string | null;
  weekly_goal_min: number;
  theme: string;
  created_at: number;
}

const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

export function validateEmail(e: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
}

async function startSession(userId: string) {
  const token = crypto.randomBytes(32).toString('base64url');
  getDb().prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').run(sha(token), userId, now() + TTL);
  const jar = await cookies();
  jar.set(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: false, path: '/', maxAge: TTL / 1000 });
}

export function createGuestRow(): User {
  const db = getDb();
  const id = uid();
  db.prepare("INSERT INTO users(id,name,is_guest,created_at) VALUES(?,?,1,?)").run(id, 'Guest', now());
  return db.prepare('SELECT * FROM users WHERE id=?').get(id) as User;
}

/** Returns the signed-in user, creating a frictionless guest profile if there's no session. */
export async function requireUser(): Promise<User> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  const db = getDb();
  if (token) {
    const row = db
      .prepare('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?')
      .get(sha(token), now()) as User | undefined;
    if (row) return row;
  }
  const guest = createGuestRow();
  await startSession(guest.id);
  return guest;
}

export async function signUp(email: string, password: string, name: string, current?: User) {
  const db = getDb();
  email = email.trim().toLowerCase();
  if (!validateEmail(email)) throw new AuthError('Enter a valid email address.');
  if (password.length < 8) throw new AuthError('Password must be at least 8 characters.');
  if (db.prepare('SELECT 1 FROM users WHERE email=?').get(email)) throw new AuthError('An account with that email already exists. Try logging in.');
  const ph = await hash(password);
  const displayName = name.trim().slice(0, 60) || email.split('@')[0];
  if (current && current.is_guest) {
    // upgrade the guest profile in place so progress is kept
    db.prepare('UPDATE users SET email=?, name=?, password_hash=?, is_guest=0 WHERE id=?').run(email, displayName, ph, current.id);
    return current.id;
  }
  const id = uid();
  db.prepare('INSERT INTO users(id,email,name,password_hash,is_guest,created_at) VALUES(?,?,?,?,0,?)').run(id, email, displayName, ph, now());
  await startSession(id);
  return id;
}

export async function logIn(email: string, password: string) {
  const db = getDb();
  const u = db.prepare('SELECT * FROM users WHERE email=?').get(email.trim().toLowerCase()) as (User & { password_hash: string }) | undefined;
  // constant-ish work even when user is missing
  const ok = u?.password_hash ? await verify(u.password_hash, password).catch(() => false) : false;
  if (!u || !ok) throw new AuthError('Incorrect email or password.');
  await startSession(u.id);
  return u.id;
}

export async function logOut() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) getDb().prepare('DELETE FROM sessions WHERE token_hash=?').run(sha(token));
  jar.delete(COOKIE);
}

export class AuthError extends Error {}

/** AES-256-GCM helpers for the API key stored in the local DB. */
function secretKey(): Buffer {
  // Hosted deployments: derive the AES key from the APP_SECRET env var (never stored on disk or committed).
  if (process.env.APP_SECRET) return crypto.createHash('sha256').update('penlight:' + process.env.APP_SECRET).digest();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('node:fs') as typeof import('node:fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require('node:path') as typeof import('node:path');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { DATA_DIR } = require('./db') as typeof import('./db');
  const f = path.join(DATA_DIR, '.secret');
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(f)) fs.writeFileSync(f, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
  return Buffer.from(fs.readFileSync(f, 'utf8').trim(), 'hex');
}
export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', secretKey(), iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString('base64')).join('.');
}
export function decryptSecret(blob: string): string {
  const [iv, tag, enc] = blob.split('.').map((s) => Buffer.from(s, 'base64'));
  const d = crypto.createDecipheriv('aes-256-gcm', secretKey(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
}
