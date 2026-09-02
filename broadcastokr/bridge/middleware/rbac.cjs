const { ROLE_PERMS } = require('../permissions.cjs');
const { isSessionExempt, canonicalPath } = require('./auth.cjs');

/**
 * Server-enforced RBAC for cloud modes. One declarative policy table maps
 * (method, path) to the required permission; 'ownerOnly' marks operations no
 * manager may perform. Desktop mode is untouched (single-user trust model) —
 * there the frontend permission gates remain UX hints with no enforcement,
 * exactly as before.
 *
 * Defaults: GETs need only authentication; unlisted mutations too. Listing is
 * therefore additive hardening — new sensitive routes must be added here.
 *
 * EXCEPTION — the data plane (routes that reach a *client* Oracle/PostgreSQL
 * database, mounted by routes/whatson.cjs): allow-when-unlisted is the wrong
 * default there, so FF-9 (`__tests__/ff9-policy-coverage.test.cjs`) makes a
 * POLICY entry mandatory for every one of them. `perm: 'authenticated'` is a
 * valid, deliberate answer meaning "any signed-in role" — the point is that the
 * decision is written down rather than inferred from an omission.
 */
const POLICY = [
  // Goals — check-in is member-grade; structural changes are not
  { method: 'POST', path: /^\/api\/goals\/[^/]+\/check-in$/, perm: 'canCheckIn' },
  { method: 'POST', path: /^\/api\/goals(\/|$)/, perm: 'canCreate' },
  { method: 'PUT', path: /^\/api\/goals(\/|$)/, perm: 'canEdit' },
  { method: 'DELETE', path: /^\/api\/goals(\/|$)/, perm: 'canDelete' },

  // Tasks — PUT covers kanban moves and subtask flips, which are member-grade
  { method: 'POST', path: /^\/api\/tasks(\/|$)/, perm: 'canCreate' },
  { method: 'PUT', path: /^\/api\/tasks(\/|$)/, perm: 'canChangeStatus' },
  { method: 'DELETE', path: /^\/api\/tasks(\/|$)/, perm: 'canDelete' },

  // Clients hold DB bindings — owner territory
  { method: 'POST', path: /^\/api\/clients(\/|$)/, perm: 'ownerOnly' },
  { method: 'PUT', path: /^\/api\/clients(\/|$)/, perm: 'ownerOnly' },
  { method: 'DELETE', path: /^\/api\/clients(\/|$)/, perm: 'ownerOnly' },

  // People — manager-grade; role changes get a special check below
  { method: 'POST', path: /^\/api\/(users|teams)(\/|$)/, perm: 'canAssign' },
  { method: 'PUT', path: /^\/api\/(users|teams)(\/|$)/, perm: 'canAssign' },
  { method: 'DELETE', path: /^\/api\/(users|teams)(\/|$)/, perm: 'canAssign' },

  // Templates — manager-grade
  { method: 'POST', path: /^\/api\/goal-templates(\/|$)/, perm: 'canEdit' },
  { method: 'PUT', path: /^\/api\/goal-templates(\/|$)/, perm: 'canEdit' },
  { method: 'DELETE', path: /^\/api\/goal-templates(\/|$)/, perm: 'canEdit' },

  // Credentials, config, raw SQL surfaces, data export/import — owner only
  { method: 'POST', path: /^\/api\/connections(\/|$)/, perm: 'ownerOnly' },
  { method: 'DELETE', path: /^\/api\/connections(\/|$)/, perm: 'ownerOnly' },
  { method: 'POST', path: /^\/api\/config$/, perm: 'ownerOnly' },
  { method: 'POST', path: /^\/api\/(preview-query|tables|columns|test-connection)$/, perm: 'ownerOnly' },
  { method: 'POST', path: /^\/api\/kpis(\/|$)/, perm: 'canEdit' },
  { method: 'DELETE', path: /^\/api\/kpis(\/|$)/, perm: 'canEdit' },

  // ── Data plane (FF-9 requires an entry for every route in routes/whatson.cjs) ──
  // execute-batch is how the app syncs *stored* live KRs (create/edit/sync on
  // the Goals page, Compare, the wizard) — manager work. SQL does arrive in the
  // body, so the handler verifies that every query a non-owner sends matches
  // the KR's stored liveConfig byte-for-byte; owners alone may run ad hoc SQL.
  { method: 'POST', path: /^\/api\/kpi\/execute-batch$/, perm: 'canEdit' },
  // Executes a stored definition, but on an ad-hoc caller-chosen trigger, and
  // /api/channels feeds updateClient — itself ownerOnly — so nothing regresses.
  { method: 'POST', path: /^\/api\/kpi\/execute$/, perm: 'ownerOnly' },
  { method: 'POST', path: /^\/api\/channels$/, perm: 'ownerOnly' },
  // Operational trigger over stored SQL only; real load on client databases.
  { method: 'POST', path: /^\/api\/kpi\/sync-now$/, perm: 'canEdit' },
  // Deliberately open to any signed-in role: the dashboard KPI panel polls on a
  // timer for every session, and these read stored definitions or local files.
  { method: 'GET', path: /^\/api\/kpi\/(poll|templates)$/, perm: 'authenticated' },
  { method: 'GET', path: /^\/api\/kpi\/history(\/|$)/, perm: 'authenticated' },
  { method: 'GET', path: /^\/api\/kpis(\/|$)/, perm: 'authenticated' },
  // Both mask credentials before responding; the live-KR editor needs the list.
  // Tightening these to canEdit is a candidate follow-up, not a behaviour change here.
  { method: 'GET', path: /^\/api\/config$/, perm: 'authenticated' },
  { method: 'GET', path: /^\/api\/connections(\/|$)/, perm: 'authenticated' },
  { method: 'POST', path: /^\/api\/sync\/migrate-from-local$/, perm: 'ownerOnly' },
  { method: 'POST', path: /^\/api\/cockpit\/tenants$/, perm: 'ownerOnly' },
  { method: 'POST', path: /^\/api\/agents\/enrol-token$/, perm: 'ownerOnly' },
  { method: 'DELETE', path: /^\/api\/agents(\/|$)/, perm: 'ownerOnly' },
  { method: 'GET', path: /^\/api\/sync\/backup$/, perm: 'ownerOnly' },
];

