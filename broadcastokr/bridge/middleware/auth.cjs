const crypto = require('crypto');
const { parseCookies } = require('../utils/cookies.cjs');
const { SESSION_COOKIE, getSession } = require('../sessions.cjs');

/** Constant-time token comparison (length leak is acceptable; content is not). */
function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/**
 * The one shape every path-keyed decision is made against.
 *
 * Express routes case-insensitively and tolerates a trailing slash by
 * default, so `/API/KPI/EXECUTE-BATCH` and `/api/kpi/execute-batch/` both
 * reach the execute-batch handler. Middleware that compares `req.path` to a
 * literal or a $-anchored regex sees neither of them — which is how an
 * unauthenticated caller could run SQL and download the tenant database
 * (review 2026-09-02, F1). Canonicalise once, here, before any comparison.
 * The routers are also strict and case-sensitive (utils/router.cjs), so the
 * odd shapes 404 — this is the layer that holds if that one ever slips.
 */
function canonicalPath(path) {
  const stripped = String(path || '').toLowerCase().replace(/\/+$/, '');
  return stripped || '/';
}

/**
 * The single source of which paths session/RBAC middleware must NOT guard:
 * static assets, the health probe, the auth flow itself, and the machine
 * endpoints that carry their own credentials (share/agent tokens).
 * auth and rbac middleware both consume this — the lists cannot drift.
 */
function isSessionExempt(path) {
  const p = canonicalPath(path);
  return !/^\/api(\/|$)/.test(p)
    || p === '/api/health'
    || p.startsWith('/api/auth/')
    || p === '/api/cockpit/ingest'
    || p.startsWith('/api/agent/');
}

/**
 * Mode-conditional authentication.
 * desktop — API-key bearer check (single user, single machine; no key = dev mode).
 * client/cockpit — server-side sessions established by the OIDC routes; every
 * /api/* call needs a valid session, and req.user carries { id, role } for RBAC.
 * `insecureNoAuth` is the explicit, loudly-logged test/dev escape for cloud
 * modes — production cloud instances refuse to start without OIDC instead.
 */
function createAuthMiddleware({ mode = 'desktop', apiKey, db, insecureNoAuth = false, operatorToken } = {}) {
  return function authMiddleware(req, res, next) {
    if (isSessionExempt(req.path)) return next();

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

    // Operator channel (R6-1): the cockpit manages this instance's connections
    // and connector agents with the per-instance BRIDGE_OPERATOR_TOKEN. It is a
    // principal of its own (RBAC holds it to an allowlist), never a session.
    // Checked before the dev escape so tests exercise the real path; anything
    // that presents the header and does not match is refused outright.
    const presented = req.headers['x-operator-token'];
    if (presented !== undefined) {
      if (mode === 'client' && operatorToken && safeEqual(presented, operatorToken)) {
        req.user = { id: null, role: 'operator', operator: true };
        return next();
      }
      return res.status(401).json({ error: 'Invalid operator token' });
    }

    // Cloud modes: session-based
    if (insecureNoAuth) return next();

    const session = getSession(db, parseCookies(req)[SESSION_COOKIE]);
    if (!session) return res.status(401).json({ error: 'Not signed in' });
    req.user = { id: session.userId, role: session.role };
    next();
  };
}

module.exports = { createAuthMiddleware, isSessionExempt, canonicalPath };
