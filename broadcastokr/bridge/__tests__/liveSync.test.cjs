const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createDB } = require('../db/connection.cjs');
const { runMigrations } = require('../db/migrate.cjs');
const { runKRSyncOnce } = require('../liveSync.cjs');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');
const FUTURE = new Date(Date.now() + 7 * 86400000).toISOString();
const OLD_TS = '2020-01-01 00:00:00';

function seed(db, { monitored }) {
  db.prepare('INSERT INTO users (id, name, role, av, color, dept, title) VALUES (1, ?, ?, ?, ?, ?, ?)')
    .run('Alice', 'owner', 'A', '#000', 'Eng', 'Dev');
  db.prepare(`INSERT INTO goals (id, title, status, progress, owner, channel, period, monitor_until, updated_at)
    VALUES ('g1', 'Goal', 'behind', 0, 1, 0, 'Q1', ?, ?)`)
    .run(monitored ? FUTURE : null, OLD_TS);
  db.prepare(`INSERT INTO key_results (id, goal_id, title, start_val, target_val, current_val, progress, status, live_config, sort_order)
    VALUES ('kr1', 'g1', 'Live KR', 0, 100, 10, 0.1, 'behind', ?, 0)`)
    .run(JSON.stringify({ connectionId: 'conn1', sql: 'SELECT 42 AS value', unit: '#', direction: 'hi' }));
}

describe('bridge-side live-KR sync', () => {
  let db;

  beforeEach(() => {
    db = createDB(':memory:');
    runMigrations(db, MIGRATIONS_DIR);
  });

  afterEach(() => db.close());

  it('writes the value, sync status, and bumps the goal so change-polling propagates it', async () => {
    seed(db, { monitored: false });

    const result = await runKRSyncOnce(db, { executeQuery: async () => ({ status: 'ok', current: 42 }) });

    assert.equal(result.synced, 1);
    const kr = db.prepare('SELECT * FROM key_results WHERE id = ?').get('kr1');
    assert.equal(kr.current_val, 42);
    assert.equal(kr.sync_status, 'ok');
    assert.ok(kr.last_sync_at);
    const goal = db.prepare('SELECT updated_at FROM goals WHERE id = ?').get('g1');
    assert.notEqual(goal.updated_at, OLD_TS, 'goal updated_at must be bumped');
  });

  it('records sync history only while monitoring is active', async () => {
    seed(db, { monitored: false });
    await runKRSyncOnce(db, { executeQuery: async () => ({ status: 'ok', current: 42 }) });
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM kr_history').get().c, 0);

    db.prepare('UPDATE goals SET monitor_until = ? WHERE id = ?').run(FUTURE, 'g1');
    await runKRSyncOnce(db, { executeQuery: async () => ({ status: 'ok', current: 43 }) });
    const history = db.prepare('SELECT * FROM kr_history WHERE kr_id = ?').all('kr1');
    assert.equal(history.length, 1);
    assert.equal(history[0].source, 'sync');
    assert.equal(history[0].value, 43);
  });

  it('marks failures without touching the value', async () => {
    seed(db, { monitored: false });

    await runKRSyncOnce(db, { executeQuery: async () => ({ status: 'timeout', error: 'Query timed out' }) });

    const kr = db.prepare('SELECT * FROM key_results WHERE id = ?').get('kr1');
    assert.equal(kr.current_val, 10, 'value unchanged on failure');
    assert.equal(kr.sync_status, 'timeout');
    assert.equal(kr.sync_error, 'Query timed out');
  });

  it('is a no-op with no live KRs', async () => {
    const result = await runKRSyncOnce(db, { executeQuery: async () => ({ status: 'ok', current: 1 }) });
    assert.equal(result.synced, 0);
  });
});
