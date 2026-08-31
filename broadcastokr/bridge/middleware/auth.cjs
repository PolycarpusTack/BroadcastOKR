const crypto = require('crypto');

/** Constant-time token comparison (length leak is acceptable; content is not). */
function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/**
 * API key authentication middleware.
 * Requires Authorization: Bearer <key> header on all endpoints except /api/health.
 * If no API key is configured (undefined), auth is disabled (dev mode).
 */
function createAuthMiddleware(apiKey) {
  return function authMiddleware(req, res, next) {
    // Only API routes are guarded — static app assets (cloud modes) are
    // public; the data behind them is not. Health stays open for probes.
    if (!req.path.startsWith('/api/')) return next();
    if (req.path === '/api/health') return next();

    // If no API key configured, skip auth (development mode)
    if (!apiKey) return next();

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.slice(7);
    if (!safeEqual(token, apiKey)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    next();
  };
}

module.exports = { createAuthMiddleware };
