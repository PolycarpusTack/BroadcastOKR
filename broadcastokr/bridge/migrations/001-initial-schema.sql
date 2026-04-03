-- BroadcastOKR initial schema

CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  av TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '#3805E3',
  dept TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  email TEXT,
  phone TEXT,
  avatar_url TEXT,
  client_ids TEXT,
  skills TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#3805E3',
  icon TEXT NOT NULL DEFAULT '',
  lead_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  client_ids TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE team_members (
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (team_id, user_id)
);

CREATE TABLE clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  connection_id TEXT NOT NULL DEFAULT '',
  logo TEXT,
  color TEXT NOT NULL DEFAULT '#3805E3',
  tags TEXT,
  channels TEXT,
  sql_overrides TEXT,
  monitor_until TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE goal_templates (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Custom',
  period TEXT NOT NULL DEFAULT '',
  sync_interval_ms INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE kr_templates (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES goal_templates(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  sql TEXT NOT NULL DEFAULT '',
  unit TEXT NOT NULL DEFAULT '',
  direction TEXT NOT NULL DEFAULT 'hi',
  start_val REAL NOT NULL DEFAULT 0,
  target_val REAL NOT NULL DEFAULT 100,
  timeframe_days INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE goals (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'behind',
  progress REAL NOT NULL DEFAULT 0,
  owner INTEGER NOT NULL REFERENCES users(id),
  channel INTEGER NOT NULL DEFAULT 0,
  period TEXT NOT NULL DEFAULT '',
  client_ids TEXT,
  channel_scope TEXT,
  template_id TEXT REFERENCES goal_templates(id) ON DELETE SET NULL,
  monitor_until TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE key_results (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  start_val REAL NOT NULL DEFAULT 0,
  target_val REAL NOT NULL DEFAULT 100,
  current_val REAL NOT NULL DEFAULT 0,
  progress REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'behind',
  live_config TEXT,
  sync_status TEXT,
  sync_error TEXT,
  last_sync_at TEXT,
  kr_template_id TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE kr_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kr_id TEXT NOT NULL REFERENCES key_results(id) ON DELETE CASCADE,
  timestamp TEXT NOT NULL,
  value REAL NOT NULL,
  confidence TEXT,
  note TEXT,
  actor TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'check-in'
);

CREATE INDEX idx_kr_history_kr_id ON kr_history(kr_id);
CREATE INDEX idx_kr_history_timestamp ON kr_history(kr_id, timestamp);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'todo',
  priority TEXT NOT NULL DEFAULT 'medium',
  assignee INTEGER NOT NULL REFERENCES users(id),
  channel INTEGER NOT NULL DEFAULT 0,
  due TEXT NOT NULL DEFAULT '',
  task_type TEXT NOT NULL DEFAULT 'task',
  client_ids TEXT,
  channel_scope TEXT,
  goal_id TEXT REFERENCES goals(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE subtasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE kpis (
  name TEXT PRIMARY KEY,
  unit TEXT NOT NULL DEFAULT '',
  direction TEXT NOT NULL DEFAULT 'hi',
  target REAL NOT NULL DEFAULT 0,
  current_val REAL NOT NULL DEFAULT 0,
  trend TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
