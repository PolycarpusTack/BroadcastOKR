const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const path = require('path');
const { createDB } = require('../db/connection.cjs');
const { runMigrations } = require('../db/migrate.cjs');
const { createGoalsRouter } = require('../routes/goals.cjs');
const { runKRSyncOnce } = require('../liveSync.cjs');
const { buildSharePayload } = require('../cockpit/sharePayload.cjs');
const { assembleState } = require('../routes/sync-helpers.cjs');

// R6-5: an archived goal is a closed period's record — round-trips through
// the API and the change poll, is skipped by the bridge-side sync loop, and
// no longer leaves the instance for the cockpit.

const goal = (id, extra = {}) => ({
  id, title: `Goal ${id}`, status: 'behind', progress: 0, owner: 1, channel: 0, period: 'Q2 2026',
  keyResults: [{ id: `${id}-kr`, title: 'Live', start: 0, target: 100, current: 0, progress: 0, status: 'behind',
    liveConfig: { connectionId: 'c1', sql: 'SELECT 1', unit: 'n', direction: 'hi' }, sharedWithMediagenix: true }],
  ...extra,
});

function buildApp() {
  const db = createDB(':memory:');
  runMigrations(db, path.join(__dirname, '..', 'migrations'));
  db.prepare('INSERT INTO users (id, name, role, av, color, dept, title) VALUES (1, ?, ?, ?, ?, ?, ?)').run('Alice', 'owner', 'A', '#000', 'E', 'D');
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { id: 1, role: 'owner' }; next(); });
  app.use('/api/goals', createGoalsRouter(db));
  return { app, db };
}

async function withServer(app, fn) {
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  try { return await fn(`http://127.0.0.1:${server.address().port}`); } finally { server.close(); }
}
const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

describe('period archive', () => {
  let app;
  let db;
  beforeEach(() => { ({ app, db } = buildApp()); });
  afterEach(() => db.close());

  it('round-trips archived through create, update, get and the full-state poll', async () => {
    await withServer(app, async (base) => {
      assert.equal((await fetch(`${base}/api/goals`, json('POST', goal('g-active')))).status, 201);
      assert.equal((await fetch(`${base}/api/goals`, json('POST', goal('g-old', { archived: true })))).status, 201);
      const old = await (await fetch(`${base}/api/goals/g-old`)).json();
      assert.equal(old.archived, true);
      assert.equal((await (await fetch(`${base}/api/goals/g-active`)).json()).archived, false, 'absent means active');

      const restore = await fetch(`${base}/api/goals/g-old`, json('PUT', { ...old, archived: false }));
      assert.equal(restore.status, 200);
      assert.equal((await (await fetch(`${base}/api/goals/g-old`)).json()).archived, false);

      const rows = (t) => db.prepare(`SELECT * FROM ${t}`).all();
      const state = assembleState({ goals: rows('goals'), keyResults: rows('key_results'), krHistory: [], tasks: [], subtasks: [], clients: [], goalTemplates: [], krTemplates: [], users: rows('users'), teams: [], teamMembers: [], kpis: [] });
      assert.deepEqual(state.goals.map((g) => [g.id, g.archived]).sort(), [['g-active', false], ['g-old', false]]);
    });
  });

  it('the sync loop and the share payload skip archived goals', async () => {
    await withServer(app, async (base) => {
      await fetch(`${base}/api/goals`, json('POST', goal('g-active')));
      await fetch(`${base}/api/goals`, json('POST', goal('g-old', { archived: true })));
    });
    const asked = [];
    await runKRSyncOnce(db, { executeQuery: async (q) => { asked.push(q); return { status: 'ok', current: 7 }; } });
    assert.equal(asked.length, 1, 'only the active goal\'s KR is queried');
    assert.equal(db.prepare("SELECT current_val FROM key_results WHERE id = 'g-old-kr'").get().current_val, 0, 'the archived KR is untouched');

    const payload = buildSharePayload(db);
    assert.deepEqual(payload.metrics.map((m) => m.krId), ['g-active-kr']);
  });
});
