const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Packaged builds run the bridge from a read-only install directory, so every
// writable path must be overridable via env (electron/main.cjs bridgeEnv()).
// This exercises the BRIDGE_DB_PATH / BRIDGE_HISTORY_PATH overrides. Since D-3
// BRIDGE_CONFIG_PATH is only where an upgraded install's config.json is
// imported from; nothing is written there any more.

const SERVER = path.join(__dirname, '..', 'server.cjs');
const PORT = 3500 + Math.floor(Math.random() * 400);
const BASE = `http://127.0.0.1:${PORT}`;

describe('bridge writable paths are env-overridable', () => {
  let server;
  let dataDir;

  before(async () => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brokr-bridge-'));
    server = spawn(process.execPath, [SERVER], {
      env: {
        ...process.env,
        BRIDGE_DB_PATH: path.join(dataDir, 'test.db'),
        BRIDGE_CONFIG_PATH: path.join(dataDir, 'config.json'),
        BRIDGE_HISTORY_PATH: path.join(dataDir, 'kpi-history.json'),
        BRIDGE_LOG_DIR: path.join(dataDir, 'logs'),
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

  after(() => {
    if (server) server.kill();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it('writes the db to BRIDGE_DB_PATH and never creates a config.json', async () => {
    const res = await fetch(`${BASE}/api/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connections: [] }),
    });
    assert.ok(res.ok, `POST /api/config failed: ${res.status}`);

    assert.ok(fs.existsSync(path.join(dataDir, 'test.db')), 'sqlite db not created at override path');
    assert.ok(!fs.existsSync(path.join(dataDir, 'config.json')), 'config.json must not be written: connections live in the database');
  });
});
