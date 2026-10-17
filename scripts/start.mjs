#!/usr/bin/env node
/**
 * Production entrypoint for hosts with an EPHEMERAL disk (Render free, Cloud Run, …).
 *
 *   node scripts/start.mjs
 *
 * Without PERSIST_DATABASE_URL this is just `next start` (local SQLite on disk, the default).
 * With PERSIST_DATABASE_URL=<any Postgres URL, e.g. a free Neon/Supabase database> it:
 *   1. restores the latest SQLite snapshot from Postgres before the server starts (if the local DB file is missing),
 *   2. snapshots the live SQLite file back to Postgres every PERSIST_INTERVAL_SEC (default 30s) when it changed,
 *   3. takes a final snapshot on SIGTERM (hosts send it before spinning an instance down).
 * The snapshot is a gzipped, consistent copy made with SQLite's online backup API; the app itself still uses plain SQLite.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const PORT = process.env.PORT || '3100';
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), 'data'));
const DB_FILE = process.env.DB_FILE || path.join(DATA_DIR, 'penlight.db');
const rawUrl = (process.env.PERSIST_DATABASE_URL || '').trim();
const URL_ = /^postgres(ql)?:\/\//i.test(rawUrl) ? rawUrl : '';  // blank / 'none' / '-' disables durable snapshots
const EVERY = Math.max(5, Number(process.env.PERSIST_INTERVAL_SEC || 30)) * 1000;
const log = (...a) => console.log('[penlight-start]', ...a);
fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
// Optional: YouTube cookies (Netscape cookies.txt, base64) from a host secret -> file for yt-dlp. Use a throwaway account.
if (process.env.YTDLP_COOKIES_B64 && !process.env.YTDLP_COOKIES) {
  const f = path.join(DATA_DIR, 'ytdlp-cookies.txt');
  fs.writeFileSync(f, Buffer.from(process.env.YTDLP_COOKIES_B64, 'base64'), { mode: 0o600 });
  process.env.YTDLP_COOKIES = f;
}

let pool = null;
async function pgInit() {
  const { default: pg } = await import('pg');
  pool = new pg.Pool({ connectionString: URL_, max: 2, idleTimeoutMillis: 10000, connectionTimeoutMillis: 20000, ssl: /localhost|127\.0\.0\.1/.test(URL_) ? undefined : { rejectUnauthorized: false } });
  pool.on('error', (e) => log('pg pool error (ignored):', e.message));
  await pool.query('CREATE TABLE IF NOT EXISTS penlight_snapshots (id text PRIMARY KEY, data bytea NOT NULL, sha text NOT NULL, bytes integer NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())');
}

async function restore() {
  if (fs.existsSync(DB_FILE)) { log('local DB present, skipping restore'); return; }
  const r = await pool.query("SELECT data, bytes, updated_at FROM penlight_snapshots WHERE id='main'");
  if (!r.rows.length) { log('no remote snapshot yet (first boot)'); return; }
  fs.writeFileSync(DB_FILE, zlib.gunzipSync(r.rows[0].data));
  log(`restored snapshot from ${r.rows[0].updated_at.toISOString()} (${r.rows[0].bytes} bytes)`);
}

let lastSha = null, lastVersion = null, busy = false, ro = null;
async function snapshot(force = false) {
  if (busy || !fs.existsSync(DB_FILE)) return;
  busy = true;
  try {
    const Database = require('better-sqlite3');
    if (!ro) ro = new Database(DB_FILE, { readonly: true, fileMustExist: true });
    const v = ro.pragma('data_version', { simple: true });
    if (!force && v === lastVersion) return;
    const tmp = path.join(DATA_DIR, '.snapshot.tmp');
    await ro.backup(tmp);
    const raw = fs.readFileSync(tmp); fs.unlinkSync(tmp);
    const sha = crypto.createHash('sha256').update(raw).digest('hex');
    lastVersion = v;
    if (sha === lastSha) return;
    const gz = zlib.gzipSync(raw, { level: 6 });
    await pool.query("INSERT INTO penlight_snapshots (id, data, sha, bytes) VALUES ('main', $1, $2, $3) ON CONFLICT (id) DO UPDATE SET data=EXCLUDED.data, sha=EXCLUDED.sha, bytes=EXCLUDED.bytes, updated_at=now()", [gz, sha, gz.length]);
    lastSha = sha;
    log(`snapshot saved (${gz.length} bytes gz)`);
  } catch (e) { log('snapshot failed:', e.message); lastVersion = null; }
  finally { busy = false; }
}

if (URL_) {
  try { await pgInit(); await restore(); } catch (e) { log('persistence init failed — continuing WITHOUT durable storage:', e.message); pool = null; }
} else log('PERSIST_DATABASE_URL not set (or not a postgres:// URL): using local disk only. On an ephemeral host, data is lost on restart.');

const child = spawn(process.execPath, [path.join('node_modules', 'next', 'dist', 'bin', 'next'), 'start', '-p', PORT, '-H', '0.0.0.0'], { stdio: 'inherit', env: process.env });
let timer = null;
if (pool) timer = setInterval(() => snapshot(false), EVERY);

let stopping = false;
async function shutdown(sig) {
  if (stopping) return; stopping = true;
  log('received', sig);
  if (timer) clearInterval(timer);
  if (pool) { await Promise.race([snapshot(true), new Promise((r) => setTimeout(r, 8000))]); }
  child.kill('SIGTERM');
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
child.on('exit', (code) => { if (!stopping) process.exit(code ?? 1); else process.exit(0); });
