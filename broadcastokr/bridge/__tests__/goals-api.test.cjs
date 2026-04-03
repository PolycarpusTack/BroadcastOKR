const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { createDB } = require('../db/connection.cjs');
const { runMigrations } = require('../db/migrate.cjs');
const { createGoalsRouter } = require('../routes/goals.cjs');
const path = require('path');

// Minimal Express-like test helper
function testRouter(router, db) {
  // For now, test the DB operations directly rather than HTTP
  // HTTP tests will come with supertest in Phase 4
  return {
    db,
    insertUser() {
      db.prepare('INSERT INTO users (id, name, role, av, color, dept, title) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(1, 'Alice', 'owner', 'A', '#3805E3', 'Eng', 'Dev');
    }
  };
}

describe('goals database operations', () => {
  let db;

  beforeEach(() => {
    db = createDB(':memory:');
    runMigrations(db, path.join(__dirname, '..', 'migrations'));
    // Insert a user for FK constraint
    db.prepare('INSERT INTO users (id, name, role, av, color, dept, title) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(1, 'Alice', 'owner', 'A', '#3805E3', 'Eng', 'Dev');
  });

  it('inserts and retrieves a goal with key results', () => {
    const goalId = 'g1';
    db.prepare(`INSERT INTO goals (id, title, status, progress, owner, channel, period)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(goalId, 'Test Goal', 'behind', 0, 1, 0, 'Q1 2026');

    db.prepare(`INSERT INTO key_results (id, goal_id, title, start_val, target_val, current_val, progress, status, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('kr1', goalId, 'KR 1', 0, 100, 50, 0.5, 'at_risk', 0);

    const goal = db.prepare('SELECT * FROM goals WHERE id = ?').get(goalId);
    assert.equal(goal.title, 'Test Goal');

    const krs = db.prepare('SELECT * FROM key_results WHERE goal_id = ? ORDER BY sort_order').all(goalId);
    assert.equal(krs.length, 1);
    assert.equal(krs[0].current_val, 50);
  });

  it('cascades delete from goal to key_results and kr_history', () => {
    db.prepare('INSERT INTO goals (id, title, status, progress, owner, channel, period) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run('g1', 'Goal', 'behind', 0, 1, 0, 'Q1');
    db.prepare('INSERT INTO key_results (id, goal_id, title, start_val, target_val, current_val, progress, status, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run('kr1', 'g1', 'KR', 0, 100, 0, 0, 'behind', 0);
    db.prepare('INSERT INTO kr_history (kr_id, timestamp, value, actor, source) VALUES (?, ?, ?, ?, ?)')
      .run('kr1', '2026-01-01T00:00:00Z', 42, 'alice', 'check-in');

    db.prepare('DELETE FROM goals WHERE id = ?').run('g1');

    assert.equal(db.prepare('SELECT COUNT(*) as c FROM key_results').get().c, 0);
    assert.equal(db.prepare('SELECT COUNT(*) as c FROM kr_history').get().c, 0);
  });

  it('stores and retrieves JSON fields', () => {
    const clientIds = JSON.stringify(['c1', 'c2']);
    const channelScope = JSON.stringify({ type: 'all' });
    db.prepare(`INSERT INTO goals (id, title, status, progress, owner, channel, period, client_ids, channel_scope)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('g1', 'Goal', 'behind', 0, 1, 0, 'Q1', clientIds, channelScope);

    const goal = db.prepare('SELECT * FROM goals WHERE id = ?').get('g1');
    assert.deepEqual(JSON.parse(goal.client_ids), ['c1', 'c2']);
    assert.deepEqual(JSON.parse(goal.channel_scope), { type: 'all' });
  });
});
