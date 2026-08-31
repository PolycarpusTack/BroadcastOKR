const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');

// Optimistic concurrency: PUT carries the version the writer last saw.
// Match → update + version bump (echoed). Mismatch → 409 with the current row.
// No version in the body → legacy last-write-wins (N-1 client compatibility).

const SERVER = path.join(__dirname, '..', 'server.cjs');
const PORT = 4400 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${PORT}`;

const json = (method, body) => ({
  method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

describe('version-checked writes', () => {
  let server;

  before(async () => {
    server = spawn(process.execPath, [SERVER], {
      env: {
        ...process.env,
        BRIDGE_DB_PATH: ':memory:', BRIDGE_PORT: String(PORT),
        BRIDGE_HOST: '127.0.0.1', BRIDGE_API_KEY: '',
      },
      stdio: 'ignore',
    });
    const deadline = Date.now() + 10000;
    for (;;) {
      try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch { /* not up */ }
      if (Date.now() > deadline) throw new Error('bridge did not start');
      await new Promise((r) => setTimeout(r, 200));
    }

    const seed = await fetch(`${BASE}/api/sync/migrate-from-local`, json('POST', {
      users: [{ id: 1, name: 'Alice', role: 'owner', av: 'A', color: '#000', dept: 'E', title: 'D' }],
      goals: [{ id: 'g1', title: 'Goal', status: 'behind', progress: 0, owner: 1, channel: 0, period: 'Q1', keyResults: [] }],
      tasks: [{ id: 't1', title: 'Task', status: 'todo', priority: 'medium', assignee: 1, channel: 0, due: '2026-09-01', taskType: 'task', subtasks: [] }],
    }));
    assert.ok(seed.ok);
  });

  after(() => { if (server) server.kill(); });

  it('goal PUT with the current version succeeds and echoes the bumped version', async () => {
    const goal = await (await fetch(`${BASE}/api/goals/g1`)).json();
    assert.equal(goal.version, 0);

    const res = await fetch(`${BASE}/api/goals/g1`, json('PUT', { ...goal, title: 'Edited', version: 0 }));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.version, 1);
  });

  it('goal PUT with a stale version 409s with the current row', async () => {
    const goal = await (await fetch(`${BASE}/api/goals/g1`)).json();
    const res = await fetch(`${BASE}/api/goals/g1`, json('PUT', { ...goal, title: 'Stale edit', version: 0 }));
    assert.equal(res.status, 409);
    const body = await res.json();
    assert.equal(body.error, 'version_conflict');
    assert.equal(body.current.title, 'Edited');
    assert.equal(body.current.version, 1);
  });

  it('goal PUT without a version stays last-write-wins (legacy clients)', async () => {
    const goal = await (await fetch(`${BASE}/api/goals/g1`)).json();
    const { version: _dropped, ...legacy } = goal;
    const res = await fetch(`${BASE}/api/goals/g1`, json('PUT', { ...legacy, title: 'Legacy edit' }));
    assert.equal(res.status, 200);
  });

  it('task PUT follows the same contract', async () => {
    const tasks = await (await fetch(`${BASE}/api/tasks`)).json();
    const task = tasks.find((t) => t.id === 't1');
    assert.equal(task.version, 0);

    const ok = await fetch(`${BASE}/api/tasks/t1`, json('PUT', { ...task, title: 'Edited task', version: 0 }));
    assert.equal(ok.status, 200);
    assert.equal((await ok.json()).version, 1);

    const stale = await fetch(`${BASE}/api/tasks/t1`, json('PUT', { ...task, version: 0 }));
    assert.equal(stale.status, 409);
    assert.equal((await stale.json()).current.version, 1);
  });
});
