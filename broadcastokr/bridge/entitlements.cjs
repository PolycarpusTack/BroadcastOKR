const { TIER, ENTITLEMENTS, CAPS } = require('./editions.cjs');

/**
 * R3: what the instance is licensed for, measured against what it holds.
 * Feature gates live in middleware/entitlements.cjs (route table); the caps
 * are checked here by the routers that create the capped thing, and the
 * usage report is what the cockpit aggregates for invoicing.
 */

/** Roles that occupy a seat. Viewers (members) are free by design. */
const SEAT_ROLES = ['owner', 'manager'];

function computeUsage(db) {
  const users = db.prepare('SELECT role FROM users').all();
  const editors = users.filter((u) => SEAT_ROLES.includes(u.role)).length;
  const channels = db.prepare('SELECT channels FROM clients').all()
    .reduce((n, c) => { try { return n + (JSON.parse(c.channels || '[]').length || 0); } catch { return n; } }, 0);
  const agents = db.prepare('SELECT COUNT(*) AS c, SUM(CASE WHEN revoked_at IS NULL THEN 1 ELSE 0 END) AS active FROM agents').get();
  const krs = db.prepare(`SELECT
      SUM(CASE WHEN kr.live_config IS NOT NULL THEN 1 ELSE 0 END) AS live,
      SUM(CASE WHEN kr.shared_with_mediagenix = 1 THEN 1 ELSE 0 END) AS shared
    FROM key_results kr JOIN goals g ON g.id = kr.goal_id WHERE g.archived = 0`).get();
  const goals = db.prepare('SELECT SUM(CASE WHEN archived = 0 THEN 1 ELSE 0 END) AS active, SUM(CASE WHEN archived = 1 THEN 1 ELSE 0 END) AS archived FROM goals').get();
  return {
    tier: TIER,
    entitlements: ENTITLEMENTS,
    caps: CAPS,
    seats: { total: users.length, editors, viewers: users.length - editors },
    channels,
    agents: { active: Number(agents.active) || 0, revoked: (Number(agents.c) || 0) - (Number(agents.active) || 0) },
    liveKRs: Number(krs.live) || 0,
    sharedKRs: Number(krs.shared) || 0,
    goals: { active: Number(goals.active) || 0, archived: Number(goals.archived) || 0 },
    computedAt: new Date().toISOString(),
  };
}

/**
 * Would `next` of `dimension` exceed the cap? Returns the 403 body, or null.
 * `next` is the count the write would leave behind, not the increment.
 */
function capViolation(dimension, next) {
  const limit = CAPS[dimension];
  if (limit === null || limit === undefined) return null;
  if (next <= limit) return null;
  return {
    error: 'entitlement_cap',
    dimension,
    cap: limit,
    requested: next,
    detail: `This instance is licensed for ${limit} ${dimension}; that would make ${next}. Contact your Mediagenix operator to raise the cap.`,
  };
}

/** Seats after a user write: the editor count if the user ends up owner/manager. */
function editorCountAfter(db, { id, role }) {
  const rows = db.prepare('SELECT id, role FROM users').all();
  let editors = rows.filter((u) => SEAT_ROLES.includes(u.role) && String(u.id) !== String(id)).length;
  if (SEAT_ROLES.includes(role)) editors += 1;
  return editors;
}

module.exports = { SEAT_ROLES, computeUsage, capViolation, editorCountAfter };
