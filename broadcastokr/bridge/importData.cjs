const { goalBodyProblem, upsertKeyResults } = require('./routes/goals.cjs');
const { taskBodyProblem, upsertSubtasks } = require('./routes/tasks.cjs');
const { upsertKRTemplates } = require('./routes/templates.cjs');
const { KINDS, deleteWithMarker } = require('./syncDeletions.cjs');
const { isFleetAllowed, hasEntitlement, TIER } = require('./editions.cjs');
const { capViolation } = require('./entitlements.cjs');
const { sha256Hex } = require('./utils/crypto.cjs');
const { audit } = require('./audit.cjs');

const SLICES = ['clients', 'goalTemplates', 'goals', 'tasks', 'kpis'];
const text = (v) => typeof v === 'string' && !!v.trim();
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const json = (v) => v == null ? null : JSON.stringify(v);

class ImportError extends Error {
  constructor(detail, status = 400, error = 'invalid_import') {
    super(detail);
    this.status = status;
    this.body = { error, detail };
  }
}
const requireValid = (condition, detail) => { if (!condition) throw new ImportError(detail); };

function validateRows(data) {
  requireValid(data && typeof data === 'object' && !Array.isArray(data), 'data must be an object');
  requireValid(Object.keys(data).every((k) => SLICES.includes(k)), 'Only goals, tasks, clients, goalTemplates and kpis can be imported; identities and credentials are managed separately');
  requireValid(Object.values(data).some((v) => Array.isArray(v) && v.length), 'No importable data');
  for (const kind of Object.keys(data)) {
    const rows = data[kind];
    requireValid(Array.isArray(rows), `${kind} must be an array`);
    const ids = new Set();
    for (const row of rows) {
      const key = kind === 'kpis' ? row?.name : row?.id;
      requireValid(text(key), `${kind} needs a non-empty ${kind === 'kpis' ? 'name' : 'id'}`);
      requireValid(!ids.has(key), `Duplicate ${kind} identifier: ${key}`);
      ids.add(key);
      if (kind === 'goals') {
        const problem = goalBodyProblem(row, { create: true });
        requireValid(!problem, `${key}: ${problem}`);
        for (const kr of row.keyResults || []) {
          requireValid(kr.history === undefined || Array.isArray(kr.history), `${kr.id}: history must be an array`);
          for (const h of kr.history || []) {
            requireValid(h && text(h.timestamp) && Number.isFinite(Date.parse(h.timestamp)) && finite(h.value)
              && text(h.actor) && ['check-in', 'sync'].includes(h.source)
              && (h.note == null || typeof h.note === 'string')
              && (h.confidence == null || typeof h.confidence === 'string'), `${kr.id}: invalid history entry`);
          }
        }
      } else if (kind === 'tasks') {
        const problem = taskBodyProblem(row, { create: true });
        requireValid(!problem, `${key}: ${problem}`);
        requireValid(text(row.priority) && typeof row.due === 'string' && text(row.taskType), `${key}: priority, due and taskType are required`);
      } else if (kind === 'clients') {
        requireValid(text(row.name) && typeof row.color === 'string' && Array.isArray(row.channels), `${key}: name, color and channels are required`);
        requireValid(row.connectionId == null || typeof row.connectionId === 'string', `${key}: connectionId must be a string`);
      } else if (kind === 'goalTemplates') {
        requireValid(text(row.title) && typeof row.category === 'string' && typeof row.period === 'string' && Array.isArray(row.krTemplates), `${key}: invalid template`);
        const krIds = new Set();
        for (const kr of row.krTemplates) {
          requireValid(kr && text(kr.id) && !krIds.has(kr.id) && typeof kr.title === 'string' && typeof kr.sql === 'string'
            && typeof kr.unit === 'string' && ['hi', 'lo'].includes(kr.direction)
            && finite(kr.start) && finite(kr.target), `${key}: invalid or duplicate KR template`);
          krIds.add(kr.id);
        }
      } else {
        requireValid(typeof row.unit === 'string' && ['hi', 'lo'].includes(row.direction) && finite(row.target)
          && finite(row.current) && Array.isArray(row.trend) && row.trend.every(finite), `${key}: invalid KPI`);
      }
    }
  }
}

