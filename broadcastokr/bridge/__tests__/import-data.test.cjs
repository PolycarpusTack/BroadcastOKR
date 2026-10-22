const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const express = require('express');
const { createDB } = require('../db/connection.cjs');
const { runMigrations } = require('../db/migrate.cjs');
const { createImporter } = require('../importData.cjs');
const { createSyncRouter } = require('../routes/sync.cjs');
const { readState } = require('../routes/sync-helpers.cjs');
const { createRbacMiddleware } = require('../middleware/rbac.cjs');

const goal = { id: 'g-import', title: 'Imported goal', status: 'behind', progress: 0, owner: 1, channel: 0, period: 'Q4 2026',
  templateId: 'tpl-import', clientIds: ['c-import'], keyResults: [
    { id: 'kr-import', title: 'Readiness', start: 0, target: 100, current: 25, progress: 0.25, status: 'behind', history: [
      { timestamp: '2026-10-21T10:00:00.000Z', value: 25, actor: 'Historical actor', source: 'check-in', note: 'First reading' },
    ] },
  ] };
const task = { id: 't-import', title: 'Imported task', status: 'todo', priority: 'medium', assignee: 1, channel: 0, due: '', taskType: 'task', goalId: 'g-import', subtasks: [{ text: 'Verify', done: true }] };
const client = { id: 'c-import', name: 'Imported client', connectionId: '', color: '#123456', channels: [] };
const template = { id: 'tpl-import', title: 'Template', category: 'Custom', period: 'Q4 2026', krTemplates: [
  { id: 'krt-import', title: 'Readiness', sql: 'SELECT 1', unit: 'count', direction: 'hi', start: 0, target: 100 },
] };
const kpi = { name: 'Imported KPI', unit: '%', direction: 'hi', target: 95, current: 90, trend: [80, 90] };
const data = () => structuredClone({ goals: [goal], tasks: [task], clients: [client], goalTemplates: [template], kpis: [kpi] });
const request = (rows = data(), extra = {}) => ({ operationId: 'import-test', mode: 'append', data: rows, ...extra });

