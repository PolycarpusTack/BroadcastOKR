const { createRouter } = require('../utils/router.cjs');
const crypto = require('crypto');
const { audit } = require('../audit.cjs');
const { applySyncedValue } = require('../liveSync.cjs');
const { capViolation } = require('../entitlements.cjs');

const sha256 = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');
const ENROL_TTL_MS = 15 * 60 * 1000;
const MAX_RESULTS = 500;

/**
 * Connector-agent identity and ingest (v1 trust model, recorded in the Tier 2
 * assumptions): one-time enrolment token → per-agent revocable bearer token
 * (stored hashed), outbound-only pushes, scalar-only payloads. The cloud never
 * sends the agent SQL or commands — its queries live in its local config.
 *
 * /api/agents/* = operator surface (session + RBAC).
 * /api/agent/*  = machine surface (agent-token auth, session middleware skips it).
 */
function createAgentRouters(db) {
  const ops = createRouter();
  const machine = createRouter();

  // ── Operator surface ──

  ops.post('/enrol-token', (req, res) => {
    // Agents cap (R3): counts enrolled, unrevoked agents; a token is the promise of one more
    const active = db.prepare('SELECT COUNT(*) AS c FROM agents WHERE revoked_at IS NULL').get().c;
    const overCap = capViolation('agents', active + 1);
    if (overCap) return res.status(403).json(overCap);
    const token = crypto.randomBytes(24).toString('hex');
    db.prepare('INSERT INTO agent_enrol_tokens (token_hash, expires_at) VALUES (?, ?)')
      .run(sha256(token), new Date(Date.now() + ENROL_TTL_MS).toISOString());
    audit(db, req, 'Minted an agent enrolment token');
    res.status(201).json({ ok: true, token, expiresInMinutes: ENROL_TTL_MS / 60000 });
  });

  ops.get('/', (req, res) => {
    const rows = db.prepare('SELECT id, name, created_at, revoked_at, last_seen_at FROM agents ORDER BY created_at').all();
    res.json(rows.map((r) => ({
      id: r.id, name: r.name, createdAt: r.created_at,
      revoked: !!r.revoked_at, lastSeenAt: r.last_seen_at || undefined,
    })));
  });

  ops.delete('/:id', (req, res) => {
    const agent = db.prepare('SELECT id, name FROM agents WHERE id = ?').get(req.params.id);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    db.prepare("UPDATE agents SET revoked_at = datetime('now') WHERE id = ?").run(req.params.id);
    audit(db, req, `Revoked agent '${agent.name}'`);
    res.json({ ok: true });
  });

  // ── Machine surface ──

  machine.post('/enroll', (req, res) => {
    const { token, name } = req.body || {};
    if (!token || !name) return res.status(400).json({ error: 'token and name required' });

    const row = db.prepare('SELECT token_hash, expires_at, used_at FROM agent_enrol_tokens WHERE token_hash = ?')
      .get(sha256(token));
    if (!row || row.used_at || row.expires_at < new Date().toISOString()) {
      return res.status(401).json({ error: 'Invalid or expired enrolment token' });
    }
    db.prepare("UPDATE agent_enrol_tokens SET used_at = datetime('now') WHERE token_hash = ?").run(row.token_hash);

    const agentId = `agent_${crypto.randomBytes(6).toString('hex')}`;
    const agentToken = crypto.randomBytes(48).toString('hex');
    db.prepare('INSERT INTO agents (id, name, token_hash) VALUES (?, ?, ?)')
      .run(agentId, String(name), sha256(agentToken));
    audit(db, req, `Agent '${name}' enrolled as ${agentId}`);
    res.status(201).json({ ok: true, agentId, agentToken });
  });

  function requireAgent(req, res) {
    const token = req.headers['x-agent-token'];
    const agent = token
      ? db.prepare('SELECT id, name, revoked_at FROM agents WHERE token_hash = ?').get(sha256(token))
      : null;
    if (!agent || agent.revoked_at) {
      res.status(401).json({ error: 'Invalid or revoked agent token' });
      return null;
    }
    db.prepare("UPDATE agents SET last_seen_at = datetime('now') WHERE id = ?").run(agent.id);
    return agent;
  }

  machine.post('/ingest', (req, res) => {
    const agent = requireAgent(req, res);
    if (!agent) return;

    const { results } = req.body || {};
    if (!Array.isArray(results) || results.length === 0 || results.length > MAX_RESULTS) {
      return res.status(400).json({ error: 'results array required' });
    }
    for (const r of results) {
      const keys = Object.keys(r).sort();
      if (JSON.stringify(keys) !== JSON.stringify(['krId', 'timestamp', 'value'])
        || typeof r.krId !== 'string'
        || typeof r.value !== 'number' || !Number.isFinite(r.value)
        || typeof r.timestamp !== 'string') {
        audit(db, req, `Rejected out-of-contract ingest from agent '${agent.name}'`);
        return res.status(400).json({ error: 'Only {krId, value:number, timestamp} may be ingested' });
      }
    }

    const findKR = db.prepare(`
      SELECT kr.id, g.id AS goal_id, g.monitor_until, g.client_ids
      FROM key_results kr JOIN goals g ON g.id = kr.goal_id WHERE kr.id = ?`);
    let applied = 0;
    const unknown = [];
    const touchedGoals = new Set();
    for (const r of results) {
      const kr = findKR.get(r.krId);
      if (!kr) { unknown.push(r.krId); continue; }
      applySyncedValue(db, kr, r.value, r.timestamp);
      touchedGoals.add(kr.goal_id);
      applied++;
    }
    for (const goalId of touchedGoals) {
      db.prepare("UPDATE goals SET updated_at = datetime('now') WHERE id = ?").run(goalId);
    }

    // One line per accepted push, so the tenant's log shows the agent is alive (finding 23).
    console.log(`  [agent] ${agent.name}: applied ${applied} value(s)${unknown.length ? `, unknown KR ids: ${unknown.join(', ')}` : ''}`);
    res.json({ ok: true, applied, unknown });
  });

  return { ops, machine };
}

module.exports = { createAgentRouters };
