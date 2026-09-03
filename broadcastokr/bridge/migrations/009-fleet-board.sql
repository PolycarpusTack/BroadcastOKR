-- R6-2: the fleet board. The cockpit keeps a history-lite per shared metric
-- (it only kept the latest value), learns which template KR a metric came
-- from (an id, never a title — FF-4 stands), and lets Mediagenix label
-- columns on its own side. Additive (FF-6).
-- Backlog: docs/gpm/state/r6-backlog-2026-09-03.md (R6-2)

ALTER TABLE shared_metrics ADD COLUMN kr_template_id TEXT;

CREATE TABLE shared_metric_history (
  tenant_client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  kr_id TEXT NOT NULL,
  value REAL NOT NULL,
  target REAL NOT NULL,
  timestamp TEXT NOT NULL,
  received_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (tenant_client_id, kr_id, timestamp)
);

-- key: 'tpl:<krTemplateId>' (one label for the column across tenants) or
-- 'kr:<tenantClientId>:<krId>' (a hand-made KR on one tenant)
CREATE TABLE fleet_labels (
  key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
