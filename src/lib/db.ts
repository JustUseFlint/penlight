import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

export const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), 'data'));

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  name TEXT NOT NULL DEFAULT 'Student',
  password_hash TEXT,
  is_guest INTEGER NOT NULL DEFAULT 1,
  target_exam TEXT NOT NULL DEFAULT 'both',
  exam_date TEXT,
  weekly_goal_min INTEGER NOT NULL DEFAULT 150,
  theme TEXT NOT NULL DEFAULT 'light',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS lectures (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  channel TEXT,
  thumbnail TEXT,
  duration_sec INTEGER,
  source_url TEXT,
  source_type TEXT NOT NULL,         -- youtube | url | paste | upload | sample
  transcript_source TEXT,            -- captions-manual | captions-auto | whisper | paste | upload | sample
  is_sample INTEGER NOT NULL DEFAULT 0,
  segments_json TEXT,                -- [{start,text}]
  guide_json TEXT,
  mode TEXT,                         -- lite | ai
  status TEXT NOT NULL DEFAULT 'queued',
  topic TEXT,
  word_count INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_lectures_user ON lectures(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  lecture_id TEXT,
  status TEXT NOT NULL,              -- queued | running | done | error
  stage TEXT NOT NULL DEFAULT 'queued',
  progress REAL NOT NULL DEFAULT 0,
  message TEXT,
  error TEXT,
  error_code TEXT,
  input_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS decks (
  id TEXT PRIMARY KEY,
  user_id TEXT,                      -- NULL = premade
  kind TEXT NOT NULL,                -- premade | lecture | custom
  ref_id TEXT,                       -- lecture id / program id
  title TEXT NOT NULL,
  description TEXT,
  category TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS cards (
  id TEXT PRIMARY KEY,
  deck_id TEXT NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  type TEXT NOT NULL,                -- term | qa | cloze
  front TEXT NOT NULL,
  back TEXT NOT NULL,
  extra_json TEXT,
  topic TEXT,
  origin TEXT NOT NULL DEFAULT 'premade',  -- premade | lite | ai | user
  tag TEXT,                          -- lesson id for premade cards
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cards_tag ON cards(tag);
CREATE INDEX IF NOT EXISTS idx_cards_deck ON cards(deck_id);
CREATE TABLE IF NOT EXISTS card_state (
  user_id TEXT NOT NULL,
  card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  ease REAL NOT NULL DEFAULT 2.5,
  interval_days REAL NOT NULL DEFAULT 0,
  reps INTEGER NOT NULL DEFAULT 0,
  lapses INTEGER NOT NULL DEFAULT 0,
  due_at INTEGER NOT NULL,
  last_reviewed INTEGER,
  introduced_at INTEGER,
  PRIMARY KEY (user_id, card_id)
);
CREATE INDEX IF NOT EXISTS idx_card_state_due ON card_state(user_id, due_at);

CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  bank TEXT NOT NULL,                -- e.g. 'teas', 'nclex', 'core-pharm', 'dosage', 'lecture:<id>'
  exam TEXT NOT NULL,                -- teas | nclex | core | dosage | lecture
  topic TEXT NOT NULL,
  type TEXT NOT NULL,                -- mcq | sata | numeric
  stem TEXT NOT NULL,
  options_json TEXT NOT NULL,
  correct_json TEXT NOT NULL,        -- [indices] or {answer, unit, tol}
  rationale TEXT NOT NULL,
  difficulty INTEGER NOT NULL DEFAULT 2,
  origin TEXT NOT NULL DEFAULT 'premade',
  lecture_id TEXT,
  tag TEXT,                          -- lesson id for premade questions
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_q_tag ON questions(tag);
CREATE INDEX IF NOT EXISTS idx_q_bank ON questions(bank);

CREATE TABLE IF NOT EXISTS attempts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  scope TEXT,                        -- json describing filter
  mode TEXT NOT NULL,                -- tutor | exam
  timed INTEGER NOT NULL DEFAULT 0,
  time_limit_sec INTEGER,
  questions_json TEXT NOT NULL,      -- snapshot of served questions (with answers server side)
  answers_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'in_progress',
  score INTEGER,
  total INTEGER NOT NULL,
  per_topic_json TEXT,
  duration_sec INTEGER,
  started_at INTEGER NOT NULL,
  finished_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_attempts_user ON attempts(user_id, started_at DESC);

-- one row per answered question: fuels mastery / weak areas / readiness
CREATE TABLE IF NOT EXISTS answer_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  question_id TEXT,
  exam TEXT,
  topic TEXT NOT NULL,
  correct INTEGER NOT NULL,
  source TEXT NOT NULL,              -- test | program | game | card
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_answer_user ON answer_log(user_id, ts);

CREATE TABLE IF NOT EXISTS activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,                -- review | test | game | lesson | lecture | program_day
  label TEXT NOT NULL,
  xp INTEGER NOT NULL DEFAULT 0,
  minutes REAL NOT NULL DEFAULT 0,
  topic TEXT,
  meta_json TEXT,
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_activity_user ON activity(user_id, ts);

CREATE TABLE IF NOT EXISTS game_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  game TEXT NOT NULL,
  source TEXT,
  score INTEGER NOT NULL,
  xp INTEGER NOT NULL,
  detail_json TEXT,
  ts INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS enrollments (
  user_id TEXT NOT NULL,
  program_id TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, program_id)
);
CREATE TABLE IF NOT EXISTS program_progress (
  user_id TEXT NOT NULL,
  program_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  score REAL,
  completed_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, program_id, task_id)
);
CREATE TABLE IF NOT EXISTS achievements (
  user_id TEXT NOT NULL,
  key TEXT NOT NULL,
  unlocked_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, key)
);
`;

declare global {
  // eslint-disable-next-line no-var
  var __db: Database.Database | undefined;
}

export function getDb(): Database.Database {
  if (globalThis.__db) return globalThis.__db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const file = process.env.DB_FILE || path.join(DATA_DIR, 'penlight.db');
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.exec(SCHEMA);
  globalThis.__db = db;
  // lazily seed premade content (idempotent)
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { seedPremade } = require('./content/seed');
    seedPremade(db);
  } catch (e) {
    console.error('[penlight] seed failed', e);
  }
  // any job left "running" from a previous process is stale
  db.prepare("UPDATE jobs SET status='error', error='Interrupted by a server restart. Please try again.', error_code='interrupted', updated_at=? WHERE status IN ('queued','running')").run(Date.now());
  return db;
}

/** Clock. Supports an optional simulated day offset (only when ALLOW_TIME_TRAVEL=1) so SRS/streak behavior can be verified across days. */
declare global {
  // eslint-disable-next-line no-var
  var __simDays: number | undefined;
}
export const now = () => Date.now() + (process.env.ALLOW_TIME_TRAVEL === '1' ? (globalThis.__simDays || 0) * 86_400_000 : 0);
export const setSimDays = (d: number) => { globalThis.__simDays = d; };
export const uid = () => crypto.randomUUID().replace(/-/g, '').slice(0, 16);

export function setSetting(key: string, value: string) {
  getDb().prepare('INSERT INTO app_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, value);
}
export function getSetting(key: string): string | undefined {
  const r = getDb().prepare('SELECT value FROM app_settings WHERE key=?').get(key) as { value: string } | undefined;
  return r?.value;
}
export function delSetting(key: string) {
  getDb().prepare('DELETE FROM app_settings WHERE key=?').run(key);
}
