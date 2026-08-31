const crypto = require('crypto');

const SESSION_COOKIE = 'brokr_session';

const SLIDING_MS = 8 * 60 * 60 * 1000;      // 8h sliding window
const ABSOLUTE_MS = 7 * 24 * 60 * 60 * 1000; // 7d hard cap

const iso = (ms) => new Date(Date.now() + ms).toISOString();

function createSession(db, userId) {
  const id = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions (id, user_id, expires_at, absolute_expires_at) VALUES (?, ?, ?, ?)')
    .run(id, userId, iso(SLIDING_MS), iso(ABSOLUTE_MS));
  return id;
}

/** Valid session → { userId, role }; slides the expiry. Otherwise null. */
function getSession(db, sessionId) {
  if (!sessionId) return null;
  const now = new Date().toISOString();
  const row = db.prepare(`
    SELECT s.id, s.user_id, s.expires_at, s.absolute_expires_at, u.role
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.id = ? AND s.expires_at > ? AND s.absolute_expires_at > ?
  `).get(sessionId, now, now);
  if (!row) return null;

  const slideTo = new Date(Math.min(Date.now() + SLIDING_MS, new Date(row.absolute_expires_at).getTime())).toISOString();
  db.prepare('UPDATE sessions SET expires_at = ? WHERE id = ?').run(slideTo, sessionId);
  return { userId: row.user_id, role: row.role };
}

function deleteSession(db, sessionId) {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
}

/**
 * Find-or-create the user for an SSO identity. The first SSO user on the
 * instance becomes owner (provisioning may pre-seed one instead); everyone
 * after is a member until promoted.
 */
function upsertSsoUser(db, { issuer, sub, name, email }) {
  const existing = db.prepare('SELECT id, role FROM users WHERE issuer = ? AND sub = ?').get(issuer, sub);
  if (existing) return existing;

  const ssoCount = db.prepare('SELECT COUNT(*) AS c FROM users WHERE issuer IS NOT NULL').get().c;
  const role = ssoCount === 0 ? 'owner' : 'member';
  const displayName = name || email || 'Unknown user';
  const initials = displayName.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?';

  const result = db.prepare(`INSERT INTO users (name, role, av, color, dept, title, email, issuer, sub)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(displayName, role, initials, '#3805E3', '', '', email || null, issuer, sub);
  return { id: Number(result.lastInsertRowid), role };
}

module.exports = { SESSION_COOKIE, createSession, getSession, deleteSession, upsertSsoUser };
