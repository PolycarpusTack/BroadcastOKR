const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createDB } = require('../db/connection.cjs');
const { runMigrations } = require('../db/migrate.cjs');
const { createConfigStore } = require('../whatson/store.cjs');

// D-3: the connection store is rows in the tenant database, behind the same
// loadConfig/saveConfig interface the router and the credential cipher use.
// ADR: docs/gpm/state/ADR-2026-09-03-connection-store.md

const MIGRATIONS = path.join(__dirname, '..', 'migrations');

const oracle = (extra = {}) => ({
  id: 'c-ora', name: 'PSI', type: 'oracle', host: 'db', port: 1521, service: 'local',
  schema: 'PSI', user: 'brokr_reader', password: 'enc:v1:abc', clientDir: 'C:\\oracle', ...extra,
});
const pgConn = (extra = {}) => ({
  id: 'c-pg', name: 'Rig', type: 'postgres', host: 'localhost', port: 5433, service: 'brokr_rig',
  schema: 'psi', user: 'brokr_reader', password: 'enc:v1:def', ...extra,
});
const kpi = (extra = {}) => ({
  id: 'kpi-1', name: 'Fill rate', connectionId: 'c-ora', sql: 'SELECT 1 FROM DUAL', unit: '%',
  direction: 'hi', target: 95, timeframeDays: 30, binds: { channel_id: 7 }, ...extra,
});

