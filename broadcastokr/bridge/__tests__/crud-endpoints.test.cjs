const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { createDB } = require('../db/connection.cjs');
const { runMigrations } = require('../db/migrate.cjs');
const path = require('path');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

function freshDB() {
  const db = createDB(':memory:');
  runMigrations(db, MIGRATIONS_DIR);
  // Seed a user for FK constraints
  db.prepare('INSERT INTO users (id, name, role, av, color, dept, title) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(1, 'Alice', 'owner', 'A', '#3805E3', 'Eng', 'Dev');
  return db;
}

describe('users CRUD', () => {
  it('insert and retrieve user', () => {
    const db = freshDB();
    db.prepare('INSERT INTO users (id, name, role, av, color, dept, title) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(2, 'Bob', 'member', 'B', '#2DD4BF', 'Ops', 'Analyst');
    const users = db.prepare('SELECT * FROM users ORDER BY id').all();
    assert.equal(users.length, 2);
    assert.equal(users[1].name, 'Bob');
    db.close();
  });
});

describe('teams CRUD', () => {
  it('insert team with members', () => {
    const db = freshDB();
    db.prepare('INSERT INTO teams (id, name, color, icon) VALUES (?, ?, ?, ?)').run('t1', 'Alpha', '#3805E3', 'A');
    db.prepare('INSERT INTO team_members (team_id, user_id) VALUES (?, ?)').run('t1', 1);
    const members = db.prepare('SELECT user_id FROM team_members WHERE team_id = ?').all('t1');
    assert.equal(members.length, 1);
    assert.equal(members[0].user_id, 1);
    db.close();
  });

  it('cascade deletes team_members', () => {
    const db = freshDB();
    db.prepare('INSERT INTO teams (id, name, color, icon) VALUES (?, ?, ?, ?)').run('t1', 'Alpha', '#3805E3', 'A');
    db.prepare('INSERT INTO team_members (team_id, user_id) VALUES (?, ?)').run('t1', 1);
    db.prepare('DELETE FROM teams WHERE id = ?').run('t1');
    assert.equal(db.prepare('SELECT COUNT(*) as c FROM team_members').get().c, 0);
    db.close();
  });
});

describe('clients CRUD', () => {
  it('stores and retrieves JSON fields', () => {
    const db = freshDB();
    db.prepare('INSERT INTO clients (id, name, connection_id, color, tags, channels) VALUES (?, ?, ?, ?, ?, ?)')
      .run('c1', 'VRT', 'conn1', '#3805E3', JSON.stringify(['broadcast', 'live']), JSON.stringify([{ id: 'ch1', name: 'Channel 1' }]));
    const client = db.prepare('SELECT * FROM clients WHERE id = ?').get('c1');
    assert.deepEqual(JSON.parse(client.tags), ['broadcast', 'live']);
    assert.deepEqual(JSON.parse(client.channels), [{ id: 'ch1', name: 'Channel 1' }]);
    db.close();
  });
});

describe('templates CRUD', () => {
  it('insert template with kr_templates', () => {
    const db = freshDB();
    db.prepare('INSERT INTO goal_templates (id, title, category, period) VALUES (?, ?, ?, ?)').run('tpl1', 'Monthly Health', 'Health Check', 'Q1 2026');
    db.prepare('INSERT INTO kr_templates (id, template_id, title, sql, unit, direction, start_val, target_val, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run('krt1', 'tpl1', 'Uptime', 'SELECT 1', '%', 'hi', 0, 99.9, 0);
    const krts = db.prepare('SELECT * FROM kr_templates WHERE template_id = ?').all('tpl1');
    assert.equal(krts.length, 1);
    assert.equal(krts[0].title, 'Uptime');
    db.close();
  });

  it('cascade deletes kr_templates', () => {
    const db = freshDB();
    db.prepare('INSERT INTO goal_templates (id, title, category, period) VALUES (?, ?, ?, ?)').run('tpl1', 'Monthly', 'Custom', 'Q1');
    db.prepare('INSERT INTO kr_templates (id, template_id, title, sql, unit, direction, start_val, target_val, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run('krt1', 'tpl1', 'KR', '', '', 'hi', 0, 100, 0);
    db.prepare('DELETE FROM goal_templates WHERE id = ?').run('tpl1');
    assert.equal(db.prepare('SELECT COUNT(*) as c FROM kr_templates').get().c, 0);
    db.close();
  });
});

describe('tasks CRUD', () => {
  it('insert task with subtasks', () => {
    const db = freshDB();
    db.prepare('INSERT INTO tasks (id, title, status, priority, assignee, channel, due, task_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run('t1', 'Fix bug', 'todo', 'high', 1, 0, '2026-04-10', 'task');
    db.prepare('INSERT INTO subtasks (task_id, text, done, sort_order) VALUES (?, ?, ?, ?)').run('t1', 'Reproduce', 0, 0);
    db.prepare('INSERT INTO subtasks (task_id, text, done, sort_order) VALUES (?, ?, ?, ?)').run('t1', 'Write test', 0, 1);
    const subs = db.prepare('SELECT * FROM subtasks WHERE task_id = ? ORDER BY sort_order').all('t1');
    assert.equal(subs.length, 2);
    assert.equal(subs[0].text, 'Reproduce');
    db.close();
  });

  it('cascade deletes subtasks', () => {
    const db = freshDB();
    db.prepare('INSERT INTO tasks (id, title, status, priority, assignee, channel, due, task_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run('t1', 'Task', 'todo', 'medium', 1, 0, '', 'task');
    db.prepare('INSERT INTO subtasks (task_id, text, done, sort_order) VALUES (?, ?, ?, ?)').run('t1', 'Sub', 0, 0);
    db.prepare('DELETE FROM tasks WHERE id = ?').run('t1');
    assert.equal(db.prepare('SELECT COUNT(*) as c FROM subtasks').get().c, 0);
    db.close();
  });
});

describe('check-in history', () => {
  it('inserts history and prunes at 100 entries', () => {
    const db = freshDB();
    db.prepare('INSERT INTO goals (id, title, status, progress, owner, channel, period) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run('g1', 'Goal', 'behind', 0, 1, 0, 'Q1');
    db.prepare('INSERT INTO key_results (id, goal_id, title, start_val, target_val, current_val, progress, status, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run('kr1', 'g1', 'KR', 0, 100, 0, 0, 'behind', 0);

    // Insert 101 history entries
    const insert = db.prepare('INSERT INTO kr_history (kr_id, timestamp, value, actor, source) VALUES (?, ?, ?, ?, ?)');
    for (let i = 0; i < 101; i++) {
      insert.run('kr1', new Date(Date.now() - i * 1000).toISOString(), i, 'system', 'sync');
    }
    assert.equal(db.prepare('SELECT COUNT(*) as c FROM kr_history WHERE kr_id = ?').get('kr1').c, 101);

    // Prune to 75 (simulating what the check-in endpoint does)
    const count = db.prepare('SELECT COUNT(*) as c FROM kr_history WHERE kr_id = ?').get('kr1').c;
    if (count > 100) {
      db.prepare('DELETE FROM kr_history WHERE id IN (SELECT id FROM kr_history WHERE kr_id = ? ORDER BY timestamp ASC LIMIT ?)').run('kr1', count - 75);
    }
    assert.equal(db.prepare('SELECT COUNT(*) as c FROM kr_history WHERE kr_id = ?').get('kr1').c, 75);
    db.close();
  });
});
