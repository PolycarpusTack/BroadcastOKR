const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { createDB } = require('../db/connection.cjs');
const { runMigrations } = require('../db/migrate.cjs');

const TEST_DB = path.join(__dirname, '__test.db');
const TEST_MIGRATIONS = path.join(__dirname, '__test_migrations');

beforeEach(() => {
  try { fs.unlinkSync(TEST_DB); } catch {}
  try { fs.rmSync(TEST_MIGRATIONS, { recursive: true }); } catch {}
  fs.mkdirSync(TEST_MIGRATIONS, { recursive: true });
});

afterEach(() => {
  try { fs.unlinkSync(TEST_DB); } catch {}
  try { fs.rmSync(TEST_MIGRATIONS, { recursive: true }); } catch {}
});

describe('createDB', () => {
  it('creates a SQLite database with WAL mode and foreign keys', () => {
    const db = createDB(TEST_DB);
    const walMode = db.pragma('journal_mode', { simple: true });
    assert.equal(walMode, 'wal');
    const fk = db.pragma('foreign_keys', { simple: true });
    assert.equal(fk, 1);
    db.close();
  });
});

describe('runMigrations', () => {
  it('applies migrations in order', () => {
    fs.writeFileSync(path.join(TEST_MIGRATIONS, '001-create-foo.sql'),
      'CREATE TABLE foo (id TEXT PRIMARY KEY, name TEXT NOT NULL);');
    fs.writeFileSync(path.join(TEST_MIGRATIONS, '002-create-bar.sql'),
      'CREATE TABLE bar (id TEXT PRIMARY KEY, fooId TEXT REFERENCES foo(id));');

    const db = createDB(TEST_DB);
    const applied = runMigrations(db, TEST_MIGRATIONS);
    assert.equal(applied, 2);

    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
    const names = tables.map(t => t.name);
    assert.ok(names.includes('foo'));
    assert.ok(names.includes('bar'));
    assert.ok(names.includes('_migrations'));
    db.close();
  });

  it('skips already-applied migrations', () => {
    fs.writeFileSync(path.join(TEST_MIGRATIONS, '001-create-foo.sql'),
      'CREATE TABLE foo (id TEXT PRIMARY KEY);');

    const db = createDB(TEST_DB);
    const first = runMigrations(db, TEST_MIGRATIONS);
    assert.equal(first, 1);

    fs.writeFileSync(path.join(TEST_MIGRATIONS, '002-create-bar.sql'),
      'CREATE TABLE bar (id TEXT PRIMARY KEY);');

    const second = runMigrations(db, TEST_MIGRATIONS);
    assert.equal(second, 1);
    db.close();
  });

  it('records applied migrations in _migrations table', () => {
    fs.writeFileSync(path.join(TEST_MIGRATIONS, '001-init.sql'),
      'CREATE TABLE test (id TEXT);');

    const db = createDB(TEST_DB);
    runMigrations(db, TEST_MIGRATIONS);

    const rows = db.prepare('SELECT name FROM _migrations').all();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].name, '001-init.sql');
    db.close();
  });

  it('does nothing when no migration files exist', () => {
    const db = createDB(TEST_DB);
    const applied = runMigrations(db, TEST_MIGRATIONS);
    assert.equal(applied, 0);
    db.close();
  });
});
