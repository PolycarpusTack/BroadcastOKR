const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const express = require('express');
const { createDB } = require('../db/connection.cjs');
const { runMigrations } = require('../db/migrate.cjs');
const { createGoalsRouter } = require('../routes/goals.cjs');
const { createTasksRouter } = require('../routes/tasks.cjs');
const { createClientsRouter } = require('../routes/clients.cjs');
const { createUsersRouter } = require('../routes/users.cjs');
const { createTeamsRouter } = require('../routes/teams.cjs');
const { createTemplatesRouter } = require('../routes/templates.cjs');
const { createSyncRouter } = require('../routes/sync.cjs');
const { RETENTION_DAYS, recordDeletion, pruneDeletions } = require('../syncDeletions.cjs');

// ADR-B4 (F6): every delete route leaves a marker the change poll delivers,
// affected parents are re-sent, delete+recreate resolves to the row, and a
// client further behind than the retention window is told to reload.

describe('sync deletions (F6)', () => {
  let db;
  let server;
  let base;

  beforeEach(async () => {
    db = createDB(':memory:');
    runMigrations(db, path.join(__dirname, '..', 'migrations'));
    for (const [id, name] of [[1, 'Alice'], [2, 'Bob']]) {
      db.prepare('INSERT INTO users (id, name, role, av, color, dept, title) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, name, 'owner', name[0], '#000', '', '');
    }
    const app = express();
    app.use(express.json());
    app.use('/api/goals', createGoalsRouter(db));
    app.use('/api/tasks', createTasksRouter(db));
    app.use('/api/clients', createClientsRouter(db));
    app.use('/api/users', createUsersRouter(db));
    app.use('/api/teams', createTeamsRouter(db));
    app.use('/api/goal-templates', createTemplatesRouter(db));
    app.use('/api/sync', createSyncRouter(db, ':memory:'));
    await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
    base = `http://127.0.0.1:${server.address().port}`;
  });
  afterEach(async () => { await new Promise((r) => server.close(r)); db.close(); });

  const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const changes = async (since) => (await fetch(`${base}/api/sync/changes?since=${encodeURIComponent(since)}`)).json();
  const secondsAgo = (n) => new Date(Date.now() - n * 1000).toISOString();
  const goal = (id, extra = {}) => ({ id, title: id, status: 'behind', progress: 0, owner: 1, channel: 0, period: 'Q3', keyResults: [], ...extra });

  it('every synchronised collection reports its deletions', async () => {
    const since = secondsAgo(5);
    assert.equal((await fetch(`${base}/api/goals`, json('POST', goal('g1')))).status, 201);
    assert.equal((await fetch(`${base}/api/tasks`, json('POST', { id: 't1', title: 'T', status: 'todo', priority: 'low', assignee: 1, channel: 0, due: '2026-09-10', taskType: 'task', subtasks: [] }))).status, 201);
    assert.equal((await fetch(`${base}/api/clients`, json('POST', { id: 'c1', name: 'C', connectionId: '', color: '#000', channels: [] }))).status, 201);
    assert.equal((await fetch(`${base}/api/clients`, json('POST', { id: 'c2', name: 'C2', connectionId: '', color: '#000', channels: [] }))).status, 201);
    assert.equal((await fetch(`${base}/api/teams`, json('POST', { id: 'tm1', name: 'Team', members: [2], color: '#000', icon: 'x', leadId: 2 }))).status, 201);
    assert.equal((await fetch(`${base}/api/goal-templates`, json('POST', { id: 'tpl1', title: 'Tpl', category: 'General', period: 'Q3', krTemplates: [] }))).status, 201);

    for (const url of ['/api/goals/g1', '/api/tasks/t1', '/api/clients/c1', '/api/teams/tm1', '/api/goal-templates/tpl1', '/api/users/2']) {
      const res = await fetch(`${base}${url}`, json('DELETE'));
      assert.ok(res.ok, `DELETE ${url} → ${res.status}`);
    }
    const c = await changes(since);
    assert.deepEqual(c.deletions, { goals: ['g1'], tasks: ['t1'], clients: ['c1'], users: ['2'], teams: ['tm1'], goalTemplates: ['tpl1'] });
    assert.equal(c.resetRequired, undefined);
    assert.ok(!c.goals.some((g) => g.id === 'g1'), 'a deleted row is not also sent as a change');
  });

  it('a delete re-sends the parents the schema rewrote (task ← goal, goal ← template, team ← user)', async () => {
    assert.equal((await fetch(`${base}/api/goal-templates`, json('POST', { id: 'tpl1', title: 'Tpl', category: 'General', period: 'Q3', krTemplates: [] }))).status, 201);
    assert.equal((await fetch(`${base}/api/goals`, json('POST', goal('g1', { templateId: 'tpl1' })))).status, 201);
    assert.equal((await fetch(`${base}/api/tasks`, json('POST', { id: 't1', title: 'T', status: 'todo', priority: 'low', assignee: 1, channel: 0, due: '2026-09-10', taskType: 'task', goalId: 'g1', subtasks: [] }))).status, 201);
    assert.equal((await fetch(`${base}/api/teams`, json('POST', { id: 'tm1', name: 'Team', members: [2], color: '#000', icon: 'x', leadId: 2 }))).status, 201);
    // Let the parents' updated_at fall behind the window
    await new Promise((r) => setTimeout(r, 1100));
    const since = new Date().toISOString();
    await new Promise((r) => setTimeout(r, 1100));

    assert.ok((await fetch(`${base}/api/goal-templates/tpl1`, json('DELETE'))).ok);
    let c = await changes(since);
    assert.deepEqual(c.deletions.goalTemplates, ['tpl1']);
    assert.equal(c.goals.find((g) => g.id === 'g1')?.templateId, undefined, 'the goal is re-sent without its template');

    assert.ok((await fetch(`${base}/api/goals/g1`, json('DELETE'))).ok);
    c = await changes(since);
    assert.deepEqual(c.deletions.goals, ['g1']);
    assert.equal(c.tasks.find((t) => t.id === 't1')?.goalId, undefined, 'the task is re-sent without its goal link');

    assert.ok((await fetch(`${base}/api/users/2`, json('DELETE'))).ok);
    c = await changes(since);
    assert.deepEqual(c.deletions.users, ['2']);
    const team = c.teams.find((t) => t.id === 'tm1');
    assert.ok(team, 'the team is re-sent');
    assert.deepEqual(team.members, []);
  });

  it('delete then recreate in one window delivers both, and the row wins on the client', async () => {
    const since = secondsAgo(5);
    assert.equal((await fetch(`${base}/api/goals`, json('POST', goal('g1')))).status, 201);
    assert.ok((await fetch(`${base}/api/goals/g1`, json('DELETE'))).ok);
    assert.equal((await fetch(`${base}/api/goals`, json('POST', goal('g1', { title: 'again' })))).status, 201);
    const c = await changes(since);
    assert.deepEqual(c.deletions.goals, ['g1']);
    assert.equal(c.goals.find((g) => g.id === 'g1')?.title, 'again');
    // Deleting again is idempotent for the marker (one row per kind+id, newest time)
    assert.ok((await fetch(`${base}/api/goals/g1`, json('DELETE'))).ok);
    assert.equal((await fetch(`${base}/api/goals/g1`, json('DELETE'))).status, 404);
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM sync_deletions').get().c, 1);
  });

  it('a stale update cannot bring a deleted goal or task back', async () => {
    assert.equal((await fetch(`${base}/api/goals`, json('POST', goal('g1')))).status, 201);
    assert.ok((await fetch(`${base}/api/goals/g1`, json('DELETE'))).ok);
    assert.equal((await fetch(`${base}/api/goals/g1`, json('PUT', goal('g1', { version: 0 })))).status, 404);
    assert.equal((await fetch(`${base}/api/goals/g1/check-in`, json('POST', { krId: 'x', value: 1 }))).status, 404);
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM goals').get().c, 0);
  });

  it('a client behind the retention window is told to reload; old markers are pruned', async () => {
    const old = new Date(Date.now() - (RETENTION_DAYS + 1) * 86400000).toISOString();
    db.prepare("INSERT INTO sync_deletions (kind, id, deleted_at) VALUES ('goals', 'ancient', ?)").run(old.slice(0, 19).replace('T', ' '));
    recordDeletion(db, 'tasks', 'fresh');
    assert.equal(pruneDeletions(db), 1, 'the ancient marker is pruned');
    const stale = await changes(old);
    assert.equal(stale.resetRequired, true);
    const fresh = await changes(secondsAgo(5));
    assert.equal(fresh.resetRequired, undefined);
    assert.deepEqual(fresh.deletions.tasks, ['fresh']);
  });
});
