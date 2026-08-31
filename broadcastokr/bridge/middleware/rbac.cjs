const { ROLE_PERMS } = require('../permissions.cjs');

/**
 * Server-enforced RBAC for cloud modes. One declarative policy table maps
 * (method, path) to the required permission; 'ownerOnly' marks operations no
 * manager may perform. Desktop mode is untouched (single-user trust model) —
 * there the frontend permission gates remain UX hints with no enforcement,
 * exactly as before.
 *
 * Defaults: GETs need only authentication; unlisted mutations too. Listing is
 * therefore additive hardening — new sensitive routes must be added here.
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
  { method: 'POST', path: /^\/api\/sync\/migrate-from-local$/, perm: 'ownerOnly' },
  { method: 'POST', path: /^\/api\/cockpit\/tenants$/, perm: 'ownerOnly' },
  { method: 'POST', path: /^\/api\/agents\/enrol-token$/, perm: 'ownerOnly' },
  { method: 'DELETE', path: /^\/api\/agents(\/|$)/, perm: 'ownerOnly' },
  { method: 'GET', path: /^\/api\/sync\/backup$/, perm: 'ownerOnly' },
];

function createRbacMiddleware({ mode = 'desktop', insecureNoAuth = false, db } = {}) {
  return function rbacMiddleware(req, res, next) {
    if (mode === 'desktop' || insecureNoAuth) return next();
    if (!req.path.startsWith('/api/') || req.path === '/api/health' || req.path.startsWith('/api/auth/')) {
      return next();
    }
    if (req.path === '/api/cockpit/ingest' || req.path.startsWith('/api/agent/')) return next();

    const role = req.user?.role;
    if (!role) return res.status(401).json({ error: 'Not signed in' });
    const perms = ROLE_PERMS[role];
    if (!perms) return res.status(403).json({ error: 'Unknown role' });

    // Role escalation is owner-only regardless of the general users policy
    if (req.method === 'PUT' && /^\/api\/users\/[^/]+$/.test(req.path) && req.body?.role) {
      const targetId = Number(req.path.split('/').pop());
      const existing = db.prepare('SELECT role FROM users WHERE id = ?').get(targetId);
      if (existing && existing.role !== req.body.role && role !== 'owner') {
        return res.status(403).json({ error: 'Only owners can change roles' });
      }
    }

    const rule = POLICY.find((r) => r.method === req.method && r.path.test(req.path));
    if (!rule) return next();

    const allowed = rule.perm === 'ownerOnly' ? role === 'owner' : !!perms[rule.perm];
    if (!allowed) return res.status(403).json({ error: 'Insufficient permissions' });
    next();
  };
}

module.exports = { createRbacMiddleware, POLICY };
