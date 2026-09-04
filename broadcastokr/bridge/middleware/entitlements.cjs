const { canonicalPath } = require('./auth.cjs');

/**
 * Feature gates (R3, FF-8): a feature outside the instance's tier is refused
 * server-side where it enters — the same principle as RBAC's POLICY table,
 * keyed on the tier instead of the role. Runs after auth/RBAC and also on the
 * machine paths (an agent cannot ingest into a starter instance).
 *
 * Response: 403 { error: 'entitlement', feature, tier }.
 */
const GATES = [
  // Live KRs: every route that executes SQL for a KR or a Dashboard KPI
  { feature: 'liveKRs', method: 'POST', path: /^\/api\/kpi\/(execute-batch|execute|sync-now)$/ },
  { feature: 'liveKRs', method: 'GET', path: /^\/api\/kpi\/poll$/ },
  { feature: 'liveKRs', method: 'POST', path: /^\/api\/kpis(\/|$)/ },
  // Agents: minting, enrolment, and the ingest itself
  { feature: 'agents', method: 'POST', path: /^\/api\/agents\/enrol-token$/ },
  { feature: 'agents', method: 'POST', path: /^\/api\/agent\/(enroll|ingest)$/ },
  // Templates
  { feature: 'templates', method: 'POST', path: /^\/api\/goal-templates(\/|$)/ },
  { feature: 'templates', method: 'PUT', path: /^\/api\/goal-templates(\/|$)/ },
];

/** A goal write carrying a live KR needs liveKRs; one sharing a KR needs sharing. */
function goalBodyFeature(body) {
  const krs = Array.isArray(body?.keyResults) ? body.keyResults : [];
  if (krs.some((kr) => kr && kr.sharedWithMediagenix)) return 'sharing';
  if (krs.some((kr) => kr && kr.liveConfig)) return 'liveKRs';
  return null;
}

function createEntitlementMiddleware({ hasEntitlement, tier }) {
  return function entitlementMiddleware(req, res, next) {
    const path = canonicalPath(req.path);
    const refuse = (feature) => res.status(403).json({
      error: 'entitlement', feature, tier,
      detail: `This instance's ${tier} licence does not include ${feature}. Contact your Mediagenix operator.`,
    });

    const gate = GATES.find((g) => g.method === req.method && g.path.test(path));
    if (gate && !hasEntitlement(gate.feature)) return refuse(gate.feature);

    if ((req.method === 'POST' || req.method === 'PUT') && /^\/api\/goals(\/[^/]+)?$/.test(path)) {
      const needed = goalBodyFeature(req.body);
      if (needed === 'sharing') {
        if (!hasEntitlement('sharing')) return refuse('sharing');
        // a shared KR is a live KR's value; both must be licensed
        if (!hasEntitlement('liveKRs') && goalBodyFeature({ keyResults: req.body.keyResults.filter((k) => k.liveConfig) })) return refuse('liveKRs');
      } else if (needed === 'liveKRs' && !hasEntitlement('liveKRs')) {
        return refuse('liveKRs');
      }
    }
    next();
  };
}

module.exports = { createEntitlementMiddleware, GATES, goalBodyFeature };
