const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const express = require('express');
const { createDB } = require('../db/connection.cjs');
const { runMigrations } = require('../db/migrate.cjs');
const { createGoalsRouter } = require('../routes/goals.cjs');
const { createTasksRouter } = require('../routes/tasks.cjs');

// ADR-B1 (F7): a failure AFTER the parent row was written must roll the
// parent back too. Every input path is validated up front, so the only way to
// reach that failure is to inject it: the db handed to the routers throws on
// demand from the first statement of the nested write.

function faultyDb(real, shouldThrow) {
  return new Proxy(real, {
    get(target, prop, receiver) {
      if (prop === 'prepare') {
        return (sql) => {
          if (shouldThrow(sql)) throw new Error(`injected failure on: ${sql.slice(0, 40)}`);
          return target.prepare(sql);
        };
      }
      const v = Reflect.get(target, prop, receiver);
      return typeof v === 'function' ? v.bind(target) : v;
    },
  });
}

describe('aggregate writes are atomic (F7, injected late failure)', () => {
  let db;
  let server;
  let base;
  let armed = null;

  beforeEach(async () => {
    db = createDB(':memory:');
    runMigrations(db, path.join(__dirname, '..', 'migrations'));
    db.prepare('INSERT INTO users (id, name, role, av, color, dept, title) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(1, 'Alice', 'owner', 'A', '#3805E3', 'Eng', 'Dev');
    const proxied = faultyDb(db, (sql) => armed && sql.includes(armed));
    const app = express();
    app.use(express.json());
    app.use('/api/goals', createGoalsRouter(proxied));
    app.use('/api/tasks', createTasksRouter(proxied));
    // eslint-disable-next-line no-unused-vars
    app.use((err, req, res, _next) => res.status(500).json({ error: String(err.message) }));
    await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
    base = `http://127.0.0.1:${server.address().port}`;
  });

  afterEach(async () => {
    armed = null;
    await new Promise((resolve) => server.close(resolve));
    db.close();
  });

  const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const goal = (over = {}) => ({
    id: 'g1', title: 'Goal', status: 'behind', progress: 0, owner: 1, channel: 0, period: 'Q3',
    keyResults: [{ id: 'kr1', title: 'KR', start: 0, target: 100, current: 0, progress: 0, status: 'behind' }],
    ...over,
  });
  const snapshot = () => ({
    goals: db.prepare('SELECT id, title, version, updated_at FROM goals ORDER BY id').all(),
    krs: db.prepare('SELECT id, goal_id, title, target_val FROM key_results ORDER BY id').all(),
    history: db.prepare('SELECT COUNT(*) AS c FROM kr_history').get().c,
    tasks: db.prepare('SELECT id, title, version FROM tasks ORDER BY id').all(),
    subtasks: db.prepare('SELECT task_id, text, done, sort_order FROM subtasks ORDER BY task_id, sort_order').all(),
    ops: db.prepare('SELECT COUNT(*) AS c FROM checkin_operations').get().c,
  });

  it('goal create: a KR insert failure leaves no goal row behind', async () => {
    armed = 'INSERT INTO key_results';
    const res = await fetch(`${base}/api/goals`, json('POST', goal()));
    assert.equal(res.status, 500);
    assert.deepEqual(snapshot().goals, []);
    assert.deepEqual(snapshot().krs, []);
  });

  it('goal update: a KR upsert failure restores title, version and updated_at', async () => {
    assert.equal((await fetch(`${base}/api/goals`, json('POST', goal()))).status, 201);
    const before = snapshot();
    armed = 'INSERT INTO key_results';
    const res = await fetch(`${base}/api/goals/g1`, json('PUT', goal({ title: 'Half written', version: 0, keyResults: [{ id: 'kr1', title: 'KR2', start: 0, target: 200, current: 0, progress: 0, status: 'behind' }] })));
    assert.equal(res.status, 500);
    assert.deepEqual(snapshot(), before);
    armed = null;
    const ok = await fetch(`${base}/api/goals/g1`, json('PUT', goal({ title: 'Whole', version: 0, keyResults: [{ id: 'kr1', title: 'KR2', start: 0, target: 200, current: 0, progress: 0, status: 'behind' }] })));
    assert.equal(ok.status, 200);
    assert.equal(snapshot().goals[0].title, 'Whole');
    assert.equal(snapshot().krs[0].target_val, 200);
  });

  it('check-in: a failure after the history row is written rolls back history, value, version and the operation record', async () => {
    assert.equal((await fetch(`${base}/api/goals`, json('POST', goal()))).status, 201);
    const before = snapshot();
    armed = 'UPDATE goals SET version = version + 1';
    const res = await fetch(`${base}/api/goals/g1/check-in`, json('POST', { krId: 'kr1', value: 42, actor: 'alice', operationId: 'op-x' }));
    assert.equal(res.status, 500);
    assert.deepEqual(snapshot(), before);
    assert.equal(db.prepare('SELECT current_val FROM key_results WHERE id = ?').get('kr1').current_val, 0);
    armed = null;
    const ok = await fetch(`${base}/api/goals/g1/check-in`, json('POST', { krId: 'kr1', value: 42, actor: 'alice', operationId: 'op-x' }));
    assert.equal(ok.status, 200);
    assert.equal((await ok.json()).replayed, undefined, 'the failed attempt left no operation record to replay');
    assert.equal(snapshot().history, 1);
    assert.equal(snapshot().ops, 1);
  });

  it('task update: a subtask rewrite failure restores the parent and the old subtasks', async () => {
    const task = { id: 't1', title: 'Task', status: 'todo', priority: 'medium', assignee: 1, channel: 0, due: '2026-09-10', taskType: 'task', subtasks: [{ text: 'a', done: false }] };
    assert.equal((await fetch(`${base}/api/tasks`, json('POST', task))).status, 201);
    const before = snapshot();
    armed = 'INSERT INTO subtasks';
    const res = await fetch(`${base}/api/tasks/t1`, json('PUT', { ...task, title: 'Half', version: 0, subtasks: [{ text: 'b', done: true }] }));
    assert.equal(res.status, 500);
    assert.deepEqual(snapshot(), before, 'the DELETE of the old subtasks was rolled back with the parent');
  });
});
