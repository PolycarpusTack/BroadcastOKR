const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// D-3 through the real server: connections live in the instance's database
// (two instances never see each other's), a referenced connection cannot be
// deleted, an upgraded install finds its config.json once, and the
// /api/connections and /api/config shapes are what they were.
// ADR: docs/gpm/state/ADR-2026-09-03-connection-store.md

const SERVER = path.join(__dirname, '..', 'server.cjs');
const PORT = 6100 + Math.floor(Math.random() * 90);

const json = (method, body) => ({
  method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
const connection = (id, extra = {}) => ({
  id, name: `Conn ${id}`, type: 'postgres', host: 'db', port: 5432, service: 'w', schema: 'psi',
  user: 'u', password: 'pw', ...extra,
});

async function startBridge(port, dataDir, env = {}) {
  const server = spawn(process.execPath, [SERVER], {
    env: {
      ...process.env,
      BRIDGE_MODE: 'client', BRIDGE_INSECURE_NO_AUTH: '1',
      BRIDGE_DB_PATH: path.join(dataDir, 'tenant.db'),
      BRIDGE_CONFIG_PATH: path.join(dataDir, 'config.json'),
      BRIDGE_HISTORY_PATH: path.join(dataDir, 'kpi-history.json'),
      BRIDGE_LOG_DIR: path.join(dataDir, 'logs'),
      BRIDGE_BACKUP_DIR: path.join(dataDir, 'backups'),
      BRIDGE_PORT: String(port), BRIDGE_HOST: '127.0.0.1', BRIDGE_API_KEY: '',
      BRIDGE_ENCRYPTION_KEY: 'test-key-for-connections-api',
      ...env,
    },
    stdio: 'ignore',
  });
  const base = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 15000;
  for (;;) {
    try { if ((await fetch(`${base}/api/health`)).ok) return { server, base }; } catch { /* not up */ }
    if (Date.now() > deadline) { server.kill(); throw new Error(`bridge on ${port} did not start`); }
    await new Promise((r) => setTimeout(r, 200));
  }
}

describe('connections API on the database store', () => {
  let a;
  let b;
  let dirA;
  let dirB;

  before(async () => {
    dirA = fs.mkdtempSync(path.join(os.tmpdir(), 'brokr-conn-a-'));
    dirB = fs.mkdtempSync(path.join(os.tmpdir(), 'brokr-conn-b-'));
    // Instance B holds a legacy config.json: the upgrade path
    fs.writeFileSync(path.join(dirB, 'config.json'), JSON.stringify({
      connections: [connection('legacy-1', { password: 'legacy-plain' })],
      kpiDefinitions: [{ id: 'kpi-legacy', name: 'Legacy KPI', connectionId: 'legacy-1', sql: 'SELECT 1', unit: 'n', direction: 'hi', target: 1 }],
      pollIntervalMs: 900000,
    }));
    [a, b] = await Promise.all([startBridge(PORT, dirA), startBridge(PORT + 1, dirB)]);
  });

  after(() => {
    a?.server.kill();
    b?.server.kill();
    for (const d of [dirA, dirB]) fs.rmSync(d, { recursive: true, force: true });
  });

  it('signed-in health counts the tenant tables (finding 36: `_` is a LIKE wildcard)', async () => {
    const health = await (await fetch(`${a.base}/api/health`)).json();
    assert.ok(health.database.tables >= 15, `expected the schema's tables, got ${health.database.tables}`);
  });

  it('keeps the /api/connections shape: saved masked, listed masked, no password on the wire', async () => {
    const saved = await fetch(`${a.base}/api/connections`, json('POST', connection('c1')));
    assert.equal(saved.status, 200);
    const body = await saved.json();
    assert.equal(body.ok, true);
    assert.equal(body.connection.password, '***');

    const list = await (await fetch(`${a.base}/api/connections`)).json();
    assert.deepEqual(list.map((c) => [c.id, c.name, c.type, c.host, c.port, c.service, c.schema, c.user, c.password]),
      [['c1', 'Conn c1', 'postgres', 'db', 5432, 'w', 'psi', 'u', '***']]);

    const config = await (await fetch(`${a.base}/api/config`)).json();
    assert.deepEqual(Object.keys(config).sort(), ['connections', 'kpiDefinitions', 'pollIntervalMs']);
    assert.equal(config.connections[0].password, '***');
  });

  it('a stored password is ciphertext in the database column', () => {
    const Database = require('better-sqlite3');
    const db = new Database(path.join(dirA, 'tenant.db'), { readonly: true });
    try {
      const row = db.prepare('SELECT password FROM connections WHERE id = ?').get('c1');
      assert.ok(row.password.startsWith('enc:v1:'), `expected enc:v1: ciphertext, got ${row.password}`);
    } finally { db.close(); }
  });

  it('instances never see each other\'s connections', async () => {
    const onB = await (await fetch(`${b.base}/api/connections`)).json();
    assert.ok(!onB.some((c) => c.id === 'c1'), 'instance A\'s connection is visible on instance B');
    const onA = await (await fetch(`${a.base}/api/connections`)).json();
    assert.ok(!onA.some((c) => c.id === 'legacy-1'), 'instance B\'s imported connection is visible on instance A');
  });

  it('an upgraded install imports its config.json once and renames it .migrated', async () => {
    const list = await (await fetch(`${b.base}/api/connections`)).json();
    assert.deepEqual(list.map((c) => c.id), ['legacy-1']);
    const kpis = await (await fetch(`${b.base}/api/kpis`)).json();
    assert.deepEqual(kpis.map((k) => k.id), ['kpi-legacy']);
    assert.ok(!fs.existsSync(path.join(dirB, 'config.json')), 'config.json still in place after import');
    assert.ok(fs.existsSync(path.join(dirB, 'config.json.migrated')), 'config.json.migrated missing');

    // D-2 still holds: the plaintext password the file carried was sealed on the way in
    const Database = require('better-sqlite3');
    const db = new Database(path.join(dirB, 'tenant.db'), { readonly: true });
    try {
      assert.ok(db.prepare('SELECT password FROM connections WHERE id = ?').get('legacy-1').password.startsWith('enc:v1:'));
    } finally { db.close(); }
  });

  it('refuses to delete a connection a client or a live KR still references, naming them', async () => {
    await fetch(`${a.base}/api/sync/migrate-from-local`, json('POST', {
      users: [{ id: 1, name: 'Olive Owner', role: 'owner', av: 'O', color: '#000', dept: '', title: '' }],
    }));
    const client = await fetch(`${a.base}/api/clients`, json('POST', { id: 'cl1', name: 'Tenant Zero', connectionId: 'c1', color: '#000', channels: [] }));
    assert.equal(client.status, 201);
    const goal = await fetch(`${a.base}/api/goals`, json('POST', {
      id: 'g1', title: 'Playout', status: 'behind', progress: 0, owner: 1, channel: 0, period: 'Q1', clientIds: ['cl1'],
      keyResults: [{ id: 'kr1', title: 'Fill rate', start: 0, target: 100, current: 0, progress: 0, status: 'behind',
        liveConfig: { connectionId: 'c1', sql: 'SELECT 1', unit: '%', direction: 'hi' } }],
    }));
    assert.equal(goal.status, 201, await goal.text());

    const refused = await fetch(`${a.base}/api/connections/c1`, { method: 'DELETE' });
    assert.equal(refused.status, 409);
    const body = await refused.json();
    assert.equal(body.error, 'connection_in_use');
    assert.deepEqual(body.clients, [{ id: 'cl1', name: 'Tenant Zero' }]);
    assert.deepEqual(body.keyResults, [{ id: 'kr1', title: 'Fill rate', goalId: 'g1', goalTitle: 'Playout' }]);
    assert.match(body.detail, /Tenant Zero/);
    assert.match(body.detail, /Fill rate/);

    const still = await (await fetch(`${a.base}/api/connections`)).json();
    assert.ok(still.some((c) => c.id === 'c1'), 'the connection must survive a refused delete');
  });

  it('refuses a bulk config save that would drop a referenced connection', async () => {
    const res = await fetch(`${a.base}/api/config`, json('POST', { connections: [] }));
    assert.equal(res.status, 409);
    assert.equal((await res.json()).error, 'connection_in_use');
    const still = await (await fetch(`${a.base}/api/connections`)).json();
    assert.ok(still.some((c) => c.id === 'c1'));
  });

  it('deletes an unreferenced connection', async () => {
    await fetch(`${a.base}/api/connections`, json('POST', connection('c2')));
    const res = await fetch(`${a.base}/api/connections/c2`, { method: 'DELETE' });
    assert.equal(res.status, 200);
    const list = await (await fetch(`${a.base}/api/connections`)).json();
    assert.ok(!list.some((c) => c.id === 'c2'));
  });

  it('a backup snapshot carries the connections with it', async () => {
    const backups = fs.readdirSync(path.join(dirA, 'backups')).filter((f) => f.endsWith('.db'));
    assert.ok(backups.length >= 1, 'the startup snapshot should exist');
    assert.ok(!fs.readdirSync(path.join(dirA, 'backups')).some((f) => f.endsWith('.config.json')),
      'the backup pair is gone: connections are inside the database');
    // Take a fresh snapshot through the API so the connection written above is in it
    const res = await fetch(`${a.base}/api/sync/backup`);
    assert.equal(res.status, 200);
    const snapshot = path.join(dirA, 'api-backup.db');
    fs.writeFileSync(snapshot, Buffer.from(await res.arrayBuffer()));
    const Database = require('better-sqlite3');
    const db = new Database(snapshot, { readonly: true });
    try {
      assert.deepEqual(db.prepare('SELECT id FROM connections ORDER BY id').all().map((r) => r.id), ['c1']);
    } finally { db.close(); }
  });
});
