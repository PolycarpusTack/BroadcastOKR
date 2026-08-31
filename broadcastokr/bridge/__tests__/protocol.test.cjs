const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { PROTOCOL_VERSION, MIN_SUPPORTED } = require('../protocol.cjs');

const SERVER = path.join(__dirname, '..', 'server.cjs');
const PORT = 4600 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${PORT}`;

describe('protocol version contract', () => {
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
      try { if ((await fetch(`${BASE}/api/health`)).ok) return; } catch { /* not up */ }
      if (Date.now() > deadline) throw new Error('bridge did not start');
      await new Promise((r) => setTimeout(r, 200));
    }
  });

  after(() => { if (server) server.kill(); });

  it('health reports protocol version and floor', async () => {
    const health = await (await fetch(`${BASE}/api/health`)).json();
    assert.equal(health.protocolVersion, PROTOCOL_VERSION);
    assert.equal(health.minSupported, MIN_SUPPORTED);
  });

  it('rejects clients below the floor with 426', async () => {
    const res = await fetch(`${BASE}/api/tasks`, { headers: { 'X-BrOKR-Protocol': '0' } });
    assert.equal(res.status, 426);
    const body = await res.json();
    assert.equal(body.minSupported, MIN_SUPPORTED);
  });

  it('accepts the current version and (while floor is 1) headerless legacy clients', async () => {
    const current = await fetch(`${BASE}/api/tasks`, { headers: { 'X-BrOKR-Protocol': String(PROTOCOL_VERSION) } });
    assert.equal(current.status, 200);
    const legacy = await fetch(`${BASE}/api/tasks`);
    assert.equal(legacy.status, 200);
  });
});

describe('FF-6: migrations stay additive', () => {
  it('no migration drops or renames without an explicit BREAKING marker', () => {
    const dir = path.join(__dirname, '..', 'migrations');
    const offenders = [];
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.sql'))) {
      const sql = fs.readFileSync(path.join(dir, file), 'utf8');
      const contracts = /\b(DROP\s+TABLE|DROP\s+COLUMN|RENAME\s+TO|RENAME\s+COLUMN)\b/i.test(sql);
      const marked = /--\s*BREAKING:/.test(sql);
      if (contracts && !marked) offenders.push(file);
    }
    assert.deepEqual(offenders, [],
      `contracting migrations need a "-- BREAKING:" marker AND a MIN_SUPPORTED bump: ${offenders.join(', ')}`);
  });
});
