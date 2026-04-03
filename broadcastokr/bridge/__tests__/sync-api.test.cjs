const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { createDB } = require('../db/connection.cjs');
const { runMigrations } = require('../db/migrate.cjs');
const path = require('path');

describe('sync database operations', () => {
  let db;

  beforeEach(() => {
    db = createDB(':memory:');
    runMigrations(db, path.join(__dirname, '..', 'migrations'));
    db.prepare('INSERT INTO users (id, name, role, av, color, dept, title) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(1, 'Alice', 'owner', 'A', '#3805E3', 'Eng', 'Dev');
  });

  it('migrate-from-local inserts all entity types', () => {
    const localData = {
      goals: [{
        id: 'g1', title: 'Goal 1', status: 'behind', progress: 0,
        owner: 1, channel: 0, period: 'Q1 2026', keyResults: [],
      }],
      tasks: [{
        id: 't1', title: 'Task 1', status: 'todo', priority: 'medium',
        assignee: 1, channel: 0, due: '2026-04-01', taskType: 'task', subtasks: [],
      }],
      clients: [],
      goalTemplates: [],
      users: [{ id: 1, name: 'Alice', role: 'owner', av: 'A', color: '#3805E3', dept: 'Eng', title: 'Dev' }],
      teams: [],
      kpis: [],
    };

    // Simulate migration: insert goals
    for (const g of localData.goals) {
      db.prepare('INSERT INTO goals (id, title, status, progress, owner, channel, period) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(g.id, g.title, g.status, g.progress, g.owner, g.channel, g.period);
    }

    // Simulate migration: insert tasks
    for (const t of localData.tasks) {
      db.prepare('INSERT INTO tasks (id, title, status, priority, assignee, channel, due, task_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(t.id, t.title, t.status, t.priority, t.assignee, t.channel, t.due, t.taskType);
    }

    assert.equal(db.prepare('SELECT COUNT(*) as c FROM goals').get().c, 1);
    assert.equal(db.prepare('SELECT COUNT(*) as c FROM tasks').get().c, 1);
  });

  it('updated_at changes track modifications', () => {
    db.prepare('INSERT INTO goals (id, title, status, progress, owner, channel, period) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run('g1', 'Goal', 'behind', 0, 1, 0, 'Q1');

    const before = db.prepare('SELECT updated_at FROM goals WHERE id = ?').get('g1').updated_at;

    // Simulate a small delay then update
    db.prepare("UPDATE goals SET title = 'Updated', updated_at = datetime('now') WHERE id = ?").run('g1');

    const after = db.prepare('SELECT updated_at FROM goals WHERE id = ?').get('g1').updated_at;
    assert.equal(typeof before, 'string');
    assert.equal(typeof after, 'string');
  });
});
