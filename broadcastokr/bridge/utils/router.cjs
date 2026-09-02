const express = require('express');

/**
 * Every bridge router is strict and case-sensitive.
 *
 * Express's defaults let `/API/GOALS/g1` and `/api/goals/g1/` dispatch to the
 * `/api/goals/:id` handler, while the auth and RBAC middleware — which compare
 * paths, not routes — saw neither shape. Middleware now canonicalises before it
 * compares (middleware/auth.cjs `canonicalPath`); this makes the router refuse
 * the odd shapes outright, so a request that reaches a handler always has the
 * exact path the policy was written against. Belt and braces, deliberately.
 *
 * `app.set('case sensitive routing' | 'strict routing')` does NOT propagate
 * into sub-routers, which is why this exists instead of two lines in server.cjs.
 */
function createRouter() {
  return express.Router({ caseSensitive: true, strict: true });
}

module.exports = { createRouter };
