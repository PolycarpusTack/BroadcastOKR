process.env.BRIDGE_MODE = 'cockpit';
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const crypto = require('crypto');
const path = require('path');
const { createDB } = require('../db/connection.cjs');
const { runMigrations } = require('../db/migrate.cjs');
const { createCockpitRouter } = require('../routes/cockpit.cjs');
const { SHARE_FIELDS } = require('../cockpit/sharePayload.cjs');

// R6-2: the cockpit keeps a history per shared metric, knows the template KR
// a metric came from (an id, not a title), resolves a label per column, and
// still accepts the pre-R6-2 payload shape (FF-6: additive).

const sha256 = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');
const TOKEN = 'share-token';

function buildApp() {
  const db = createDB(':memory:');
  runMigrations(db, path.join(__dirname, '..', 'migrations'));
  db.prepare("INSERT INTO clients (id, name, connection_id, color) VALUES ('t0', 'Tenant Zero', '', '#000')").run();
  db.prepare("INSERT INTO clients (id, name, connection_id, color) VALUES ('t1', 'Tenant One', '', '#111')").run();
  db.prepare("INSERT INTO cockpit_tenants (client_id, share_token_hash) VALUES ('t0', ?)").run(sha256(TOKEN));
  db.prepare("INSERT INTO cockpit_tenants (client_id, share_token_hash) VALUES ('t1', ?)").run(sha256(`${TOKEN}-1`));
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { id: 1, role: 'owner' }; next(); });
  app.use('/api/cockpit', createCockpitRouter(db, { cipher: { encrypt: (v) => v, decrypt: (v) => v, unprotected: false } }));
  return { app, db };
}

async function withServer(app, fn) {
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  try { return await fn(`http://127.0.0.1:${server.address().port}`); } finally { server.close(); }
}
const json = (method, body, extra = {}) => ({ method, headers: { 'Content-Type': 'application/json', ...extra }, body: JSON.stringify(body) });
const metric = (extra = {}) => ({ krId: 'kr1', value: 10, target: 100, direction: 'hi', timestamp: '2026-09-04T10:00:00Z', krTemplateId: 'krt-fill', ...extra });

describe('fleet board: history, template ids, labels', () => {
  let app;
  let db;
  beforeEach(() => { ({ app, db } = buildApp()); });
  afterEach(() => db.close());

  it('the allowlist carries krTemplateId and nothing textual', () => {
    assert.deepEqual([...SHARE_FIELDS].sort(), ['direction', 'krId', 'krTemplateId', 'target', 'timestamp', 'value']);
  });

  it('keeps a history per metric, latest first in shared_metrics, and prunes to 100', async () => {
    await withServer(app, async (base) => {
      for (let i = 0; i < 105; i++) {
        const res = await fetch(`${base}/api/cockpit/ingest`, json('POST', {
          protocol: 1, metrics: [metric({ value: i, timestamp: `2026-09-04T${String(10 + Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00Z` })],
        }, { 'X-Share-Token': TOKEN }));
        assert.equal(res.status, 200);
      }
      // A re-push with the same timestamp is not a new history point
      await fetch(`${base}/api/cockpit/ingest`, json('POST', { protocol: 1, metrics: [metric({ value: 104, timestamp: '2026-09-04T11:44:00Z' })] }, { 'X-Share-Token': TOKEN }));

      const rows = db.prepare('SELECT COUNT(*) AS c FROM shared_metric_history WHERE kr_id = ?').get('kr1').c;
      assert.equal(rows, 100, 'pruned to the newest 100');
      const fleet = await (await fetch(`${base}/api/cockpit/metrics`)).json();
      const m = fleet[0].metrics[0];
      assert.equal(m.value, 104);
      assert.equal(m.krTemplateId, 'krt-fill');
      assert.equal(m.history.length, 30, 'the board gets the last 30 points');
      assert.deepEqual(m.history[m.history.length - 1], { value: 104, target: 100, timestamp: '2026-09-04T11:44:00Z' });
      assert.ok(m.history[0].timestamp < m.history[1].timestamp, 'oldest first');
    });
  });

  it('still accepts the pre-R6-2 payload (no krTemplateId) and rejects unknown fields', async () => {
    await withServer(app, async (base) => {
      const old = { krId: 'kr-old', value: 1, target: 2, direction: 'lo', timestamp: '2026-09-04T10:00:00Z' };
      assert.equal((await fetch(`${base}/api/cockpit/ingest`, json('POST', { protocol: 1, metrics: [old] }, { 'X-Share-Token': TOKEN }))).status, 200);
      assert.equal((await fetch(`${base}/api/cockpit/ingest`, json('POST', { protocol: 1, metrics: [{ ...old, title: 'smuggled' }] }, { 'X-Share-Token': TOKEN }))).status, 400);
      assert.equal((await fetch(`${base}/api/cockpit/ingest`, json('POST', { protocol: 1, metrics: [{ ...old, krTemplateId: 7 }] }, { 'X-Share-Token': TOKEN }))).status, 400);
      const fleet = await (await fetch(`${base}/api/cockpit/metrics`)).json();
      assert.equal(fleet[0].metrics[0].krTemplateId, null);
    });
  });

  it('labels resolve by template id across tenants, then by tenant+kr, else null; an empty label deletes', async () => {
    await withServer(app, async (base) => {
      await fetch(`${base}/api/cockpit/ingest`, json('POST', { protocol: 1, metrics: [metric()] }, { 'X-Share-Token': TOKEN }));
      await fetch(`${base}/api/cockpit/ingest`, json('POST', { protocol: 1, metrics: [metric({ krId: 'kr9' }), metric({ krId: 'kr-hand', krTemplateId: null })] }, { 'X-Share-Token': `${TOKEN}-1` }));

      const bad = await fetch(`${base}/api/cockpit/fleet-labels/nonsense`, json('PUT', { label: 'x' }));
      assert.equal(bad.status, 400);
      assert.equal((await fetch(`${base}/api/cockpit/fleet-labels/tpl:krt-fill`, json('PUT', { label: 'Schedule fill rate' }))).status, 200);
      assert.equal((await fetch(`${base}/api/cockpit/fleet-labels/kr:t1:kr-hand`, json('PUT', { label: 'Hand-made on One' }))).status, 200);

      let fleet = await (await fetch(`${base}/api/cockpit/metrics`)).json();
      const byTenant = Object.fromEntries(fleet.map((t) => [t.tenantId, t.metrics]));
      assert.equal(byTenant.t0[0].label, 'Schedule fill rate');
      assert.equal(byTenant.t1.find((m) => m.krId === 'kr9').label, 'Schedule fill rate', 'one label for the column across tenants');
      assert.equal(byTenant.t1.find((m) => m.krId === 'kr-hand').label, 'Hand-made on One');

      await fetch(`${base}/api/cockpit/fleet-labels/kr:t1:kr-hand`, json('PUT', { label: '' }));
      fleet = await (await fetch(`${base}/api/cockpit/metrics`)).json();
      assert.equal(fleet.find((t) => t.tenantId === 't1').metrics.find((m) => m.krId === 'kr-hand').label, null);
    });
  });
});
