const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

// FF-5: golden requests captured at protocol v1 replay green against the
// current server. A cloud deploy that breaks one of these bricks agents and
// desktops sitting behind customer firewalls — this is the tripwire.

const SERVER = path.join(__dirname, '..', 'server.cjs');
const FIXTURES = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'protocol-v1', 'requests.json'), 'utf8'));
const { MIN_SUPPORTED } = require('../protocol.cjs');
const PORT = 5500 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${PORT}`;

describe(`FF-5: protocol v${FIXTURES.protocol} golden fixtures`, () => {
  let server;
  let agentToken = '';

  before(async () => {
    server = spawn(process.execPath, [SERVER], {
      env: {
        ...process.env,
        BRIDGE_MODE: 'client', BRIDGE_INSECURE_NO_AUTH: '1',
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

    // Seed the user the fixtures reference and provision an agent token
    await fetch(`${BASE}/api/sync/migrate-from-local`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ users: [{ id: 1, name: 'Fixture User', role: 'owner', av: 'F', color: '#000', dept: '', title: '' }] }),
    });
    const minted = await (await fetch(`${BASE}/api/agents/enrol-token`, { method: 'POST' })).json();
    const enrolled = await (await fetch(`${BASE}/api/agent/enroll`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: minted.token, name: 'fixture-agent' }),
    })).json();
    agentToken = enrolled.agentToken;
  });

  after(() => server?.kill());

  it(`fixture protocol ${FIXTURES.protocol} is still inside the support window (>= MIN_SUPPORTED ${MIN_SUPPORTED})`, () => {
    assert.ok(FIXTURES.protocol >= MIN_SUPPORTED,
      'these fixtures are older than MIN_SUPPORTED — retire them together with the floor bump decision');
  });

  it('every golden request is accepted with its v1 response shape', async () => {
    for (const fx of FIXTURES.requests) {
      const headers = { 'Content-Type': 'application/json' };
      for (const [k, v] of Object.entries(fx.headers || {})) {
        headers[k] = v.replace('{{AGENT_TOKEN}}', agentToken);
      }
      const res = await fetch(`${BASE}${fx.path}`, {
        method: fx.method,
        headers,
        body: fx.body === undefined ? undefined : JSON.stringify(fx.body),
      });
      assert.equal(res.status, fx.expectStatus, `${fx.name}: expected ${fx.expectStatus}, got ${res.status}`);
      const body = await res.json();
      for (const key of fx.expectKeys) {
        assert.ok(key in body, `${fx.name}: response lost the '${key}' field a v1 client reads`);
      }
    }
  });
});
