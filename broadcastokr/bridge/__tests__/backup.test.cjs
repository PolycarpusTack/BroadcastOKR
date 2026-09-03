const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const { runBackupOnce } = require('../utils/backup.cjs');

describe('backup', () => {
  let db;
  let dir;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec("CREATE TABLE t (id TEXT); INSERT INTO t VALUES ('row1')");
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brokr-backup-'));
  });

  afterEach(() => {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('writes a consistent snapshot that can be reopened', async () => {
    const { dbPath: dest } = await runBackupOnce(db, dir, { keep: 14 });
    assert.ok(fs.existsSync(dest));
    const copy = new Database(dest, { readonly: true });
    assert.equal(copy.prepare('SELECT COUNT(*) AS c FROM t').get().c, 1);
    copy.close();
  });

  it('prunes oldest files beyond keep', async () => {
    for (let i = 0; i < 5; i++) {
      fs.writeFileSync(path.join(dir, `broadcastokr-2026-01-0${i + 1}T00-00-00-000Z.db`), 'old');
    }
    await runBackupOnce(db, dir, { keep: 3 });
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.db')).sort();
    assert.equal(files.length, 3, `expected prune to 3, got ${files.length}`);
    // The newest (the real snapshot) survives
    const newest = files[files.length - 1];
    const copy = new Database(path.join(dir, newest), { readonly: true });
    assert.equal(copy.prepare('SELECT COUNT(*) AS c FROM t').get().c, 1);
    copy.close();
  });

  it('a restored snapshot brings the connections back with it (D-3)', async () => {
    // Before D-3 the connection store was a file copied next to the snapshot;
    // a database-only restore came back with OKRs and no connections. The
    // connections are rows now, so the snapshot alone is the whole tenant.
    const { createDB } = require('../db/connection.cjs');
    const { runMigrations } = require('../db/migrate.cjs');
    const tenant = createDB(':memory:');
    runMigrations(tenant, path.join(__dirname, '..', 'migrations'));
    tenant.prepare("INSERT INTO connections (id, name, type, host, password) VALUES ('c1', 'PSI', 'oracle', 'db', 'enc:v1:x')").run();

    const { dbPath } = await runBackupOnce(tenant, dir, { keep: 14 });
    tenant.close();

    const restored = new Database(dbPath, { readonly: true });
    assert.deepEqual(restored.prepare('SELECT id, name, password FROM connections').all(), [{ id: 'c1', name: 'PSI', password: 'enc:v1:x' }]);
    restored.close();
    assert.ok(!fs.readdirSync(dir).some((f) => f.endsWith('.config.json')), 'no config copy is written any more');
  });

  it('prunes a pre-D-3 snapshot pair as a unit, never orphaning its config copy', async () => {
    for (let i = 0; i < 4; i++) {
      const stamp = `2026-01-0${i + 1}T00-00-00-000Z`;
      fs.writeFileSync(path.join(dir, `broadcastokr-${stamp}.db`), 'old');
      fs.writeFileSync(path.join(dir, `broadcastokr-${stamp}.config.json`), '{}');
    }
    await runBackupOnce(db, dir, { keep: 2 });
    const dbs = fs.readdirSync(dir).filter((f) => f.endsWith('.db'));
    const configs = fs.readdirSync(dir).filter((f) => f.endsWith('.config.json'));
    assert.equal(dbs.length, 2);
    assert.equal(configs.length, 1, 'the surviving old pair keeps its config copy; the pruned ones lose theirs');
  });
});
