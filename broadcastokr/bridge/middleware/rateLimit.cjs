const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const { canonicalPath } = require('./auth.cjs');

/**
 * API rate limiting middleware (defense-in-depth).
 * Limits each client IP to BRIDGE_RATE_LIMIT requests per BRIDGE_RATE_WINDOW_MS.
 * /api/health is exempt so monitoring/liveness checks are never throttled.
 *
 * Defaults: 600 requests / 60s (generous for an internal tool that polls
 * KPIs and syncs state, but enough to blunt runaway loops or abuse).
 */
function createRateLimitMiddleware({ sessionKeyed = false } = {}) {
  const windowMs = Number(process.env.BRIDGE_RATE_WINDOW_MS) || 60_000;
  const max = Number(process.env.BRIDGE_RATE_LIMIT) || 600;

  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => canonicalPath(req.path) === '/api/health',
    // Behind the cloud load balancer all traffic shares an IP — key on the
    // session cookie when present so one user can't throttle the tenant.
    // The anonymous fallback goes through ipKeyGenerator: an IPv6 client is
    // keyed by its /56, not by an address it can rotate (ERR_ERL_KEY_GEN_IPV6,
    // surfaced on the R1 rig).
    ...(sessionKeyed ? {
      keyGenerator: (req) => {
        const m = /(?:^|;\s*)brokr_session=([^;]+)/.exec(req.headers.cookie || '');
        return m ? m[1] : (req.ip ? ipKeyGenerator(req.ip) : 'unknown');
      },
    } : {}),
    message: { error: 'Too many requests — slow down and retry shortly.' },
  });
}

module.exports = { createRateLimitMiddleware };
