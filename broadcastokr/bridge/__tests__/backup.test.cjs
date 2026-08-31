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
    const dest = await runBackupOnce(db, dir, { keep: 14 });
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
});
