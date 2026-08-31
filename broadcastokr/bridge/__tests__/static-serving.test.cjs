const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Cloud modes serve the built app from the bridge — one container per
// instance. Static assets are public; the API stays guarded.

const SERVER = path.join(__dirname, '..', 'server.cjs');
const PORT = 4700 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${PORT}`;

describe('static app serving (client mode)', () => {
  let server;
  let appDir;

  before(async () => {
    appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brokr-app-'));
    fs.writeFileSync(path.join(appDir, 'index.html'), '<html><body>BrOKR-SHELL</body></html>');

    server = spawn(process.execPath, [SERVER], {
      env: {
        ...process.env,
        BRIDGE_MODE: 'client',
        BRIDGE_INSECURE_NO_AUTH: '1',
        BRIDGE_APP_DIR: appDir,
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

  after(() => {
    if (server) server.kill();
    fs.rmSync(appDir, { recursive: true, force: true });
  });

  it('serves the app shell at / and as SPA fallback for non-API paths', async () => {
    const root = await (await fetch(`${BASE}/`)).text();
    assert.ok(root.includes('BrOKR-SHELL'));
    const deep = await (await fetch(`${BASE}/goals`)).text();
    assert.ok(deep.includes('BrOKR-SHELL'), 'SPA fallback must serve the shell');
  });

  it('API routes stay JSON, not the shell', async () => {
    const res = await fetch(`${BASE}/api/health`);
    assert.ok((res.headers.get('content-type') || '').includes('application/json'));
  });
});
