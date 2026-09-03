-- D-3: the WHATS'ON connection store moves out of config.json and into the
-- tenant database, so connections are migrated, versioned, backed up and
-- tenant-scoped like everything else. All additive (FF-6): no DROP, no RENAME.
-- ADR: docs/gpm/state/ADR-2026-09-03-connection-store.md

CREATE TABLE connections (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'oracle',
  host TEXT NOT NULL DEFAULT '',
  port INTEGER,
  service TEXT NOT NULL DEFAULT '',
  schema_name TEXT NOT NULL DEFAULT '',
  user_name TEXT NOT NULL DEFAULT '',
  -- enc:v1: ciphertext when a key is configured, exactly as config.json held it
  password TEXT NOT NULL DEFAULT '',
  client_dir TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Dashboard KPI definitions (the polled gauges), distinct from live KRs —
-- see the ADR for why the two are named apart and not merged.
CREATE TABLE kpi_definitions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  connection_id TEXT NOT NULL DEFAULT '',
  sql TEXT NOT NULL DEFAULT '',
  unit TEXT NOT NULL DEFAULT '',
  direction TEXT NOT NULL DEFAULT 'hi',
  target REAL NOT NULL DEFAULT 0,
  timeframe_days INTEGER,
  binds TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE bridge_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
