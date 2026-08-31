const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync, spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// The provisioning script must yield a bootable instance with the pinned
// client seeded and identity fail-closed until real OIDC values are set.

const ROOT = path.join(__dirname, '..', '..');
const SCRIPT = path.join(ROOT, 'scripts', 'provision-instance.mjs');
const PORT = 5100 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${PORT}`;

describe('instance provisioning', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brokr-instance-'));
  let server;

  after(() => {
    if (server) server.kill();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('creates env + migrated db + pinned client, and refuses to overwrite', () => {
    const out = execFileSync(process.execPath, [
      SCRIPT, '--dir', dir, '--name', 'A+E Networks', '--mode', 'client', '--base-url', BASE,
    ]).toString();
    assert.ok(out.includes('Provisioned client instance'));
    assert.ok(fs.existsSync(path.join(dir, '.env')));
    assert.ok(fs.existsSync(path.join(dir, 'broadcastokr.db')));

    assert.throws(() => execFileSync(process.execPath, [SCRIPT, '--dir', dir, '--name', 'X', '--mode', 'client'], { stdio: 'pipe' }),
      /refusing to overwrite|Command failed/);
  });

  it('the provisioned instance boots and serves the seeded client', async () => {
    // Parse the generated env; override identity with the test escape (the
    // placeholders are deliberately non-functional)
    const env = { ...process.env };
    for (const line of fs.readFileSync(path.join(dir, '.env'), 'utf8').split('\n')) {
      const m = /^([A-Z_]+)=(.*)$/.exec(line);
      if (m) env[m[1]] = m[2];
    }
    env.BRIDGE_PORT = String(PORT);
    env.BRIDGE_HOST = '127.0.0.1';
    env.BRIDGE_INSECURE_NO_AUTH = '1';
    delete env.BRIDGE_OIDC_ISSUER; delete env.BRIDGE_OIDC_CLIENT_ID; delete env.BRIDGE_OIDC_CLIENT_SECRET;
    env.BRIDGE_API_KEY = '';

    server = spawn(process.execPath, [path.join(ROOT, 'bridge', 'server.cjs')], { env, stdio: 'ignore' });
    const deadline = Date.now() + 10000;
    for (;;) {
      try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch { /* not up */ }
      if (Date.now() > deadline) throw new Error('provisioned instance did not start');
      await new Promise((r) => setTimeout(r, 200));
    }

    const health = await (await fetch(`${BASE}/api/health`)).json();
    assert.equal(health.mode, 'client');

    const clients = await (await fetch(`${BASE}/api/clients`)).json();
    assert.equal(clients.length, 1);
    assert.equal(clients[0].name, 'A+E Networks');
  });
});
