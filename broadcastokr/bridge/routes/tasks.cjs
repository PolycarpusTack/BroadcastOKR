const { createRouter } = require('../utils/router.cjs');

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

/**
 * ADR-A1 field extension (F5): what a member may change on a task.
 *
 * Members move tasks across the board and tick existing subtasks. Everything
 * else on the DTO is structural (title, description, priority, assignee,
 * channel, due, type, scope, goal link) or is an edit of the subtask list
 * itself (text, order, add, remove). The comparison runs against the stored
 * row inside the same transaction as the write, so the state that was
 * authorised is the state that is replaced.
 */
const STRUCTURAL_FIELDS = ['title', 'description', 'priority', 'assignee', 'channel', 'due', 'taskType', 'clientIds', 'channelScope', 'goalId'];

// undefined / null / '' / [] all mean "nothing here" — a DTO round-tripped
// through JSON or the client store loses the distinction.
function normalizeField(value) {
  if (value === undefined || value === null || value === '') return null;
  if (Array.isArray(value) && value.length === 0) return null;
  return JSON.stringify(value);
}

/** The first field a member is not allowed to change, or null when the write is within policy. */
function memberFieldViolation(stored, next) {
  for (const field of STRUCTURAL_FIELDS) {
    if (normalizeField(stored[field]) !== normalizeField(next[field])) return field;
  }
  const a = stored.subtasks || [];
  const b = next.subtasks || [];
  if (a.length !== b.length) return 'subtasks';
  for (let i = 0; i < a.length; i++) {
    if (a[i].text !== b[i]?.text) return 'subtasks';
  }
  return null;
}

/** 400 reason for a body the route cannot store, or null when it is well-formed. */
function taskBodyProblem(t) {
  if (!t || typeof t !== 'object' || Array.isArray(t)) return 'body must be an object';
  if (typeof t.status !== 'string' || !t.status) return 'status must be a non-empty string';
  if (t.subtasks !== undefined) {
    if (!Array.isArray(t.subtasks)) return 'subtasks must be an array';
    for (const s of t.subtasks) {
      if (!s || typeof s !== 'object' || typeof s.text !== 'string') return 'each subtask needs a text';
    }
  }
  if (t.version !== undefined && typeof t.version !== 'number') return 'version must be a number';
  return null;
}

function upsertSubtasks(db, taskId, subtasks) {
  db.prepare('DELETE FROM subtasks WHERE task_id = ?').run(taskId);
  const insert = db.prepare('INSERT INTO subtasks (task_id, text, done, sort_order) VALUES (?, ?, ?, ?)');
  subtasks.forEach((s, i) => insert.run(taskId, s.text, s.done ? 1 : 0, i));
}

function createTasksRouter(db) {
  const router = createRouter();

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
  //
  // Members (cloud sessions with role 'member') get the field policy above: a
  // full DTO passes when only status / subtask done flags differ, a restricted
  // body ({ status, version } or { subtasks, version }) keeps every omitted
  // field. Owners and managers keep the full-DTO contract unchanged.
  const updateTask = db.transaction((id, body, restricted) => {
    const stored = getTaskDTO(db, id);
    if (!stored) return { status: 404, body: { error: 'Task not found' } };

    const t = restricted ? { ...stored, ...body } : body;
    const problem = taskBodyProblem(t);
    if (problem) return { status: 400, body: { error: 'invalid_task', detail: problem } };

    if (restricted) {
      const field = memberFieldViolation(stored, t);
      if (field) return { status: 403, body: { error: 'Insufficient permissions', field } };
    }

    const checked = typeof t.version === 'number';
    const result = db.prepare(`UPDATE tasks SET title=?, description=?, status=?, priority=?, assignee=?, channel=?, due=?, task_type=?,
      client_ids=?, channel_scope=?, goal_id=?, version=version+1, updated_at=datetime('now')
      WHERE id=?${checked ? ' AND version=?' : ''}`)
      .run(t.title, t.description || null, t.status, t.priority, t.assignee, t.channel, t.due, t.taskType,
        t.clientIds ? JSON.stringify(t.clientIds) : null,
        t.channelScope ? JSON.stringify(t.channelScope) : null,
        t.goalId || null,
        ...(checked ? [id, t.version] : [id]));

    if (result.changes === 0) {
      return { status: 409, body: { error: 'version_conflict', current: stored } };
    }

    if (t.subtasks) upsertSubtasks(db, id, t.subtasks);
    return { status: 200, body: { ok: true, version: stored.version + 1 } };
  });

  router.put('/:id', (req, res) => {
    if (!req.body || typeof req.body !== 'object') return res.status(400).json({ error: 'invalid_task', detail: 'body must be an object' });
    const restricted = req.user?.role === 'member';
    const out = updateTask(req.params.id, req.body, restricted);
    res.status(out.status).json(out.body);
  });

  router.delete('/:id', (req, res) => {
    db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  return router;
}

module.exports = { createTasksRouter };
