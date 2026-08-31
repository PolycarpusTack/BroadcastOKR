const express = require('express');

function toTaskDTO(row, subtasks) {
  return {
    id: row.id, title: row.title, description: row.description || undefined,
    status: row.status, priority: row.priority, assignee: row.assignee,
    channel: row.channel, due: row.due, taskType: row.task_type,
    clientIds: row.client_ids ? JSON.parse(row.client_ids) : undefined,
    channelScope: row.channel_scope ? JSON.parse(row.channel_scope) : undefined,
    goalId: row.goal_id || undefined,
    version: row.version ?? 0,
    subtasks: subtasks.map(s => ({ text: s.text, done: !!s.done })),
  };
}

/** Full DTO for one task, or null when it doesn't exist. */
function getTaskDTO(db, id) {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  if (!task) return null;
  const subs = db.prepare('SELECT * FROM subtasks WHERE task_id = ? ORDER BY sort_order').all(id);
  return toTaskDTO(task, subs);
}

function upsertSubtasks(db, taskId, subtasks) {
  db.prepare('DELETE FROM subtasks WHERE task_id = ?').run(taskId);
  const insert = db.prepare('INSERT INTO subtasks (task_id, text, done, sort_order) VALUES (?, ?, ?, ?)');
  subtasks.forEach((s, i) => insert.run(taskId, s.text, s.done ? 1 : 0, i));
}

function createTasksRouter(db) {
  const router = express.Router();

  router.get('/', (req, res) => {
    const tasks = db.prepare('SELECT * FROM tasks ORDER BY created_at DESC').all();
    const allSubs = db.prepare('SELECT * FROM subtasks ORDER BY sort_order').all();
    const subsByTask = new Map();
    for (const s of allSubs) {
      if (!subsByTask.has(s.task_id)) subsByTask.set(s.task_id, []);
      subsByTask.get(s.task_id).push(s);
    }
    res.json(tasks.map(t => toTaskDTO(t, subsByTask.get(t.id) || [])));
  });

  router.post('/', (req, res) => {
    const t = req.body;
    db.prepare(`INSERT INTO tasks (id, title, description, status, priority, assignee, channel, due, task_type, client_ids, channel_scope, goal_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(t.id, t.title, t.description || null, t.status, t.priority, t.assignee, t.channel, t.due, t.taskType,
        t.clientIds ? JSON.stringify(t.clientIds) : null,
        t.channelScope ? JSON.stringify(t.channelScope) : null,
        t.goalId || null);
    if (t.subtasks?.length) upsertSubtasks(db, t.id, t.subtasks);
    res.status(201).json({ ok: true, id: t.id });
  });

  // Version-carrying bodies are compare-and-swap (stale → 409 with current row);
  // versionless bodies keep last-write-wins for older clients.
  router.put('/:id', (req, res) => {
    const t = req.body;
    const existing = db.prepare('SELECT id FROM tasks WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Task not found' });

    const checked = typeof t.version === 'number';
    const result = db.prepare(`UPDATE tasks SET title=?, description=?, status=?, priority=?, assignee=?, channel=?, due=?, task_type=?,
      client_ids=?, channel_scope=?, goal_id=?, version=version+1, updated_at=datetime('now')
      WHERE id=?${checked ? ' AND version=?' : ''}`)
      .run(t.title, t.description || null, t.status, t.priority, t.assignee, t.channel, t.due, t.taskType,
        t.clientIds ? JSON.stringify(t.clientIds) : null,
        t.channelScope ? JSON.stringify(t.channelScope) : null,
        t.goalId || null,
        ...(checked ? [req.params.id, t.version] : [req.params.id]));

    if (result.changes === 0) {
      return res.status(409).json({ error: 'version_conflict', current: getTaskDTO(db, req.params.id) });
    }

    if (t.subtasks) upsertSubtasks(db, req.params.id, t.subtasks);
    const row = db.prepare('SELECT version FROM tasks WHERE id = ?').get(req.params.id);
    res.json({ ok: true, version: row.version });
  });

  router.delete('/:id', (req, res) => {
    db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  return router;
}

module.exports = { createTasksRouter };