function validateReferences(db, data, mode) {
  const finalIds = (kind) => new Set([
    ...(mode === 'replace' && data[kind] ? [] : db.prepare(`SELECT id FROM ${KINDS[kind]}`).all().map((r) => r.id)),
    ...(data[kind] || []).map((r) => r.id),
  ]);
  const clients = finalIds('clients');
  const goals = finalIds('goals');
  const templates = finalIds('goalTemplates');
  for (const kind of ['goals', 'tasks']) {
    for (const row of data[kind] || []) {
      const user = kind === 'goals' ? row.owner : row.assignee;
      requireValid(Number.isInteger(user) && !!db.prepare('SELECT id FROM users WHERE id=?').get(user), `${row.id}: unknown ${kind === 'goals' ? 'owner' : 'assignee'}; map it to an existing user`);
      requireValid(Number.isInteger(row.channel) && row.channel >= 0, `${row.id}: channel must be a non-negative integer`);
      requireValid(row.clientIds == null || (Array.isArray(row.clientIds) && row.clientIds.every((id) => clients.has(id))), `${row.id}: unknown client reference`);
      if (kind === 'goals') {
        requireValid(typeof row.period === 'string', `${row.id}: period must be a string`);
        requireValid(!row.templateId || templates.has(row.templateId), `${row.id}: unknown goal template`);
      } else requireValid(!row.goalId || goals.has(row.goalId), `${row.id}: unknown goal reference`);
    }
  }
  // A replace must not leave retained goals/tasks pointing to removed clients.
  if (mode === 'replace' && data.clients) {
    for (const kind of ['goals', 'tasks']) {
      const incoming = new Set((data[kind] || []).map((r) => r.id));
      const retained = data[kind] ? [] : db.prepare(`SELECT id, client_ids FROM ${kind}`).all();
      for (const row of retained) requireValid(incoming.has(row.id) || JSON.parse(row.client_ids || '[]').every((id) => clients.has(id)), `${row.id}: still references a client this import would remove`);
    }
  }
  const seenKRs = new Set();
  const seenTemplates = new Set();
  for (const g of data.goals || []) {
    for (const kr of g.keyResults || []) {
      const existing = db.prepare('SELECT goal_id FROM key_results WHERE id=?').get(kr.id);
      requireValid(!seenKRs.has(kr.id) && (!existing || existing.goal_id === g.id), `${kr.id}: KR identifier belongs to another goal`);
      seenKRs.add(kr.id);
    }
  }
  for (const t of data.goalTemplates || []) {
    for (const kr of t.krTemplates) {
      const existing = db.prepare('SELECT template_id FROM kr_templates WHERE id=?').get(kr.id);
      requireValid(!seenTemplates.has(kr.id) && (!existing || existing.template_id === t.id), `${kr.id}: KR template identifier belongs to another template`);
      seenTemplates.add(kr.id);
    }
  }
}

function writeRows(db, data) {
  for (const c of data.clients || []) db.prepare(`INSERT INTO clients (id,name,connection_id,logo,color,tags,channels,sql_overrides,monitor_until)
    VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,connection_id=excluded.connection_id,logo=excluded.logo,
    color=excluded.color,tags=excluded.tags,channels=excluded.channels,sql_overrides=excluded.sql_overrides,monitor_until=excluded.monitor_until,updated_at=datetime('now')`)
    .run(c.id,c.name,c.connectionId || '',c.logo || null,c.color,json(c.tags),json(c.channels),json(c.sqlOverrides),c.monitorUntil || null);
  for (const t of data.goalTemplates || []) {
    db.prepare(`INSERT INTO goal_templates (id,title,category,period,sync_interval_ms) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
      title=excluded.title,category=excluded.category,period=excluded.period,sync_interval_ms=excluded.sync_interval_ms,updated_at=datetime('now')`)
      .run(t.id,t.title,t.category,t.period,t.syncIntervalMs || null);
    upsertKRTemplates(db,t.id,t.krTemplates);
  }
  for (const g of data.goals || []) {
    db.prepare(`INSERT INTO goals (id,title,status,progress,owner,channel,period,client_ids,channel_scope,template_id,monitor_until,archived)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,status=excluded.status,progress=excluded.progress,
      owner=excluded.owner,channel=excluded.channel,period=excluded.period,client_ids=excluded.client_ids,channel_scope=excluded.channel_scope,
      template_id=excluded.template_id,monitor_until=excluded.monitor_until,archived=excluded.archived,version=goals.version+1,updated_at=datetime('now')`)
      .run(g.id,g.title,g.status,g.progress,g.owner,g.channel,g.period,json(g.clientIds),json(g.channelScope),g.templateId || null,g.monitorUntil || null,g.archived ? 1 : 0);
    upsertKeyResults(db,g.id,g.keyResults || []);
    for (const kr of g.keyResults || []) {
      db.prepare('DELETE FROM kr_history WHERE kr_id=?').run(kr.id);
      const history = db.prepare('INSERT INTO kr_history (kr_id,timestamp,value,confidence,note,actor,source) VALUES (?,?,?,?,?,?,?)');
      const newest = [...(kr.history || [])].sort((a,b) => Date.parse(a.timestamp) - Date.parse(b.timestamp)).slice(-100);
      for (const h of newest) history.run(kr.id,h.timestamp,h.value,h.confidence || null,h.note || null,h.actor,h.source);
    }
  }
  for (const t of data.tasks || []) {
    db.prepare(`INSERT INTO tasks (id,title,description,status,priority,assignee,channel,due,task_type,client_ids,channel_scope,goal_id)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,description=excluded.description,status=excluded.status,
      priority=excluded.priority,assignee=excluded.assignee,channel=excluded.channel,due=excluded.due,task_type=excluded.task_type,
      client_ids=excluded.client_ids,channel_scope=excluded.channel_scope,goal_id=excluded.goal_id,version=tasks.version+1,updated_at=datetime('now')`)
      .run(t.id,t.title,t.description || null,t.status,t.priority,t.assignee,t.channel,t.due,t.taskType,json(t.clientIds),json(t.channelScope),t.goalId || null);
    upsertSubtasks(db,t.id,t.subtasks || []);
  }
  for (const k of data.kpis || []) db.prepare(`INSERT INTO kpis (name,unit,direction,target,current_val,trend) VALUES (?,?,?,?,?,?)
    ON CONFLICT(name) DO UPDATE SET unit=excluded.unit,direction=excluded.direction,target=excluded.target,current_val=excluded.current_val,
    trend=excluded.trend,updated_at=datetime('now')`).run(k.name,k.unit,k.direction,k.target,k.current,json(k.trend));
}

