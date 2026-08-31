const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');

// BRIDGE_MODE=client pins the instance to a single tenant: the mode is
// reported on /api/health and fleet operations are refused server-side —
// hiding UI is not a boundary.

const SERVER = path.join(__dirname, '..', 'server.cjs');
const PORT = 4500 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${PORT}`;

const json = (method, body) => ({
  method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
const client = (id) => ({ id, name: `Client ${id}`, connectionId: '', color: '#000', channels: [] });

describe('tenancy mode: client', () => {
  let server;

  before(async () => {
    server = spawn(process.execPath, [SERVER], {
      env: {
        ...process.env,
        BRIDGE_MODE: 'client',
        BRIDGE_DB_PATH: ':memory:', BRIDGE_PORT: String(PORT),
        BRIDGE_HOST: '127.0.0.1', BRIDGE_API_KEY: '',
      },
      stdio: 'ignore',
    });
    const deadline = Date.now() + 10000;
    for (;;) {
      try { if ((await fetch(`${BASE}/api/health`)).ok) return; } catch { /* not up */ }
      if (Date.now() > deadline) throw new Error('bridge did not start');
      await new Promise((r) => setTimeout(r, 200));
    }
  });

  after(() => { if (server) server.kill(); });

  it('reports its mode on /api/health', async () => {
    const health = await (await fetch(`${BASE}/api/health`)).json();
    assert.equal(health.mode, 'client');
  });

  it('allows exactly one client row and refuses a second', async () => {
    const first = await fetch(`${BASE}/api/clients`, json('POST', client('c1')));
    assert.equal(first.status, 201);

    const second = await fetch(`${BASE}/api/clients`, json('POST', client('c2')));
    assert.equal(second.status, 403);
    assert.equal((await second.json()).error, 'single_tenant');
  });

  it('refuses deleting the last client', async () => {
    const res = await fetch(`${BASE}/api/clients/c1`, { method: 'DELETE' });
    assert.equal(res.status, 403);
  });
});

describe('tenancy mode: default (desktop)', () => {
  let server;
  const port = PORT + 1;
  const base = `http://127.0.0.1:${port}`;

  before(async () => {
    const env = { ...process.env, BRIDGE_DB_PATH: ':memory:', BRIDGE_PORT: String(port), BRIDGE_HOST: '127.0.0.1', BRIDGE_API_KEY: '' };
    delete env.BRIDGE_MODE;
    server = spawn(process.execPath, [SERVER], { env, stdio: 'ignore' });
    const deadline = Date.now() + 10000;
    for (;;) {
      try { if ((await fetch(`${base}/api/health`)).ok) return; } catch { /* not up */ }
      if (Date.now() > deadline) throw new Error('bridge did not start');
      await new Promise((r) => setTimeout(r, 200));
    }
  });

  after(() => { if (server) server.kill(); });

  it('reports desktop mode and allows multiple clients', async () => {
    const health = await (await fetch(`${base}/api/health`)).json();
    assert.equal(health.mode, 'desktop');

    for (const id of ['c1', 'c2']) {
      const res = await fetch(`${base}/api/clients`, json('POST', client(id)));
      assert.equal(res.status, 201);
    }
  });
});
