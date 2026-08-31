const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

// Contract test: every /api/* path literal the frontend uses must resolve to a
// mounted bridge route. Unmounted paths produce Express's default HTML 404,
// which is distinguishable from an entity-level JSON 404.

const SRC_DIR = path.join(__dirname, '..', '..', 'src');
const SERVER = path.join(__dirname, '..', 'server.cjs');
const PORT = 3100 + Math.floor(Math.random() * 400);
const BASE = `http://127.0.0.1:${PORT}`;

/** Collect every '/api/...' string or template literal under src/ and normalize
 *  it to a concrete request path (template holes become a dummy id). */
function collectFrontendApiPaths() {
  const paths = new Set();
  const files = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(entry.name) && !full.includes('__tests__')) files.push(full);
    }
  })(SRC_DIR);

  const literal = /['"`](\/api\/[^'"`]*)['"`]/g;
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    for (const match of text.matchAll(literal)) {
      const normalized = match[1]
        .split('?')[0]
        .replace(/\$\{[^}]*\}/g, 'test-id');
      // Prefix literals (e.g. startsWith('/api/auth/')) are not routes
      if (normalized.endsWith('/')) continue;
      paths.add(normalized);
    }
  }
  return [...paths].sort();
}

/** A path counts as mounted if ANY method gets a response other than Express's
 *  default 404 (HTML body). Entity-level 404s are JSON, so they count as mounted. */
async function isMounted(reqPath) {
  for (const method of ['GET', 'POST', 'PUT', 'DELETE']) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(`${BASE}${reqPath}`, {
        method,
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: method === 'GET' || method === 'DELETE' ? undefined : '{}',
      });
      const contentType = res.headers.get('content-type') || '';
      if (!(res.status === 404 && contentType.includes('text/html'))) return true;
    } catch {
      // A timeout means a handler was processing — mounted. Network errors are
      // handled by the health-check gate in before().
      return true;
    } finally {
      clearTimeout(timer);
    }
  }
  return false;
}

describe('frontend ↔ bridge route contract', () => {
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

  after(() => {
    if (server) server.kill();
  });

  it('every /api path used in src/ resolves to a mounted route', async () => {
    const paths = collectFrontendApiPaths();
    assert.ok(paths.length >= 20, `expected to extract a realistic path set, got ${paths.length}`);

    const unmounted = [];
    for (const p of paths) {
      if (!(await isMounted(p))) unmounted.push(p);
    }
    assert.deepEqual(unmounted, [],
      `frontend calls these paths but the bridge mounts no route for them:\n  ${unmounted.join('\n  ')}`);
  });
});
