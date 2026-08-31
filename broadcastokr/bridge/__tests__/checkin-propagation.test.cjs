const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');

// A check-in must reach other clients via the change poll:
//  - the goal's updated_at is bumped so /api/sync/changes includes it
//  - /api/sync/changes accepts the ISO `since` the frontend sends (the stored
//    timestamps are sqlite "YYYY-MM-DD HH:MM:SS"; byte-wise comparison against
//    an ISO string would silently exclude every same-day change)
//  - the bridge does NOT recompute progress: the client owns progress semantics
//    (krProgress is direction-aware; the old server formula was not)

const SERVER = path.join(__dirname, '..', 'server.cjs');
const PORT = 3900 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${PORT}`;

const json = (method, body) => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

describe('check-in propagation contract', () => {
  let server;

  before(async () => {
    server = spawn(process.execPath, [SERVER], {
      env: {
        ...process.env,
        BRIDGE_DB_PATH: ':memory:',
        BRIDGE_PORT: String(PORT),
        BRIDGE_HOST: '127.0.0.1',
        BRIDGE_API_KEY: '',
      },
      stdio: 'ignore',
    });
    const deadline = Date.now() + 10000;
    for (;;) {
      try {
        const res = await fetch(`${BASE}/api/health`);
        if (res.ok) break;
      } catch { /* not up yet */ }
      if (Date.now() > deadline) throw new Error('bridge did not start within 10s');
      await new Promise((r) => setTimeout(r, 200));
    }

    const seed = await fetch(`${BASE}/api/sync/migrate-from-local`, json('POST', {
      users: [{ id: 1, name: 'Alice', role: 'owner', av: 'A', color: '#000', dept: 'Eng', title: 'Dev' }],
      goals: [{
        id: 'g1', title: 'Goal', status: 'at_risk', progress: 0.4, owner: 1, channel: 0, period: 'Q1',
        keyResults: [{ id: 'kr1', title: 'KR', start: 0, target: 100, current: 40, progress: 0.4, status: 'at_risk' }],
      }],
    }));
    assert.ok(seed.ok, 'seeding via migrate-from-local failed');
  });

  after(() => {
    if (server) server.kill();
  });

  it('bumps updated_at so the change poll (ISO since) picks up the check-in', async () => {
    // Let the seed's updated_at fall behind the poll window
    await new Promise((r) => setTimeout(r, 2100));
    const since = new Date().toISOString();

    const checkin = await fetch(`${BASE}/api/goals/g1/check-in`,
      json('POST', { krId: 'kr1', value: 55, actor: 'alice' }));
    assert.ok(checkin.ok, `check-in failed: ${checkin.status}`);

    const res = await fetch(`${BASE}/api/sync/changes?since=${encodeURIComponent(since)}`);
    const changes = await res.json();
    const ids = (changes.goals || []).map((g) => g.id);
    assert.ok(ids.includes('g1'), `changes since ${since} should include g1, got [${ids}]`);
  });

  it('records history but leaves value/progress to the client', async () => {
    const res = await fetch(`${BASE}/api/goals/g1`);
    const goal = await res.json();
    const kr = goal.keyResults.find((k) => k.id === 'kr1');

    assert.equal(kr.history?.length, 1, 'check-in should be recorded in history');
    assert.equal(kr.history[0].value, 55);
    assert.equal(kr.current, 40, 'server must not update current_val — the client PUTs the goal');
    assert.equal(kr.progress, 0.4, 'server must not recompute progress — client semantics are authoritative');
  });
});
