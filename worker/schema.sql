CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invite_code TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  max_accounts INTEGER,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  phone TEXT NOT NULL,
  display_name TEXT,
  session_string_encrypted TEXT NOT NULL,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS account_settings (
  account_id INTEGER PRIMARY KEY REFERENCES accounts(id),
  meow_enabled INTEGER DEFAULT 1,
  fish_enabled INTEGER DEFAULT 1,
  smuggle_enabled INTEGER DEFAULT 1,
  selected_groups TEXT DEFAULT '[]',
  meow_interval INTEGER DEFAULT 300,
  randomize_delay INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS bot_state (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  group_id INTEGER NOT NULL,
  last_meow_time TEXT,
  last_fish_time TEXT,
  pending_timer_expiry TEXT,
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(account_id, group_id)
);

CREATE TABLE IF NOT EXISTS invites (
  code TEXT PRIMARY KEY,
  note TEXT,
  used_by INTEGER REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  used_at TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  is_admin INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS job_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT,
  started_at TEXT DEFAULT (datetime('now')),
  ended_at TEXT,
  status TEXT DEFAULT 'running',
  accounts_processed INTEGER DEFAULT 0,
  actions_executed INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS action_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER,
  action_type TEXT,
  group_id INTEGER,
  detail TEXT,
  success INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

-- NEW: interactive Telegram login sessions
CREATE TABLE IF NOT EXISTS login_sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  phone TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  phone_code_hash TEXT,
  submitted_code TEXT,
  submitted_password TEXT,
  error TEXT,
  account_id INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('run_hours', '4'),
  ('run_minutes', '55'),
  ('max_accounts_global', '4'),
  ('meow_interval_default', '300'),
  ('bot_user_id', '8299996037');
