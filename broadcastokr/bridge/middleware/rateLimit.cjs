const rateLimit = require('express-rate-limit');

/**
 * API rate limiting middleware (defense-in-depth).
 * Limits each client IP to BRIDGE_RATE_LIMIT requests per BRIDGE_RATE_WINDOW_MS.
 * /api/health is exempt so monitoring/liveness checks are never throttled.
 *
 * Defaults: 600 requests / 60s (generous for an internal tool that polls
 * KPIs and syncs state, but enough to blunt runaway loops or abuse).
 */
function createRateLimitMiddleware() {
  const windowMs = Number(process.env.BRIDGE_RATE_WINDOW_MS) || 60_000;
  const max = Number(process.env.BRIDGE_RATE_LIMIT) || 600;

  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.path === '/api/health',
    message: { error: 'Too many requests — slow down and retry shortly.' },
  });
}

module.exports = { createRateLimitMiddleware };
