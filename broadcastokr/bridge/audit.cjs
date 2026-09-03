/**
 * Server-side audit emission: the actor comes from the authenticated session
 * (cloud) or is 'operator' (desktop) — never from a request body.
 */
function actorName(db, req) {
  // The cockpit acting over the operator channel (R6-1) — a principal, not a user row
  if (req.user?.operator) return 'Mediagenix operator';
  if (req.user?.id) {
    const u = db.prepare('SELECT name FROM users WHERE id = ?').get(req.user.id);
    return u?.name || `user#${req.user.id}`;
  }
  return 'operator';
}

function audit(db, req, text, color = null) {
  try {
    db.prepare('INSERT INTO activity_log (actor, text, color) VALUES (?, ?, ?)')
      .run(actorName(db, req), text, color);
  } catch (err) {
    console.error('audit write failed:', err.message);
  }
}

module.exports = { audit, actorName };
