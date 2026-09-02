const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { POLICY } = require('../middleware/rbac.cjs');
const { createWhatsonRouter } = require('../routes/whatson.cjs');

/**
 * FF-9 — every data-plane route is policy-covered.
 *
 * The data plane is the route family that can reach a *client* database
 * (Oracle/PostgreSQL via whatson/core.cjs), as opposed to the tenant SQLite
 * store. `rbacMiddleware` defaults to allow-when-unlisted, which is the right
 * default for the dozens of tenant CRUD routes but the wrong one here: a
 * data-plane route mounted without a POLICY entry is reachable by any signed-in
 * role. That is exactly how POST /api/kpi/execute-batch — a raw-SQL surface —
 * ended up member-reachable.
 *
 * So this test inverts the default for the data plane: coverage is mandatory,
 * and the permission is whatever POLICY says. Adding a route to
 * routes/whatson.cjs without a POLICY rule fails CI naming the path.
 *
 * "Covered" means an explicit decision was written down, NOT that the route is
 * locked: `perm: 'authenticated'` is a legitimate, deliberate answer.
 */

/** Express route paths carry params (`/connections/:id`); POLICY regexes are
 *  written against real request paths, so substitute a concrete segment. */
function concretePath(routePath) {
  return `/api${routePath}`.replace(/:[^/]+/g, 'x');
}

/** Every (method, path) the router mounts, as request-shaped pairs. */
function mountedRoutes(router) {
  const out = [];
  for (const layer of router.stack) {
    if (!layer.route) continue;
    for (const method of Object.keys(layer.route.methods)) {
      if (!layer.route.methods[method]) continue;
      out.push({ method: method.toUpperCase(), path: concretePath(layer.route.path) });
    }
  }
  return out;
}

/** The invariant itself, extracted so the test can prove it fails open-loop. */
function uncoveredRoutes(routes, policy) {
  return routes.filter(({ method, path }) =>
    !policy.some((rule) => rule.method === method && rule.path.test(path)));
}

function buildDataPlaneRouter() {
  // Construction touches only the store destructure — no DB, no driver needed.
  const store = {
    loadConfig: () => ({ connections: [], kpiDefinitions: [] }),
    saveConfig: () => {},
    loadHistory: () => ({}),
    saveHistory: () => {},
  };
  return createWhatsonRouter({
    db: null, mode: 'client', core: {}, store,
    cipher: { available: true, enforced: false, unprotected: false, encrypt: (v) => v, decrypt: (v) => v },
  });
}

describe('FF-9: data-plane routes are policy-covered', () => {
  it('every route on the WHATS\'ON router has an explicit POLICY entry', () => {
    const routes = mountedRoutes(buildDataPlaneRouter());
    assert.ok(routes.length > 10, `expected the data-plane router to mount routes, saw ${routes.length}`);

    const uncovered = uncoveredRoutes(routes, POLICY);
    assert.deepEqual(uncovered, [],
      `data-plane routes without a POLICY entry:\n${uncovered.map((r) => `  ${r.method} ${r.path}`).join('\n')}\n`
      + 'Add a rule to POLICY in bridge/middleware/rbac.cjs — '
      + "`perm: 'authenticated'` is a valid, deliberate answer.");
  });

  it('the raw-SQL surfaces are owner-gated, not merely covered', () => {
    // Coverage alone would be satisfied by `authenticated`; these specific
    // routes take SQL from the request body and must be owner-only.
    for (const path of ['/api/kpi/execute-batch', '/api/preview-query']) {
      const rule = POLICY.find((r) => r.method === 'POST' && r.path.test(path));
      assert.ok(rule, `${path} must have a POLICY entry`);
      assert.equal(rule.perm, 'ownerOnly', `${path} accepts caller-supplied SQL and must be ownerOnly`);
    }
  });

  it('coverage survives the shapes Express would also dispatch (case, trailing slash)', () => {
    // The 2026-09-02 review found `/API/KPI/EXECUTE-BATCH` and
    // `/api/kpi/execute-batch/` reaching the handler past every $-anchored
    // rule. rbac now canonicalises before matching; this pins that the
    // canonical form of every accepted shape lands on the same rule.
    const { canonicalPath } = require('../middleware/auth.cjs');
    const routes = mountedRoutes(buildDataPlaneRouter());
    for (const { method, path } of routes) {
      const expected = POLICY.find((r) => r.method === method && r.path.test(path));
      for (const variant of [`${path}/`, path.toUpperCase(), `${path.toUpperCase()}/`]) {
        const rule = POLICY.find((r) => r.method === method && r.path.test(canonicalPath(variant)));
        assert.equal(rule, expected, `${method} ${variant} must resolve to the same rule as ${path}`);
      }
    }
  });

  it('fails when a data-plane route is mounted without a rule (open-loop proof)', () => {
    const planted = [{ method: 'POST', path: '/api/totally-new-sql-surface' }];
    assert.deepEqual(uncoveredRoutes(planted, POLICY), planted,
      'the coverage check must flag an unlisted route — otherwise FF-9 proves nothing');
  });
});
