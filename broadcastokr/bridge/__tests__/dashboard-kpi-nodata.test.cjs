const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const path = require('path');
const { createDB } = require('../db/connection.cjs');
const { runMigrations } = require('../db/migrate.cjs');
const { createWhatsonRouter } = require('../routes/whatson.cjs');

// Review 2026-10-22: the dashboard KPI routes still turned a SQL NULL into 0
// and wrote that 0 into the KPI history. They now share scalarResult with
// execute-batch: NULL/blank is no_data, a genuine 0 is a measurement.

function buildApp(rows) {
  const db = createDB(':memory:');
  runMigrations(db, path.join(__dirname, '..', 'migrations'));
  const history = {};
  const core = {
    runQuery: async () => rows,
    runQueryWithTimeout: async () => rows,
  };
  const store = {
    loadConfig: () => ({
      connections: [{ id: 'c1', type: 'postgres' }],
      kpiDefinitions: [{ id: 'k1', name: 'KPI', connectionId: 'c1', sql: 'SELECT NULL AS value' }],
    }),
    saveConfig() {},
    loadHistory: () => history,
    saveHistory() {},
  };
  const cipher = { available: true, enforced: false, unprotected: false, encrypt: (v) => v, decrypt: (v) => v };

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { id: 1, role: 'owner' }; next(); });
  app.use('/api', createWhatsonRouter({ db, mode: 'desktop', core, store, cipher }));
  return { app, history };
}

async function call(app, method, url, body) {
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}${url}`, {
      method, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  } finally {
    server.close();
  }
}

describe('dashboard KPI routes keep NULL distinct from zero', () => {
  it('execute answers no_data for a NULL scalar and records no history', async () => {
    const { app, history } = buildApp([{ VALUE: null }]);
    const { body } = await call(app, 'POST', '/api/kpi/execute', { kpiId: 'k1' });
    assert.equal(body.status, 'no_data');
    assert.equal(body.value, undefined);
    assert.equal(history.k1, undefined);
  });

  it('poll reports no_data for a NULL scalar instead of current: 0', async () => {
    const { app, history } = buildApp([{ VALUE: null }]);
    const { body } = await call(app, 'GET', '/api/kpi/poll');
    assert.equal(body[0].status, 'no_data');
    assert.equal(body[0].current, undefined);
    assert.equal(history.k1, undefined);
  });

  it('a genuine zero is still a measurement', async () => {
    const { app, history } = buildApp([{ VALUE: 0 }]);
    const exec = await call(app, 'POST', '/api/kpi/execute', { kpiId: 'k1' });
    assert.equal(exec.body.value, 0);
    const poll = await call(app, 'GET', '/api/kpi/poll');
    assert.equal(poll.body[0].current, 0);
    assert.deepEqual(history.k1.map((h) => h.value), [0, 0]);
  });
});
