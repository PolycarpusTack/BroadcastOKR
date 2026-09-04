const { createRouter } = require('../utils/router.cjs');
const { computeUsage } = require('../entitlements.cjs');

/**
 * GET /api/usage — the instance's licence and what it holds against it (R3).
 * Owner-only for the instance's own people; the cockpit reads it through the
 * operator channel and aggregates its tenants (GET /api/cockpit/usage) — that
 * aggregate is the invoicing input.
 */
function createUsageRouter(db) {
  const router = createRouter();
  router.get('/', (req, res) => res.json(computeUsage(db)));
  return router;
}

module.exports = { createUsageRouter };
