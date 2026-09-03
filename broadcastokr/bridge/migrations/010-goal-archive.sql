-- R6-5: period archive. An archived goal is a closed quarter's record — kept,
-- reported on, but out of the active views, no longer synced, no longer
-- shared. Additive (FF-6).
-- Backlog: docs/gpm/state/r6-backlog-2026-09-03.md (R6-5)

ALTER TABLE goals ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;
