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

  it('captures the connection store alongside the database', async () => {
    // A database-only snapshot restored cleanly and came back with no database
    // connections — the OKRs returned and the thing that feeds them did not.
    const configPath = path.join(dir, 'source-config.json');
    fs.writeFileSync(configPath, JSON.stringify({ connections: [{ id: 'c1', name: 'PSI' }] }));

    const { dbPath, configPath: copied } = await runBackupOnce(db, dir, { keep: 14, configPath });

    assert.ok(fs.existsSync(dbPath));
    assert.ok(copied && fs.existsSync(copied), 'config.json must be captured with the snapshot');
    assert.equal(JSON.parse(fs.readFileSync(copied, 'utf8')).connections[0].id, 'c1');
    // Matched pair: same timestamp, so a restore never mixes generations.
    assert.equal(path.basename(copied), path.basename(dbPath).replace(/\.db$/, '.config.json'));
  });

  it('still snapshots when no connection store exists yet', async () => {
    const { dbPath, configPath } = await runBackupOnce(db, dir, { keep: 14, configPath: path.join(dir, 'absent.json') });
    assert.ok(fs.existsSync(dbPath));
    assert.equal(configPath, null);
  });

  it('prunes a snapshot as a unit, never orphaning a config copy', async () => {
    const configPath = path.join(dir, 'source-config.json');
    fs.writeFileSync(configPath, '{"connections":[]}');
    for (let i = 0; i < 4; i++) {
      await runBackupOnce(db, dir, { keep: 2, configPath });
      await new Promise((r) => setTimeout(r, 5)); // distinct timestamps
    }
    const dbs = fs.readdirSync(dir).filter((f) => f.endsWith('.db'));
    const configs = fs.readdirSync(dir).filter((f) => f.endsWith('.config.json'));
    assert.equal(dbs.length, 2);
    assert.equal(configs.length, 2, 'config copies must be pruned with their database');
  });
});
