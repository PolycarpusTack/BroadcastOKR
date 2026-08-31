const crypto = require('crypto');
const { parseCookies } = require('../utils/cookies.cjs');
const { getSession } = require('../sessions.cjs');

/** Constant-time token comparison (length leak is acceptable; content is not). */
function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

const SESSION_COOKIE = 'brokr_session';

/**
 * Mode-conditional authentication.
 * desktop — API-key bearer check (single user, single machine; no key = dev mode).
 * client/cockpit — server-side sessions established by the OIDC routes; every
 * /api/* call needs a valid session, and req.user carries { id, role } for RBAC.
 * `insecureNoAuth` is the explicit, loudly-logged test/dev escape for cloud
 * modes — production cloud instances refuse to start without OIDC instead.
 */
function createAuthMiddleware({ mode = 'desktop', apiKey, db, insecureNoAuth = false } = {}) {
  return function authMiddleware(req, res, next) {
    // Only API routes are guarded — static app assets (cloud modes) are
    // public; the data behind them is not. Health stays open for probes.
    if (!req.path.startsWith('/api/')) return next();
    if (req.path === '/api/health') return next();
    if (req.path.startsWith('/api/auth/')) return next();

    if (mode === 'desktop') {
      // If no API key configured, skip auth (development mode)
      if (!apiKey) return next();

      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      if (!safeEqual(authHeader.slice(7), apiKey)) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      return next();
    }

    // Cloud modes: session-based
    if (insecureNoAuth) return next();

    const session = getSession(db, parseCookies(req)[SESSION_COOKIE]);
    if (!session) return res.status(401).json({ error: 'Not signed in' });
    req.user = { id: session.userId, role: session.role };
    next();
  };
}

module.exports = { createAuthMiddleware };
