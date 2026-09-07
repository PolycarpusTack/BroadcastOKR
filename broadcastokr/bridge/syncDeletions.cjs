/**
 * Deletion markers for the change poll (ADR-B4, F6).
 *
 * `/api/sync/changes?since=` used to answer "what changed" with rows only, so a
 * deleted goal, task, client, user, team or template stayed in every other
 * client's cache until a full reload. The smallest design that fixes it on the
 * existing timestamp protocol: every delete route records (kind, id,
 * deleted_at) in the same transaction as the DELETE, the poll returns the
 * markers newer than `since` next to the changed rows, and the client applies
 * removals before upserts. Same at-least-once semantics as rows (removing an
 * absent id is a no-op), no cursor, no new endpoint.
 *
 * Markers are kept for RETENTION_DAYS. A client whose `since` is older than that
 * cannot be told what it missed — the poll says `resetRequired` and the client
 * reloads the full snapshot.
 *
 * A delete that changes other rows through the schema (ON DELETE SET NULL,
 * CASCADE on child tables) bumps those parents' updated_at here, so their new
 * shape travels in the same poll.
 */

const RETENTION_DAYS = 30;

/** kind → table. The kinds mirror the sync slices the client keeps. */
const KINDS = {
  goals: 'goals',
  tasks: 'tasks',
  clients: 'clients',
  users: 'users',
  teams: 'teams',
  goalTemplates: 'goal_templates',
};

function recordDeletion(db, kind, id) {
  if (!KINDS[kind]) throw new Error(`unknown deletion kind: ${kind}`);
  db.prepare(`INSERT INTO sync_deletions (kind, id, deleted_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(kind, id) DO UPDATE SET deleted_at = excluded.deleted_at`).run(kind, String(id));
}

/**
 * Delete one row and record its marker together. `invalidate` lists parents
 * whose shape the delete changes; each is bumped so the poll carries it.
 * Returns the number of rows deleted (0 = nothing to record).
 */
function deleteWithMarker(db, kind, id, { invalidate = [] } = {}) {
  const table = KINDS[kind];
  const run = db.transaction(() => {
    // Capture the parents before the FK actions rewrite the link
    const touched = invalidate.map(({ table: t, where, params }) => ({
      table: t,
      ids: db.prepare(`SELECT id FROM ${t} WHERE ${where}`).all(...params).map((r) => r.id),
    }));
    const result = db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
    if (result.changes === 0) return 0;
    recordDeletion(db, kind, id);
    for (const { table: t, ids } of touched) {
      const bump = db.prepare(`UPDATE ${t} SET updated_at = datetime('now') WHERE id = ?`);
      for (const pid of ids) bump.run(pid);
    }
    return result.changes;
  });
  return run();
}

/** Markers newer than `since` (already normalised to sqlite format), grouped by kind. */
function deletionsSince(db, since) {
  const out = Object.fromEntries(Object.keys(KINDS).map((k) => [k, []]));
  for (const row of db.prepare('SELECT kind, id FROM sync_deletions WHERE deleted_at > ? ORDER BY deleted_at').all(since)) {
    if (out[row.kind]) out[row.kind].push(row.id);
  }
  return out;
}

function pruneDeletions(db) {
  return db.prepare(`DELETE FROM sync_deletions WHERE deleted_at < datetime('now', ?)`).run(`-${RETENTION_DAYS} days`).changes;
}

/** True when `since` (sqlite format) is older than what the markers can still account for. */
function isBeyondRetention(since) {
  const t = Date.parse(since.replace(' ', 'T') + 'Z');
  if (Number.isNaN(t)) return true;
  return Date.now() - t > RETENTION_DAYS * 86400000;
}

module.exports = { KINDS, RETENTION_DAYS, recordDeletion, deleteWithMarker, deletionsSince, pruneDeletions, isBeyondRetention };
