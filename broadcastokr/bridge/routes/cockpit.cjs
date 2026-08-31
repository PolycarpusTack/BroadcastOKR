const express = require('express');
const crypto = require('crypto');
const { MODE } = require('../editions.cjs');
const { audit } = require('../audit.cjs');
const { SHARE_FIELDS } = require('../cockpit/sharePayload.cjs');

const sha256 = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');
const MAX_METRICS = 500;

/**
 * Cockpit side of the shared-metrics channel. Push-only: client instances
 * send their allowlist payload with a per-tenant write-only token; the cockpit
 * validates strictly (unknown fields rejected — defense in depth behind FF-4)
 * and lands numeric facts under the tenant's client row.
 */
function createCockpitRouter(db) {
  const router = express.Router();

  const cockpitOnly = (req, res, next) => {
    if (MODE !== 'cockpit') return res.status(403).json({ error: 'cockpit_only' });
    next();
  };

  // Owner mints a per-tenant write-only token (echoed exactly once)
  router.post('/tenants', cockpitOnly, (req, res) => {
    const { clientId } = req.body;
    const client = db.prepare('SELECT id, name FROM clients WHERE id = ?').get(clientId);
    if (!client) return res.status(400).json({ error: 'Unknown client' });

    const token = crypto.randomBytes(32).toString('hex');
    db.prepare(`INSERT INTO cockpit_tenants (client_id, share_token_hash) VALUES (?, ?)
      ON CONFLICT(client_id) DO UPDATE SET share_token_hash = excluded.share_token_hash, created_at = datetime('now')`)
      .run(clientId, sha256(token));
    audit(db, req, `Minted share token for tenant '${client.name}'`);
    res.status(201).json({ ok: true, clientId, token });
  });

  // Machine endpoint — authenticated by the share token, not a session
  router.post('/ingest', cockpitOnly, (req, res) => {
    const token = req.headers['x-share-token'];
    const tenant = token
      ? db.prepare(`SELECT t.client_id, c.name FROM cockpit_tenants t JOIN clients c ON c.id = t.client_id
          WHERE t.share_token_hash = ?`).get(sha256(token))
      : null;
    if (!tenant) return res.status(401).json({ error: 'Invalid share token' });

    const body = req.body;
    const topKeys = Object.keys(body || {}).sort();
    if (JSON.stringify(topKeys) !== JSON.stringify(['metrics', 'protocol'])) {
      audit(db, req, `Rejected malformed share payload from '${tenant.name}' (unexpected fields)`);
      return res.status(400).json({ error: 'Payload outside the sharing contract' });
    }
    if (!Array.isArray(body.metrics) || body.metrics.length > MAX_METRICS) {
      return res.status(400).json({ error: 'Invalid metrics array' });
    }
    for (const m of body.metrics) {
      const keys = Object.keys(m).sort();
      if (JSON.stringify(keys) !== JSON.stringify([...SHARE_FIELDS].sort())
        || typeof m.krId !== 'string'
        || typeof m.value !== 'number' || !Number.isFinite(m.value)
        || typeof m.target !== 'number' || !Number.isFinite(m.target)
        || (m.direction !== 'hi' && m.direction !== 'lo')
        || typeof m.timestamp !== 'string') {
        audit(db, req, `Rejected out-of-contract metric from '${tenant.name}'`);
        return res.status(400).json({ error: 'Metric outside the sharing contract' });
      }
    }

    const upsert = db.prepare(`INSERT INTO shared_metrics (tenant_client_id, kr_id, value, target, direction, timestamp, received_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(tenant_client_id, kr_id) DO UPDATE SET
        value = excluded.value, target = excluded.target, direction = excluded.direction,
        timestamp = excluded.timestamp, received_at = excluded.received_at`);
    for (const m of body.metrics) {
      upsert.run(tenant.client_id, m.krId, m.value, m.target, m.direction, m.timestamp);
    }
    res.json({ ok: true, received: body.metrics.length });
  });

  // Fleet view (session-authenticated like every other GET)
  router.get('/metrics', cockpitOnly, (req, res) => {
    const rows = db.prepare(`
      SELECT m.tenant_client_id, c.name AS tenant_name, c.color,
             m.kr_id, m.value, m.target, m.direction, m.timestamp, m.received_at
      FROM shared_metrics m JOIN clients c ON c.id = m.tenant_client_id
      ORDER BY c.name, m.kr_id
    `).all();

    const byTenant = new Map();
    for (const r of rows) {
      if (!byTenant.has(r.tenant_client_id)) {
        byTenant.set(r.tenant_client_id, { tenantId: r.tenant_client_id, tenantName: r.tenant_name, color: r.color, metrics: [] });
      }
      byTenant.get(r.tenant_client_id).metrics.push({
        krId: r.kr_id, value: r.value, target: r.target,
        direction: r.direction, timestamp: r.timestamp, receivedAt: r.received_at,
      });
    }
    res.json([...byTenant.values()]);
  });

  return router;
}

module.exports = { createCockpitRouter };
