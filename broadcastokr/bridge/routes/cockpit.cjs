const { createRouter } = require('../utils/router.cjs');
const crypto = require('crypto');
const { MODE } = require('../editions.cjs');
const { audit } = require('../audit.cjs');
const { SHARE_FIELDS } = require('../cockpit/sharePayload.cjs');
const { callTenant, normalizeInstanceUrl } = require('../cockpit/tenantClient.cjs');

const sha256 = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');
const MAX_METRICS = 500;
const MASKED = '***';
// Pre-R6-2 tenants push without krTemplateId; the cockpit must keep accepting them (FF-6).
const REQUIRED_SHARE_FIELDS = SHARE_FIELDS.filter((f) => f !== 'krTemplateId');
const HISTORY_KEEP = 100;
const HISTORY_SHOWN = 30;

/**
 * Cockpit side of the two channels.
 *
 * Shared metrics (T2-3): push-only — client instances send their allowlist
 * payload with a per-tenant write-only token; the cockpit validates strictly
 * (unknown fields rejected — defense in depth behind FF-4) and lands numeric
 * facts under the tenant's client row.
 *
 * Operator channel (R6-1): the cockpit is where Mediagenix onboards a client,
 * so per tenant it keeps the instance URL and the instance's operator token
 * (ciphertext under `cipher`) and forwards a small, fixed set of management
 * calls — connections, the pinned client's binding, connector agents — with
 * that token. Nothing generic is proxied: every forwarded path is written here.
 * ADR: docs/gpm/state/r6-backlog-2026-09-03.md (ST0).
 */
