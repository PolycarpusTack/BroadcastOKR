#!/usr/bin/env node
/**
 * FF-5 fixture capture (R7-3). Boots the bridge from the working tree, replays
 * the newest golden request set, and — when PROTOCOL_VERSION has no fixture
 * directory yet — writes bridge/__tests__/fixtures/protocol-v<N>/requests.json
 * from that set, every request re-verified against the booted server.
 *
 * Exit 0: fixtures verified (and captured if the version was new).
 * Exit 1: a golden request no longer holds — the wire contract broke.
 *
 * Usage: node scripts/capture-protocol-fixtures.mjs
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES = join(ROOT, 'bridge', '__tests__', 'fixtures');
const { PROTOCOL_VERSION } = require(join(ROOT, 'bridge', 'protocol.cjs'));

const versions = readdirSync(FIXTURES)
  .map((d) => /^protocol-v(\d+)$/.exec(d)?.[1])
  .filter(Boolean)
  .map(Number)
  .sort((a, b) => a - b);
if (versions.length === 0) { console.error('no fixture sets found'); process.exit(1); }
const source = versions[versions.length - 1];
const target = PROTOCOL_VERSION;
const sourceFile = join(FIXTURES, `protocol-v${source}`, 'requests.json');
const targetDir = join(FIXTURES, `protocol-v${target}`);
const fixtures = JSON.parse(readFileSync(sourceFile, 'utf8'));

const PORT = 5700 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${PORT}`;
const server = spawn(process.execPath, [join(ROOT, 'bridge', 'server.cjs')], {
  env: {
    ...process.env,
    BRIDGE_MODE: 'client', BRIDGE_INSECURE_NO_AUTH: '1',
    BRIDGE_DB_PATH: ':memory:', BRIDGE_PORT: String(PORT), BRIDGE_HOST: '127.0.0.1',
    BRIDGE_API_KEY: '', BRIDGE_ENCRYPTION_KEY: '', BRIDGE_CONFIG_PATH: join(ROOT, 'dist-agent', 'never.json'),
  },
  stdio: 'ignore',
});

try {
  const deadline = Date.now() + 15000;
  for (;;) {
    try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch { /* not up */ }
    if (Date.now() > deadline) throw new Error('bridge did not start');
    await new Promise((r) => setTimeout(r, 200));
  }

  // Same provisioning the replay test does
  await fetch(`${BASE}/api/sync/migrate-from-local`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ users: [{ id: 1, name: 'Fixture User', role: 'owner', av: 'F', color: '#000', dept: '', title: '' }] }),
  });
  const minted = await (await fetch(`${BASE}/api/agents/enrol-token`, { method: 'POST' })).json();
  const enrolled = await (await fetch(`${BASE}/api/agent/enroll`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: minted.token, name: 'fixture-agent' }),
  })).json();

  let failed = 0;
  for (const fx of fixtures.requests) {
    const headers = { 'Content-Type': 'application/json', 'X-BrOKR-Protocol': String(target) };
    for (const [k, v] of Object.entries(fx.headers || {})) headers[k] = v.replace('{{AGENT_TOKEN}}', enrolled.agentToken);
    const res = await fetch(`${BASE}${fx.path}`, { method: fx.method, headers, body: fx.body === undefined ? undefined : JSON.stringify(fx.body) });
    const body = await res.json().catch(() => ({}));
    const missing = fx.expectKeys.filter((k) => !(k in body));
    if (res.status !== fx.expectStatus || missing.length) {
      failed++;
      console.error(`FAIL ${fx.name}: status ${res.status} (expected ${fx.expectStatus})${missing.length ? `, missing ${missing.join(', ')}` : ''}`);
    } else {
      console.log(`ok   ${fx.name}`);
    }
  }
  if (failed) { console.error(`${failed} golden request(s) broke against protocol v${target}`); process.exit(1); }

  if (existsSync(targetDir)) {
    console.log(`OK: protocol v${target} fixtures verified (${fixtures.requests.length} requests); nothing to capture.`);
  } else {
    mkdirSync(targetDir, { recursive: true });
    const captured = {
      ...fixtures,
      protocol: target,
      capturedAt: new Date().toISOString().slice(0, 10),
      note: `Canonical v${target} client requests, captured by scripts/capture-protocol-fixtures.mjs from the v${source} set and verified against the server at capture time. A future server must accept every one of these until MIN_SUPPORTED passes ${target} (FF-5).`,
    };
    writeFileSync(join(targetDir, 'requests.json'), JSON.stringify(captured, null, 2) + '\n');
    console.log(`CAPTURED: ${targetDir} (${fixtures.requests.length} requests) — commit it.`);
  }
} finally {
  server.kill();
}
