const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const express = require('express');
const { createDB } = require('../db/connection.cjs');
const { runMigrations } = require('../db/migrate.cjs');
const { createAgentRouters, purgeExpiredAgents } = require('../routes/agent.cjs');
const { createRbacMiddleware } = require('../middleware/rbac.cjs');

// ADR 2026-10-22 (R4): revoke keeps the row as the audit trail; purge removes a
// revoked agent explicitly (owner only, never over the operator channel);
// revoked agents older than 30 days are purged automatically.

describe('agent revoke and purge', () => {
  let db, server, base;
  beforeEach(async () => {
    db = createDB(':memory:');
    runMigrations(db, path.join(__dirname, '..', 'migrations'));
    db.prepare("INSERT INTO users (id,name,role) VALUES (1,'Owner','owner')").run();
    db.prepare("INSERT INTO agents (id, name, token_hash) VALUES ('a-live', 'Live site', 'h1')").run();
    db.prepare("INSERT INTO agents (id, name, token_hash, revoked_at) VALUES ('a-old', 'Old site', 'h2', datetime('now', '-31 days'))").run();
    db.prepare("INSERT INTO agents (id, name, token_hash, revoked_at) VALUES ('a-recent', 'Recent site', 'h3', datetime('now', '-2 days'))").run();
    const app = express();
    app.use(express.json());
    // Only the test harness supplies a principal; production uses session authentication.
    app.use((req, _res, next) => {
      if (req.headers['x-test-role']) req.user = { id: 1, role: req.headers['x-test-role'] };
      if (req.headers['x-test-operator']) req.user = { operator: true };
      next();
    });
    app.use(createRbacMiddleware({ mode: 'client', db }));
    app.use('/api/agents', createAgentRouters(db).ops);
    server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  });
  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve));
    db.close();
  });

  const call = (method, p, headers = { 'x-test-role': 'owner' }) => fetch(`${base}${p}`, { method, headers });
  const ids = () => db.prepare('SELECT id FROM agents ORDER BY id').all().map((r) => r.id);
  const log = () => db.prepare('SELECT actor, text FROM activity_log').all();

  it('revoke keeps the row and marks it revoked', async () => {
    assert.equal((await call('DELETE', '/api/agents/a-live')).status, 200);
    const row = db.prepare("SELECT revoked_at FROM agents WHERE id = 'a-live'").get();
    assert.ok(row.revoked_at);
  });

  it('purge removes a revoked agent and audits it', async () => {
    const res = await call('DELETE', '/api/agents/a-recent/purge');
    assert.equal(res.status, 200);
    assert.ok(!ids().includes('a-recent'));
    assert.ok(log().some((l) => l.text === "Purged agent 'Recent site'"));
  });

  it('purge refuses an agent that is still active', async () => {
    const res = await call('DELETE', '/api/agents/a-live/purge');
    assert.equal(res.status, 409);
    assert.equal((await res.json()).error, 'not_revoked');
    assert.ok(ids().includes('a-live'));
  });

  it('purge answers 404 for an unknown agent', async () => {
    assert.equal((await call('DELETE', '/api/agents/nope/purge')).status, 404);
  });

  it('a manager cannot purge', async () => {
    assert.equal((await call('DELETE', '/api/agents/a-recent/purge', { 'x-test-role': 'manager' })).status, 403);
    assert.ok(ids().includes('a-recent'));
  });

  it('the operator channel may revoke but not purge', async () => {
    const op = { 'x-test-operator': '1' };
    assert.equal((await call('DELETE', '/api/agents/a-recent/purge', op)).status, 403);
    assert.ok(ids().includes('a-recent'));
    assert.equal((await call('DELETE', '/api/agents/a-live', op)).status, 200);
  });

  it('reading the list purges agents revoked more than 30 days ago', async () => {
    const body = await (await call('GET', '/api/agents')).json();
    assert.deepEqual(body.map((a) => a.id).sort(), ['a-live', 'a-recent']);
    assert.deepEqual(ids(), ['a-live', 'a-recent']);
    assert.ok(log().some((l) => l.actor === 'system' && l.text === "Purged agent 'Old site' (revoked more than 30 days ago)"));
  });

  it('the startup sweep purges the same and reports the count', () => {
    assert.equal(purgeExpiredAgents(db), 1);
    assert.equal(purgeExpiredAgents(db), 0);
    assert.deepEqual(ids(), ['a-live', 'a-recent']);
  });
});