function createCockpitRouter(db, { cipher } = {}) {
  const router = createRouter();

  const cockpitOnly = (req, res, next) => {
    if (MODE !== 'cockpit') return res.status(403).json({ error: 'cockpit_only' });
    next();
  };

  // ── Tenant registry ──

  const tenantRow = db.prepare(`
    SELECT c.id AS client_id, c.name, t.instance_url, t.operator_token, t.share_token_hash, t.share_minted_at, t.created_at
    FROM clients c LEFT JOIN cockpit_tenants t ON t.client_id = c.id WHERE c.id = ?`);

  const toTenantDTO = (r) => ({
    clientId: r.client_id,
    name: r.name,
    instanceUrl: r.instance_url || '',
    operatorTokenSet: !!r.operator_token,
    shareTokenMintedAt: r.share_minted_at || (r.share_token_hash ? r.created_at : null) || null,
  });

  router.get('/tenants', cockpitOnly, (req, res) => {
    const rows = db.prepare(`
      SELECT c.id AS client_id, c.name, t.instance_url, t.operator_token, t.share_token_hash, t.share_minted_at, t.created_at
      FROM clients c LEFT JOIN cockpit_tenants t ON t.client_id = c.id ORDER BY c.name`).all();
    res.json(rows.map(toTenantDTO));
  });

  // Register (or re-point / rotate) a tenant instance. A masked or absent
  // token keeps the stored one, so the URL can change without re-entering it.
  router.put('/tenants/:clientId', cockpitOnly, (req, res) => {
    const row = tenantRow.get(req.params.clientId);
    if (!row) return res.status(404).json({ error: 'Unknown client' });
    const { instanceUrl: rawUrl, operatorToken } = req.body || {};
    const instanceUrl = rawUrl === undefined ? (row.instance_url || '') : (rawUrl === '' ? '' : normalizeInstanceUrl(rawUrl));
    if (instanceUrl === null) return res.status(400).json({ error: 'instanceUrl must be an http(s) URL' });

    const arrivingSecret = operatorToken && operatorToken !== MASKED;
    if (arrivingSecret && cipher?.unprotected) {
      return res.status(503).json({ error: 'Credential encryption is not configured on this instance. Set BRIDGE_ENCRYPTION_KEY before storing an operator token.' });
    }
    const storedToken = arrivingSecret ? cipher.encrypt(String(operatorToken)) : (row.operator_token || '');

    db.prepare(`INSERT INTO cockpit_tenants (client_id, share_token_hash, instance_url, operator_token) VALUES (?, '', ?, ?)
      ON CONFLICT(client_id) DO UPDATE SET instance_url = excluded.instance_url, operator_token = excluded.operator_token`)
      .run(row.client_id, instanceUrl, storedToken);
    audit(db, req, `${arrivingSecret ? 'Registered' : 'Updated'} tenant instance for '${row.name}'${instanceUrl ? ` at ${instanceUrl}` : ''}`);
    res.json({ ok: true, tenant: toTenantDTO(tenantRow.get(row.client_id)) });
  });

  // Owner mints a per-tenant write-only share token (echoed exactly once)
  router.post('/tenants', cockpitOnly, (req, res) => {
    const { clientId } = req.body || {};
    const client = db.prepare('SELECT id, name FROM clients WHERE id = ?').get(clientId);
    if (!client) return res.status(400).json({ error: 'Unknown client' });

    const token = crypto.randomBytes(32).toString('hex');
    db.prepare(`INSERT INTO cockpit_tenants (client_id, share_token_hash, share_minted_at) VALUES (?, ?, datetime('now'))
      ON CONFLICT(client_id) DO UPDATE SET share_token_hash = excluded.share_token_hash, share_minted_at = excluded.share_minted_at`)
      .run(clientId, sha256(token));
    audit(db, req, `Minted share token for tenant '${client.name}'`);
    res.status(201).json({ ok: true, clientId, token });
  });

  // ── Operator channel: forwarded calls ──

  /** The registered tenant, or the 409 that says why it cannot be reached. */
  function registeredTenant(req, res) {
    const row = tenantRow.get(req.params.clientId);
    if (!row) { res.status(404).json({ error: 'Unknown client' }); return null; }
    if (!row.instance_url || !row.operator_token) {
      res.status(409).json({ error: 'tenant_not_registered', detail: `Register ${row.name}'s instance URL and operator token first.` });
      return null;
    }
    let operatorToken;
    try { operatorToken = cipher.decrypt(row.operator_token); }
    catch (err) {
      res.status(409).json({ error: 'operator_token_unreadable', detail: `The stored operator token cannot be read with this cockpit's key (${err.message}). Re-enter it.` });
      return null;
    }
    return { clientId: row.client_id, name: row.name, instanceUrl: row.instance_url, operatorToken };
  }

  /** Forward one call; the tenant's status and body come back as they are. */
  async function forward(req, res, method, path, body) {
    const tenant = registeredTenant(req, res);
    if (!tenant) return;
    try {
      const { status, body: out } = await callTenant(tenant, method, path, body);
      res.status(status).json(out);
    } catch (err) {
      res.status(502).json({ error: 'tenant_unreachable', detail: `${tenant.name} at ${tenant.instanceUrl}: ${err.name === 'AbortError' ? 'no answer within 10 s' : err.message}` });
    }
  }

  /** The tenant's pinned client row (client instances hold exactly one). */
  async function pinnedClient(tenant) {
    const { status, body } = await callTenant(tenant, 'GET', '/api/clients');
    if (status !== 200 || !Array.isArray(body) || body.length === 0) {
      return { error: { status: status === 200 ? 409 : status, body: status === 200 ? { error: 'tenant_has_no_client', detail: 'The instance has no client row — provisioning seeds it.' } : body } };
    }
    return { client: body[0] };
  }

  router.get('/tenants/:clientId/status', cockpitOnly, async (req, res) => {
    const tenant = registeredTenant(req, res);
    if (!tenant) return;
    const out = { reachable: false, version: null, mode: null, operatorAccepted: false, client: null, detail: null };
    try {
      const health = await callTenant({ instanceUrl: tenant.instanceUrl }, 'GET', '/api/health', undefined, { timeoutMs: 5000 });
      out.reachable = health.status === 200;
      out.version = health.body?.version || null;
      out.mode = health.body?.mode || null;
      if (out.reachable) {
        const probe = await callTenant(tenant, 'GET', '/api/clients');
        out.operatorAccepted = probe.status === 200;
        if (probe.status === 200 && Array.isArray(probe.body)) out.client = probe.body[0] || null;
        else out.detail = probe.body?.error || `HTTP ${probe.status}`;
      }
    } catch (err) {
      out.detail = err.name === 'AbortError' ? 'no answer within 5 s' : err.message;
    }
    res.json(out);
  });

  router.get('/tenants/:clientId/connections', cockpitOnly, (req, res) => forward(req, res, 'GET', '/api/connections'));
  router.post('/tenants/:clientId/connections', cockpitOnly, (req, res) => forward(req, res, 'POST', '/api/connections', req.body));
  router.delete('/tenants/:clientId/connections/:connectionId', cockpitOnly,
    (req, res) => forward(req, res, 'DELETE', `/api/connections/${encodeURIComponent(req.params.connectionId)}`));
  router.post('/tenants/:clientId/test-connection', cockpitOnly, (req, res) => forward(req, res, 'POST', '/api/test-connection', req.body));

  // Bind (or change) the WHATS'ON connection of the tenant's pinned client.
  router.put('/tenants/:clientId/binding', cockpitOnly, async (req, res) => {
    const tenant = registeredTenant(req, res);
    if (!tenant) return;
    const connectionId = String(req.body?.connectionId ?? '');
    try {
      const found = await pinnedClient(tenant);
      if (found.error) return res.status(found.error.status).json(found.error.body);
      const client = found.client;
      const changed = client.connectionId !== connectionId;
      const next = { ...client, connectionId, channels: changed ? [] : client.channels };
      const put = await callTenant(tenant, 'PUT', `/api/clients/${encodeURIComponent(client.id)}`, next);
      if (put.status !== 200) return res.status(put.status).json(put.body);
      audit(db, req, `Bound connection '${connectionId || '(none)'}' on tenant '${tenant.name}'`);
      res.json({ ok: true, client: next });
    } catch (err) {
      res.status(502).json({ error: 'tenant_unreachable', detail: `${tenant.name} at ${tenant.instanceUrl}: ${err.message}` });
    }
  });

  // Pull the channel list from the bound database and store it on the client.
  router.post('/tenants/:clientId/channels', cockpitOnly, async (req, res) => {
    const tenant = registeredTenant(req, res);
    if (!tenant) return;
    try {
      const found = await pinnedClient(tenant);
      if (found.error) return res.status(found.error.status).json(found.error.body);
      const client = found.client;
      if (!client.connectionId) return res.status(409).json({ error: 'no_connection_bound', detail: 'Bind a connection first.' });
      const pulled = await callTenant(tenant, 'POST', '/api/channels', { connectionId: client.connectionId });
      if (pulled.status !== 200) return res.status(pulled.status).json(pulled.body);
      const channels = Array.isArray(pulled.body) ? pulled.body : [];
      const put = await callTenant(tenant, 'PUT', `/api/clients/${encodeURIComponent(client.id)}`, { ...client, channels });
      if (put.status !== 200) return res.status(put.status).json(put.body);
      res.json({ ok: true, channels });
    } catch (err) {
      res.status(502).json({ error: 'tenant_unreachable', detail: `${tenant.name} at ${tenant.instanceUrl}: ${err.message}` });
    }
  });

  router.get('/tenants/:clientId/agents', cockpitOnly, (req, res) => forward(req, res, 'GET', '/api/agents'));
  router.post('/tenants/:clientId/agents/enrol-token', cockpitOnly, (req, res) => forward(req, res, 'POST', '/api/agents/enrol-token', {}));
  router.delete('/tenants/:clientId/agents/:agentId', cockpitOnly,
    (req, res) => forward(req, res, 'DELETE', `/api/agents/${encodeURIComponent(req.params.agentId)}`));

  // ── Shared metrics: machine endpoint — authenticated by the share token, not a session ──

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
      const keys = Object.keys(m);
      if (!keys.every((k) => SHARE_FIELDS.includes(k))
        || !REQUIRED_SHARE_FIELDS.every((k) => keys.includes(k))
        || typeof m.krId !== 'string'
        || typeof m.value !== 'number' || !Number.isFinite(m.value)
        || typeof m.target !== 'number' || !Number.isFinite(m.target)
        || (m.direction !== 'hi' && m.direction !== 'lo')
        || typeof m.timestamp !== 'string'
        || (m.krTemplateId !== undefined && m.krTemplateId !== null && typeof m.krTemplateId !== 'string')) {
        audit(db, req, `Rejected out-of-contract metric from '${tenant.name}'`);
        return res.status(400).json({ error: 'Metric outside the sharing contract' });
      }
    }

    const upsert = db.prepare(`INSERT INTO shared_metrics (tenant_client_id, kr_id, value, target, direction, timestamp, received_at, kr_template_id)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'), ?)
      ON CONFLICT(tenant_client_id, kr_id) DO UPDATE SET
        value = excluded.value, target = excluded.target, direction = excluded.direction,
        timestamp = excluded.timestamp, received_at = excluded.received_at, kr_template_id = excluded.kr_template_id`);
    // History-lite (R6-2): one point per distinct tenant timestamp, newest 100 kept.
    const addPoint = db.prepare(`INSERT OR IGNORE INTO shared_metric_history (tenant_client_id, kr_id, value, target, timestamp) VALUES (?, ?, ?, ?, ?)`);
    const prune = db.prepare(`DELETE FROM shared_metric_history WHERE tenant_client_id = ? AND kr_id = ? AND timestamp NOT IN (
      SELECT timestamp FROM shared_metric_history WHERE tenant_client_id = ? AND kr_id = ? ORDER BY timestamp DESC LIMIT ${HISTORY_KEEP})`);
    db.transaction(() => {
      for (const m of body.metrics) {
        upsert.run(tenant.client_id, m.krId, m.value, m.target, m.direction, m.timestamp, m.krTemplateId || null);
        addPoint.run(tenant.client_id, m.krId, m.value, m.target, m.timestamp);
        prune.run(tenant.client_id, m.krId, tenant.client_id, m.krId);
      }
    })();
    res.json({ ok: true, received: body.metrics.length });
  });

  // Fleet view (session-authenticated like every other GET). Each metric
  // carries its template id, the cockpit-side label resolved for it (by
  // template across tenants, else by tenant+KR), and the last points.
  router.get('/metrics', cockpitOnly, (req, res) => {
    const rows = db.prepare(`
      SELECT m.tenant_client_id, c.name AS tenant_name, c.color,
             m.kr_id, m.kr_template_id, m.value, m.target, m.direction, m.timestamp, m.received_at
      FROM shared_metrics m JOIN clients c ON c.id = m.tenant_client_id
      ORDER BY c.name, m.kr_id
    `).all();
    const labels = new Map(db.prepare('SELECT key, label FROM fleet_labels').all().map((r) => [r.key, r.label]));
    const points = db.prepare(`SELECT value, target, timestamp FROM shared_metric_history
      WHERE tenant_client_id = ? AND kr_id = ? ORDER BY timestamp DESC LIMIT ${HISTORY_SHOWN}`);

    const byTenant = new Map();
    for (const r of rows) {
      if (!byTenant.has(r.tenant_client_id)) {
        byTenant.set(r.tenant_client_id, { tenantId: r.tenant_client_id, tenantName: r.tenant_name, color: r.color, metrics: [] });
      }
      const label = (r.kr_template_id && labels.get(`tpl:${r.kr_template_id}`))
        || labels.get(`kr:${r.tenant_client_id}:${r.kr_id}`) || null;
      byTenant.get(r.tenant_client_id).metrics.push({
        krId: r.kr_id, krTemplateId: r.kr_template_id || null, label,
        value: r.value, target: r.target,
        direction: r.direction, timestamp: r.timestamp, receivedAt: r.received_at,
        history: points.all(r.tenant_client_id, r.kr_id).reverse(),
      });
    }
    res.json([...byTenant.values()]);
  });

  // Column labels for the fleet board — Mediagenix's own words, never the
  // tenant's. 'tpl:<krTemplateId>' names a column across tenants;
  // 'kr:<tenantClientId>:<krId>' names one hand-made KR. Empty label deletes.
  router.put('/fleet-labels/:key', cockpitOnly, (req, res) => {
    const key = String(req.params.key || '');
    if (!/^(tpl:[^:]+|kr:[^:]+:[^:]+)$/.test(key)) return res.status(400).json({ error: 'key must be tpl:<krTemplateId> or kr:<tenantClientId>:<krId>' });
    const label = String(req.body?.label ?? '').trim().slice(0, 80);
    if (!label) {
      db.prepare('DELETE FROM fleet_labels WHERE key = ?').run(key);
    } else {
      db.prepare(`INSERT INTO fleet_labels (key, label, updated_at) VALUES (?, ?, datetime('now'))
        ON CONFLICT(key) DO UPDATE SET label = excluded.label, updated_at = excluded.updated_at`).run(key, label);
    }
    audit(db, req, label ? `Labelled fleet column ${key} as '${label}'` : `Cleared fleet column label ${key}`);
    res.json({ ok: true, key, label: label || null });
  });

  return router;
}

module.exports = { createCockpitRouter };