function createRbacMiddleware({ mode = 'desktop', insecureNoAuth = false, db } = {}) {
  return function rbacMiddleware(req, res, next) {
    if (mode === 'desktop' || insecureNoAuth) return next();
    if (isSessionExempt(req.path)) return next();

    const role = req.user?.role;
    if (!role) return res.status(401).json({ error: 'Not signed in' });
    const perms = ROLE_PERMS[role];
    if (!perms) return res.status(403).json({ error: 'Unknown role' });

    // Every rule below is written against the canonical shape — never req.path
    // directly, or `/API/GOALS/g1` and `/api/goals/g1/` walk straight past it.
    const path = canonicalPath(req.path);

    // Role escalation is owner-only regardless of the general users policy
    if (req.method === 'POST' && path === '/api/users' && req.body?.role === 'owner' && role !== 'owner') {
      return res.status(403).json({ error: 'Only owners can create owners' });
    }
    if (req.method === 'PUT' && /^\/api\/users\/[^/]+$/.test(path) && req.body?.role) {
      const targetId = Number(path.split('/').pop());
      const existing = db.prepare('SELECT role FROM users WHERE id = ?').get(targetId);
      if (existing && existing.role !== req.body.role && role !== 'owner') {
        return res.status(403).json({ error: 'Only owners can change roles' });
      }
    }

    const rule = POLICY.find((r) => r.method === req.method && r.path.test(path));
    if (!rule) return next();

    // 'authenticated' = any signed-in role; `role` is already non-null above.
    if (rule.perm === 'authenticated') return next();
    const allowed = rule.perm === 'ownerOnly' ? role === 'owner' : !!perms[rule.perm];
    if (!allowed) return res.status(403).json({ error: 'Insufficient permissions' });
    next();
  };
}

module.exports = { createRbacMiddleware, POLICY };
