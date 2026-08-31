const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');

const SERVER = path.join(__dirname, '..', 'server.cjs');
const PORT = 4300 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${PORT}`;

describe('activity log API', () => {
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
        if (res.ok) return;
      } catch { /* not up yet */ }
      if (Date.now() > deadline) throw new Error('bridge did not start within 10s');
      await new Promise((r) => setTimeout(r, 200));
    }
  });

  after(() => { if (server) server.kill(); });

  it('persists entries and returns them newest first', async () => {
    for (const text of ['first action', 'second action']) {
      const res = await fetch(`${BASE}/api/activity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor: 'Alice', text, color: '#3805E3' }),
      });
      assert.equal(res.status, 201);
    }

    const list = await (await fetch(`${BASE}/api/activity?limit=10`)).json();
    assert.equal(list.length, 2);
    assert.equal(list[0].text, 'second action');
    assert.equal(list[0].actor, 'Alice');
    assert.ok(list[0].timestamp);
  });

  it('POST /api/kpi/sync-now triggers a sync pass', async () => {
    const res = await fetch(`${BASE}/api/kpi/sync-now`, { method: 'POST' });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.total, 0);
  });

  it('rejects entries without actor or text', async () => {
    const res = await fetch(`${BASE}/api/activity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'no actor' }),
    });
    assert.equal(res.status, 400);
  });
});
