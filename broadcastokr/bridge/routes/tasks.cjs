const express = require('express');

function toTaskDTO(row, subtasks) {
  return {
    id: row.id, title: row.title, description: row.description || undefined,
    status: row.status, priority: row.priority, assignee: row.assignee,
    channel: row.channel, due: row.due, taskType: row.task_type,
    clientIds: row.client_ids ? JSON.parse(row.client_ids) : undefined,
    channelScope: row.channel_scope ? JSON.parse(row.channel_scope) : undefined,
    goalId: row.goal_id || undefined,
    subtasks: subtasks.map(s => ({ text: s.text, done: !!s.done })),
  };
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

  router.put('/:id', (req, res) => {
    const t = req.body;
    db.prepare(`UPDATE tasks SET title=?, description=?, status=?, priority=?, assignee=?, channel=?, due=?, task_type=?,
      client_ids=?, channel_scope=?, goal_id=?, updated_at=datetime('now') WHERE id=?`)
      .run(t.title, t.description || null, t.status, t.priority, t.assignee, t.channel, t.due, t.taskType,
        t.clientIds ? JSON.stringify(t.clientIds) : null,
        t.channelScope ? JSON.stringify(t.channelScope) : null,
        t.goalId || null, req.params.id);
    if (t.subtasks) upsertSubtasks(db, req.params.id, t.subtasks);
    res.json({ ok: true });
  });

  router.delete('/:id', (req, res) => {
    db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  return router;
}

module.exports = { createTasksRouter };
