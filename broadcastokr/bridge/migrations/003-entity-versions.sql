-- Optimistic-concurrency version counters for the entities with real
-- concurrent-edit risk. Additive: legacy readers ignore the column.
ALTER TABLE goals ADD COLUMN version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tasks ADD COLUMN version INTEGER NOT NULL DEFAULT 0;