describe('transactional import (real SQLite and HTTP routes)', () => {
  let db, server, base;
  beforeEach(async () => {
    db = createDB(':memory:');
    runMigrations(db, path.join(__dirname, '..', 'migrations'));
    db.prepare("INSERT INTO users (id,name,role) VALUES (1,'Owner','owner')").run();
    const app = express();
    app.use(express.json());
    // Only the test harness supplies a principal; production uses session authentication.
    app.use((req, _res, next) => {
      if (req.headers['x-test-role']) req.user = { id: 1, role: req.headers['x-test-role'] };
      if (req.headers['x-test-operator']) req.user = { operator: true };
      next();
    });
    app.use(createRbacMiddleware({ mode: 'client', db }));
    app.use('/api/sync', createSyncRouter(db));
    app.use((_err, _req, res, _next) => res.status(500).json({ error: 'Import failed' }));
    server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  });
  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve));
    db.close();
  });
  const post = (base, body, role = 'owner', endpoint = '/api/sync/import') => fetch(`${base}${endpoint}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-test-role': role }, body: JSON.stringify(body),
  });

  it('persists every category, children and history across a fresh state request', async () => {
    const res = await post(base, request());
    assert.equal(res.status, 200);
    const result = await res.json();
    assert.deepEqual(result.counts, { clients: 1, goalTemplates: 1, goals: 1, tasks: 1, kpis: 1 });
    const reload = await (await fetch(`${base}/api/sync/state`, { headers: { 'x-test-role': 'owner' } })).json();
    assert.equal(reload.goals[0].keyResults[0].history[0].note, 'First reading');
    assert.equal(reload.tasks[0].subtasks[0].done, true);
    assert.equal(reload.clients[0].name, 'Imported client');
    assert.equal(reload.goalTemplates[0].krTemplates[0].sql, 'SELECT 1');
    assert.deepEqual(reload.kpis[0].trend, [80, 90]);
  });

  it('rolls back earlier categories and deletion markers after a late storage failure', async () => {
    createImporter(db)(request(), {});
    const before = readState(db);
    db.exec("CREATE TRIGGER import_fault BEFORE INSERT ON tasks BEGIN SELECT RAISE(ABORT, 'injected failure'); END");
    const replacement = { ...task, id: 'replacement-task' };
    const res = await post(base, request({ goals: [{ ...goal, title: 'Must roll back' }], tasks: [replacement] }, { mode: 'replace', operationId: 'late-failure' }));
    assert.equal(res.status, 500);
    const after = readState(db);
    assert.deepEqual({ ...after, timestamp: null }, { ...before, timestamp: null });
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM sync_deletions').get().c, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS c FROM import_operations WHERE operation_id='late-failure'").get().c, 0);
  });

  it('replays a lost response without applying replace twice or incrementing the version twice', async () => {
    createImporter(db)(request(), {});
    const replacement = request({ goals: [{ ...goal, title: 'Replaced' }] }, { mode: 'replace', operationId: 'replace-once' });
    assert.equal((await post(base, replacement)).status, 200);
    assert.equal((await post(base, replacement)).status, 200);
    assert.equal(db.prepare("SELECT version FROM goals WHERE id='g-import'").get().version, 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM kr_history').get().c, 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM activity_log').get().c, 2);
  });

  it('rejects reuse of an operation id with a changed payload', async () => {
    assert.equal((await post(base, request())).status, 200);
    const res = await post(base, request({ kpis: [{ ...kpi, current: 10 }] }));
    assert.equal(res.status, 409);
    assert.equal(db.prepare('SELECT current_val FROM kpis').get().current_val, 90);
  });

  it('rejects duplicate append atomically', async () => {
    createImporter(db)(request(), {});
    const res = await post(base, request({ clients: [{ ...client, id: 'new-client' }], goals: [goal] }, { operationId: 'duplicate-append' }));
    assert.equal(res.status, 409);
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM clients').get().c, 1);
  });

  it('rejects an invalid history value before any rows are written', async () => {
    const rows = data();
    rows.goals[0].keyResults[0].history[0].value = null;
    const res = await post(base, request(rows));
    assert.equal(res.status, 400);
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM clients').get().c, 0);
  });

  it('rejects unknown users with an actionable error and leaves no imported rows', async () => {
    const res = await post(base, request({ goals: [{ ...goal, owner: 999, templateId: undefined, clientIds: [] }] }));
    assert.equal(res.status, 400);
    assert.match((await res.json()).detail, /unknown owner/);
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM goals').get().c, 0);
  });

  it('publishes KPI and goal removals to another session while preserving unspecified categories', async () => {
    createImporter(db)(request(), {});
    const res = await post(base, request({ goals: [], kpis: [{ ...kpi, name: 'New KPI' }] }, { mode: 'replace', operationId: 'remove-old' }));
    assert.equal(res.status, 200);
    const changes = await (await fetch(`${base}/api/sync/changes?since=2026-01-01`, { headers: { 'x-test-role': 'member' } })).json();
    assert.deepEqual(changes.deletions.goals, ['g-import']);
    assert.deepEqual(changes.deletions.kpis, ['Imported KPI']);
    const state = readState(db);
    assert.equal(state.clients.length, 1);
    assert.equal(state.tasks[0].goalId, undefined);
  });

  it('does not permit a manager to import around the owner-only boundary', async () => {
    assert.equal((await post(base, request(), 'manager')).status, 403);
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM goals').get().c, 0);
  });
  it('does not permit a member to import', async () => {
    assert.equal((await post(base, request(), 'member')).status, 403);
  });
  it('does not widen the cockpit operator channel', async () => {
    const res = await fetch(`${base}/api/sync/import`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-test-operator': '1' }, body: JSON.stringify(request()) });
    assert.equal(res.status, 403);
  });

  it('cannot import a second client into a pinned instance', () => {
    createImporter(db)(request({ clients: [client] }), {});
    const policy = { isFleetAllowed: false, hasEntitlement: () => true, capViolation: () => null, tier: 'enterprise' };
    assert.throws(() => createImporter(db, policy)(request({ clients: [{ ...client, id: 'other' }] }, { operationId: 'other-client' }), {}), /pinned client/);
  });
  it('enforces template entitlements on the import path', () => {
    const policy = { isFleetAllowed: true, hasEntitlement: () => false, capViolation: () => null, tier: 'starter' };
    assert.throws(() => createImporter(db, policy)(request({ goalTemplates: [template] }), {}), /does not include templates/);
  });
  it('enforces live entitlements on imported goals', () => {
    const policy = { isFleetAllowed: true, hasEntitlement: () => false, capViolation: () => null, tier: 'starter' };
    const live = { ...goal, templateId: undefined, clientIds: [], keyResults: [{ ...goal.keyResults[0], liveConfig: { sql: 'SELECT 1' } }] };
    assert.throws(() => createImporter(db, policy)(request({ goals: [live] }), {}), /does not include liveKRs/);
  });
  it('enforces the channel cap before importing client rows', () => {
    const policy = { isFleetAllowed: true, hasEntitlement: () => true, capViolation: () => ({ detail: 'Channel cap exceeded' }), tier: 'pro' };
    assert.throws(() => createImporter(db, policy)(request({ clients: [client] }), {}), /Channel cap exceeded/);
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM clients').get().c, 0);
  });
  it('cannot enable sharing through an import on a pro instance', () => {
    const policy = { isFleetAllowed: true, hasEntitlement: (f) => f !== 'sharing', capViolation: () => null, tier: 'pro' };
    const shared = { ...goal, templateId: undefined, clientIds: [], keyResults: [{ ...goal.keyResults[0], sharedWithMediagenix: true }] };
    assert.throws(() => createImporter(db, policy)(request({ goals: [shared] }), {}), /does not include sharing/);
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM goals').get().c, 0);
  });
  it('cannot move another goal\'s KR to an imported goal', () => {
    createImporter(db)(request(), {});
    const other = { ...goal, id: 'other-goal' };
    assert.throws(() => createImporter(db)(request({ goals: [other] }, { operationId: 'steal-kr' }), {}), /belongs to another goal/);
    assert.equal(db.prepare("SELECT goal_id FROM key_results WHERE id='kr-import'").get().goal_id, 'g-import');
  });
  it('refuses replacing clients that retained goals still reference', () => {
    createImporter(db)(request(), {});
    assert.throws(() => createImporter(db)(request({ clients: [{ ...client, id: 'other' }] }, { mode: 'replace', operationId: 'orphan-client' }), {}), /still references a client/);
    assert.equal(db.prepare('SELECT id FROM clients').get().id, 'c-import');
  });
});
