-- F6 / ADR-B4: deletion markers for the change poll. Every delete route records
-- (kind, id, deleted_at) in the same transaction as the DELETE; the poll returns
-- markers newer than `since` next to the changed rows. Kept 30 days; a client
-- further behind than that is told to reload the full snapshot. Additive.
-- Plan: docs/gpm/plans/2026-09-07-review-remediation/ADR-B4-deletion-reconciliation.md

CREATE TABLE IF NOT EXISTS sync_deletions (
  kind       TEXT NOT NULL,
  id         TEXT NOT NULL,
  deleted_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (kind, id)
);

CREATE INDEX IF NOT EXISTS idx_sync_deletions_deleted_at ON sync_deletions(deleted_at);
