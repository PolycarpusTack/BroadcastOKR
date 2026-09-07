-- F4 / ADR-B3: a check-in is one authorised command. A client that lost the
-- response retries with the same operation id and gets the same answer back
-- instead of a second history row. Rows are pruned after 24 hours (well past
-- the client's retry window). Additive; safe on binary rollback.
-- Plan: docs/gpm/plans/2026-09-07-review-remediation/ADR-B3-checkin-command.md

CREATE TABLE IF NOT EXISTS checkin_operations (
  principal    TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  goal_id      TEXT NOT NULL,
  kr_id        TEXT NOT NULL,
  digest       TEXT NOT NULL,
  response     TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (principal, operation_id)
);

CREATE INDEX IF NOT EXISTS idx_checkin_operations_created ON checkin_operations(created_at);
