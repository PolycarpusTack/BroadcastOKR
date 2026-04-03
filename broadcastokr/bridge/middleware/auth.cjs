/**
 * API key authentication middleware.
 * Requires Authorization: Bearer <key> header on all endpoints except /api/health.
 * If no API key is configured (undefined), auth is disabled (dev mode).
 */
function createAuthMiddleware(apiKey) {
  return function authMiddleware(req, res, next) {
    // Skip auth for health endpoint
    if (req.path === '/api/health') return next();

    // If no API key configured, skip auth (development mode)
    if (!apiKey) return next();

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.slice(7);
    if (token !== apiKey) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    next();
  };
}

module.exports = { createAuthMiddleware };
