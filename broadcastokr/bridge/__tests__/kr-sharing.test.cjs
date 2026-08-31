const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');

// The per-KR "shared with Mediagenix" opt-in must round-trip: PUT → row → GET
// and the sync snapshot. Defaults to false everywhere.

const SERVER = path.join(__dirname, '..', 'server.cjs');
const PORT = 4800 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${PORT}`;

const json = (method, body) => ({
  method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

describe('per-KR sharing flag', () => {
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

    await fetch(`${BASE}/api/sync/migrate-from-local`, json('POST', {
      users: [{ id: 1, name: 'Alice', role: 'owner', av: 'A', color: '#000', dept: 'E', title: 'D' }],
      goals: [{
        id: 'g1', title: 'Goal', status: 'behind', progress: 0, owner: 1, channel: 0, period: 'Q1',
        keyResults: [{ id: 'kr1', title: 'KR', start: 0, target: 100, current: 40, progress: 0.4, status: 'at_risk' }],
      }],
    }));
  });

  after(() => { if (server) server.kill(); });

  it('defaults to false and round-trips through PUT, GET, and the sync snapshot', async () => {
    let goal = await (await fetch(`${BASE}/api/goals/g1`)).json();
    assert.equal(goal.keyResults[0].sharedWithMediagenix, false);

    goal.keyResults[0].sharedWithMediagenix = true;
    const put = await fetch(`${BASE}/api/goals/g1`, json('PUT', goal));
    assert.equal(put.status, 200);

    goal = await (await fetch(`${BASE}/api/goals/g1`)).json();
    assert.equal(goal.keyResults[0].sharedWithMediagenix, true);

    const state = await (await fetch(`${BASE}/api/sync/state`)).json();
    assert.equal(state.goals[0].keyResults[0].sharedWithMediagenix, true);
  });
});
