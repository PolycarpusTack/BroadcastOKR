-- Tier 2: cockpit tenancy (per-tenant write-only share tokens + landed
-- metrics) and connector-agent identity. All additive.

CREATE TABLE cockpit_tenants (
  client_id TEXT PRIMARY KEY REFERENCES clients(id) ON DELETE CASCADE,
  share_token_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE shared_metrics (
  tenant_client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  kr_id TEXT NOT NULL,
  value REAL NOT NULL,
  target REAL NOT NULL,
  direction TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  received_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (tenant_client_id, kr_id)
);

CREATE TABLE agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  revoked_at TEXT,
  last_seen_at TEXT
);

CREATE TABLE agent_enrol_tokens (
  token_hash TEXT PRIMARY KEY,
  expires_at TEXT NOT NULL,
  used_at TEXT
);
