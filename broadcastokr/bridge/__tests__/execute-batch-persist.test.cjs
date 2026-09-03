const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const path = require('path');
const { createDB } = require('../db/connection.cjs');
const { runMigrations } = require('../db/migrate.cjs');
const { createWhatsonRouter } = require('../routes/whatson.cjs');

// R1 rig, finding 24: an execute-batch result only ever lived in the browser
// store, so the next change poll handed back the bridge's stale KR row and the
// value vanished. A KR's own query now persists like ingest and the sync loop.

const SQL = 'SELECT 42 AS value FROM DUAL';
const stored = (extra = {}) => ({ goalId: 'g1', krIndex: 0, krId: 'kr1', connectionId: 'c1', sql: SQL, ...extra });

function buildApp(role) {
  const db = createDB(':memory:');
  runMigrations(db, path.join(__dirname, '..', 'migrations'));
  db.prepare('INSERT INTO users (id, name, role, av, color, dept, title) VALUES (1, ?, ?, ?, ?, ?, ?)')
    .run('Alice', 'owner', 'A', '#000', 'E', 'D');
  db.prepare("INSERT INTO goals (id, title, status, progress, owner, channel, period, updated_at) VALUES ('g1', 'G', 'behind', 0, 1, 0, 'Q1', '2000-01-01 00:00:00')").run();
  db.prepare(`INSERT INTO key_results (id, goal_id, title, start_val, target_val, current_val, progress, status, live_config, sync_status, sort_order)
    VALUES ('kr1', 'g1', 'KR', 0, 100, 0, 0, 'behind', ?, 'pending', 0)`)
    .run(JSON.stringify({ connectionId: 'c1', sql: SQL, unit: 'n', direction: 'hi' }));

  const core = {
    executeScalarQuery: async ({ sql }) => (sql.includes('FAIL')
      ? { status: 'error', error: 'boom' }
      : { status: 'ok', current: 42 }),
  };
  const store = { loadConfig: () => ({ connections: [{ id: 'c1', type: 'postgres' }], kpiDefinitions: [] }), saveConfig() {}, loadHistory: () => ({}), saveHistory() {} };
  const cipher = { available: true, enforced: false, unprotected: false, encrypt: (v) => v, decrypt: (v) => v };

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { id: 1, role }; next(); });
  app.use('/api', createWhatsonRouter({ db, mode: 'client', core, store, cipher }));
  return { app, db };
}

async function post(app, body) {
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/kpi/execute-batch`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  } finally {
    server.close();
  }
}

const krRow = (db) => db.prepare('SELECT current_val, sync_status, sync_error, last_sync_at FROM key_results WHERE id = ?').get('kr1');
const goalUpdatedAt = (db) => db.prepare('SELECT updated_at FROM goals WHERE id = ?').get('g1').updated_at;

describe("execute-batch persists a KR's own result", () => {
  it("a manager's stored query lands on the KR row and bumps the goal", async () => {
    const { app, db } = buildApp('manager');
    const { status, body } = await post(app, { queries: [stored()] });
    assert.equal(status, 200);
    assert.equal(body.results[0].status, 'ok');
    assert.equal(body.results[0].current, 42);

    const row = krRow(db);
    assert.equal(row.current_val, 42);
    assert.equal(row.sync_status, 'ok');
    assert.equal(row.sync_error, null);
    assert.ok(row.last_sync_at, 'last_sync_at must be set');
    assert.notEqual(goalUpdatedAt(db), '2000-01-01 00:00:00', 'goal must be bumped for the change poll');
  });

  it("an owner's ad hoc query is answered but never stored", async () => {
    const { app, db } = buildApp('owner');
    const { body } = await post(app, { queries: [stored({ sql: 'SELECT 42 AS value FROM DUAL WHERE 1=1' })] });
    assert.equal(body.results[0].current, 42);

    const row = krRow(db);
    assert.equal(row.current_val, 0);
    assert.equal(row.sync_status, 'pending');
    assert.equal(goalUpdatedAt(db), '2000-01-01 00:00:00');
  });

  it('a failing stored query records the error on the KR, as the sync loop does', async () => {
    const { app, db } = buildApp('owner');
    db.prepare('UPDATE key_results SET live_config = ? WHERE id = ?')
      .run(JSON.stringify({ connectionId: 'c1', sql: 'SELECT FAIL', unit: 'n', direction: 'hi' }), 'kr1');
    const { body } = await post(app, { queries: [stored({ sql: 'SELECT FAIL' })] });
    assert.equal(body.results[0].status, 'error');

    const row = krRow(db);
    assert.equal(row.sync_status, 'error');
    assert.equal(row.sync_error, 'boom');
    assert.equal(row.current_val, 0);
  });
});