describe('createConfigStore (SQLite)', () => {
  let db;
  let dir;
  let store;

  beforeEach(() => {
    db = createDB(':memory:');
    runMigrations(db, MIGRATIONS);
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brokr-store-'));
    store = createConfigStore({ db, historyPath: path.join(dir, 'kpi-history.json') });
  });

  afterEach(() => {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('an empty database loads the default config shape', () => {
    assert.deepEqual(store.loadConfig(), { connections: [], kpiDefinitions: [], pollIntervalMs: 900000 });
  });

  it('round-trips connections and KPI definitions field for field', () => {
    store.saveConfig({ connections: [oracle(), pgConn()], kpiDefinitions: [kpi()], pollIntervalMs: 60000 });
    const config = store.loadConfig();
    assert.deepEqual(config.connections, [oracle(), pgConn({ clientDir: undefined })]);
    assert.deepEqual(config.kpiDefinitions, [kpi()]);
    assert.equal(config.pollIntervalMs, 60000);
  });

  it('saveConfig is a full replace: upserts by id and drops what is missing', () => {
    store.saveConfig({ connections: [oracle(), pgConn()], kpiDefinitions: [kpi()] });
    store.saveConfig({ connections: [oracle({ name: 'PSI renamed' })], kpiDefinitions: [] });
    const config = store.loadConfig();
    assert.deepEqual(config.connections.map((c) => [c.id, c.name]), [['c-ora', 'PSI renamed']]);
    assert.deepEqual(config.kpiDefinitions, []);
    // A partial save (no kpiDefinitions key) leaves that table alone
    store.saveConfig({ connections: [oracle()], kpiDefinitions: [kpi()] });
    store.saveConfig({ connections: [oracle(), pgConn()] });
    assert.equal(store.loadConfig().kpiDefinitions.length, 1);
  });

  it('stores the password column exactly as handed in (the cipher is the router\'s job)', () => {
    store.saveConfig({ connections: [oracle({ password: 'plain-from-before-d2' })] });
    assert.equal(db.prepare('SELECT password FROM connections WHERE id = ?').get('c-ora').password, 'plain-from-before-d2');
  });

  it('names every client, live KR and KPI definition that references a connection', () => {
    store.saveConfig({ connections: [oracle(), pgConn()], kpiDefinitions: [kpi()] });
    db.prepare('INSERT INTO users (id, name, role, av, color, dept, title) VALUES (1, ?, ?, ?, ?, ?, ?)')
      .run('Alice', 'owner', 'A', '#000', 'E', 'D');
    db.prepare("INSERT INTO clients (id, name, connection_id, color) VALUES ('cl1', 'Tenant Zero', 'c-ora', '#000')").run();
    db.prepare("INSERT INTO clients (id, name, connection_id, color) VALUES ('cl2', 'Other', 'c-pg', '#000')").run();
    db.prepare("INSERT INTO goals (id, title, status, progress, owner, channel, period) VALUES ('g1', 'Playout', 'behind', 0, 1, 0, 'Q1')").run();
    db.prepare(`INSERT INTO key_results (id, goal_id, title, start_val, target_val, current_val, progress, status, live_config, sort_order)
      VALUES ('kr1', 'g1', 'Fill rate live', 0, 100, 0, 0, 'behind', ?, 0)`)
      .run(JSON.stringify({ connectionId: 'c-ora', sql: 'SELECT 1', unit: '%', direction: 'hi' }));
    db.prepare(`INSERT INTO key_results (id, goal_id, title, start_val, target_val, current_val, progress, status, live_config, sort_order)
      VALUES ('kr2', 'g1', 'Manual', 0, 100, 0, 0, 'behind', NULL, 1)`).run();

    assert.deepEqual(store.referencesTo('c-ora'), {
      clients: [{ id: 'cl1', name: 'Tenant Zero' }],
      keyResults: [{ id: 'kr1', title: 'Fill rate live', goalId: 'g1', goalTitle: 'Playout' }],
      kpiDefinitions: [{ id: 'kpi-1', name: 'Fill rate' }],
    });
    assert.deepEqual(store.referencesTo('c-pg'), { clients: [{ id: 'cl2', name: 'Other' }], keyResults: [], kpiDefinitions: [] });
    assert.deepEqual(store.referencesTo('nope'), { clients: [], keyResults: [], kpiDefinitions: [] });
  });

  describe('one-time import of config.json', () => {
    const legacy = () => ({
      connections: [oracle({ password: 'still-plaintext' }), pgConn()],
      kpiDefinitions: [kpi()],
      pollIntervalMs: 120000,
    });

    it('imports rows, marks the import, and renames the file to .migrated', () => {
      const configPath = path.join(dir, 'config.json');
      fs.writeFileSync(configPath, JSON.stringify(legacy()));

      const report = store.importLegacyConfig(configPath);

      assert.deepEqual(report, { status: 'imported', connections: 2, kpiDefinitions: 1, renamedTo: `${configPath}.migrated` });
      assert.ok(!fs.existsSync(configPath), 'the original file is renamed');
      assert.ok(fs.existsSync(`${configPath}.migrated`), 'the copy stays in place for one release');
      const config = store.loadConfig();
      assert.deepEqual(config.connections.map((c) => c.id), ['c-ora', 'c-pg']);
      assert.equal(config.connections[0].password, 'still-plaintext', 'the import moves values as found; the rewrap seals them');
      assert.deepEqual(config.kpiDefinitions, [kpi()]);
      assert.equal(config.pollIntervalMs, 120000);
    });

    it('runs once: a second start with a fresh config.json at the same path does not import again', () => {
      const configPath = path.join(dir, 'config.json');
      fs.writeFileSync(configPath, JSON.stringify(legacy()));
      store.importLegacyConfig(configPath);
      store.saveConfig({ connections: [] });

      fs.writeFileSync(configPath, JSON.stringify(legacy()));
      const report = store.importLegacyConfig(configPath);

      assert.equal(report.status, 'already-imported');
      assert.deepEqual(store.loadConfig().connections, []);
      assert.ok(fs.existsSync(configPath), 'a later file is left alone');
    });

    it('existing rows win over the file (never overwrite what the database already holds)', () => {
      store.saveConfig({ connections: [oracle({ name: 'From DB' })] });
      const configPath = path.join(dir, 'config.json');
      fs.writeFileSync(configPath, JSON.stringify(legacy()));

      store.importLegacyConfig(configPath);

      const byId = Object.fromEntries(store.loadConfig().connections.map((c) => [c.id, c.name]));
      assert.deepEqual(byId, { 'c-ora': 'From DB', 'c-pg': 'Rig' });
    });

    it('with no file, records that there was nothing to import and does not look again', () => {
      const configPath = path.join(dir, 'config.json');
      assert.equal(store.importLegacyConfig(configPath).status, 'nothing-to-import');
      fs.writeFileSync(configPath, JSON.stringify(legacy()));
      assert.equal(store.importLegacyConfig(configPath).status, 'already-imported');
      assert.deepEqual(store.loadConfig().connections, []);
    });

    it('dry run reports the counts and writes nothing', () => {
      const configPath = path.join(dir, 'config.json');
      fs.writeFileSync(configPath, JSON.stringify(legacy()));

      const report = store.importLegacyConfig(configPath, { dryRun: true });

      assert.deepEqual(report, { status: 'dry-run', connections: 2, kpiDefinitions: 1, renamedTo: null });
      assert.ok(fs.existsSync(configPath));
      assert.deepEqual(store.loadConfig().connections, []);
      // Not marked: the real import still happens on the next start
      assert.equal(store.importLegacyConfig(configPath).status, 'imported');
    });

    it('an unreadable file is reported, not imported, and not marked', () => {
      const configPath = path.join(dir, 'config.json');
      fs.writeFileSync(configPath, '{ not json');
      const report = store.importLegacyConfig(configPath);
      assert.equal(report.status, 'unreadable');
      assert.ok(fs.existsSync(configPath));
      assert.equal(store.importLegacyConfig(configPath).status, 'unreadable', 'retried on the next start once the file is fixed');
    });
  });
});