function createImporter(db, policy = { isFleetAllowed, hasEntitlement, capViolation, tier: TIER }) {
  return db.transaction((body, req) => {
    requireValid(body && ['append', 'replace'].includes(body.mode), 'mode must be append or replace');
    requireValid(text(body.operationId) && body.operationId.length <= 128, 'operationId must be a non-empty string of at most 128 characters');
    const { data, mode, operationId } = body;
    const hash = sha256Hex(JSON.stringify({ mode, data }));
    const principal = req.user?.id ? `user:${req.user.id}` : 'desktop';
    const receipt = db.prepare('SELECT * FROM import_operations WHERE operation_id=?').get(operationId);
    if (receipt) {
      if (receipt.principal !== principal || receipt.payload_hash !== hash) throw new ImportError('operationId was already used for another import', 409, 'operation_conflict');
      return JSON.parse(receipt.result_json);
    }
    validateRows(data);
    validateReferences(db, data, mode);
    const need = (feature) => {
      if (!policy.hasEntitlement(feature)) throw new ImportError(`This instance's ${policy.tier} licence does not include ${feature}`, 403, 'entitlement');
    };
    if (data.goalTemplates?.length) need('templates');
    if (data.kpis?.length || data.goals?.some((g) => g.keyResults?.some((kr) => kr.liveConfig))) need('liveKRs');
    if (data.goals?.some((g) => g.keyResults?.some((kr) => kr.sharedWithMediagenix))) need('sharing');
    if (data.clients) {
      const existing = db.prepare('SELECT id, channels FROM clients').all();
      if (!policy.isFleetAllowed) {
        const ids = new Set([...existing.map((c) => c.id), ...data.clients.map((c) => c.id)]);
        if (ids.size !== 1 || (mode === 'replace' && data.clients.length !== 1)) throw new ImportError('Import must preserve the pinned client', 403, 'single_tenant');
      }
      const remaining = mode === 'replace' ? [] : existing;
      const count = remaining.reduce((n,c) => n + JSON.parse(c.channels || '[]').length, 0) + data.clients.reduce((n,c) => n + c.channels.length, 0);
      const over = policy.capViolation('channels', count);
      if (over) throw new ImportError(over.detail, 403, 'entitlement_cap');
    }
    for (const kind of SLICES) {
      if (!data[kind]) continue;
      const key = kind === 'kpis' ? 'name' : 'id';
      const existing = db.prepare(`SELECT ${key} AS id FROM ${KINDS[kind]}`).all();
      const incoming = new Set(data[kind].map((r) => r[key]));
      if (mode === 'append' && existing.some((r) => incoming.has(r.id))) throw new ImportError(`${kind} contains an existing identifier; use Replace to replace this category`, 409, 'duplicate');
    }
    // Remove absent parents, preserving metadata and versions on retained ids.
    if (mode === 'replace') {
      for (const kind of ['tasks', 'goals', 'goalTemplates', 'clients', 'kpis']) {
        if (!data[kind]) continue;
        const key = kind === 'kpis' ? 'name' : 'id';
        const incoming = new Set(data[kind].map((r) => r[key]));
        const invalidate = kind === 'goals' ? 'tasks' : kind === 'goalTemplates' ? 'goals' : null;
        for (const { id } of db.prepare(`SELECT ${key} AS id FROM ${KINDS[kind]}`).all()) {
          if (!incoming.has(id)) deleteWithMarker(db, kind, id, { invalidate: invalidate ? [{ table: invalidate, where: kind === 'goals' ? 'goal_id=?' : 'template_id=?', params: [id] }] : [] });
        }
      }
    }
    writeRows(db, data);
    const counts = Object.fromEntries(SLICES.map((k) => [k, data[k]?.length || 0]));
    const result = { ok: true, counts };
    db.prepare("DELETE FROM import_operations WHERE created_at < datetime('now', '-1 day')").run();
    db.prepare('INSERT INTO import_operations (operation_id,principal,payload_hash,result_json) VALUES (?,?,?,?)').run(operationId,principal,hash,JSON.stringify(result));
    audit(db, req, `Imported data (${mode}): ${Object.values(counts).reduce((n,c) => n+c, 0)} items`);
    return result;
  });
}

module.exports = { createImporter, ImportError };
