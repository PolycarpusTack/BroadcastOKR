const { createRouter } = require('../utils/router.cjs');
const { audit } = require('../audit.cjs');
const { sha256Hex } = require('../utils/crypto.cjs');

/**
 * Convert a goal DB row + its key_results rows into the frontend Goal shape.
 */
function toGoalDTO(goalRow, krs, historyMap) {
  return {
    id: goalRow.id,
    title: goalRow.title,
    status: goalRow.status,
    progress: goalRow.progress,
    owner: goalRow.owner,
    channel: goalRow.channel,
    period: goalRow.period,
    clientIds: goalRow.client_ids ? JSON.parse(goalRow.client_ids) : undefined,
    channelScope: goalRow.channel_scope ? JSON.parse(goalRow.channel_scope) : undefined,
    templateId: goalRow.template_id || undefined,
    monitorUntil: goalRow.monitor_until || undefined,
    archived: !!goalRow.archived,
    version: goalRow.version ?? 0,
    keyResults: krs.map(kr => ({
      id: kr.id,
      title: kr.title,
      start: kr.start_val,
      target: kr.target_val,
      current: kr.current_val,
      progress: kr.progress,
      status: kr.status,
      liveConfig: kr.live_config ? JSON.parse(kr.live_config) : undefined,
      syncStatus: kr.sync_status || undefined,
      syncError: kr.sync_error || undefined,
      lastSyncAt: kr.last_sync_at || undefined,
      krTemplateId: kr.kr_template_id || undefined,
      sharedWithMediagenix: !!kr.shared_with_mediagenix,
      history: historyMap.get(kr.id) || undefined,
    })),
  };
}

// ── ADR-B1 (F7): validate before mutating, mutate inside one transaction ──

const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v);
const isOptionalString = (v) => v === undefined || v === null || typeof v === 'string';

/** 400 reason for a goal body the route cannot store, or null. `create` also demands an id. */
function goalBodyProblem(g, { create = false } = {}) {
  if (!g || typeof g !== 'object' || Array.isArray(g)) return 'body must be an object';
  if (create && (typeof g.id !== 'string' || !g.id)) return 'id must be a non-empty string';
  if (typeof g.title !== 'string' || !g.title.trim()) return 'title must be a non-empty string';
  if (typeof g.status !== 'string' || !g.status) return 'status must be a non-empty string';
  if (!isFiniteNumber(g.progress)) return 'progress must be a finite number';
  if (g.version !== undefined && typeof g.version !== 'number') return 'version must be a number';
  if (g.keyResults !== undefined) {
    if (!Array.isArray(g.keyResults)) return 'keyResults must be an array';
    const ids = new Set();
    for (let i = 0; i < g.keyResults.length; i++) {
      const kr = g.keyResults[i];
      const at = `keyResults[${i}]`;
      if (!kr || typeof kr !== 'object' || Array.isArray(kr)) return `${at} must be an object`;
      if (typeof kr.id !== 'string' || !kr.id) return `${at}.id must be a non-empty string`;
      if (ids.has(kr.id)) return `${at}.id '${kr.id}' appears twice`;
      ids.add(kr.id);
      if (typeof kr.title !== 'string') return `${at}.title must be a string`;
      for (const f of ['start', 'target', 'current', 'progress']) {
        if (!isFiniteNumber(kr[f])) return `${at}.${f} must be a finite number`;
      }
      if (typeof kr.status !== 'string' || !kr.status) return `${at}.status must be a non-empty string`;
      for (const f of ['syncStatus', 'syncError', 'lastSyncAt', 'krTemplateId']) {
        if (!isOptionalString(kr[f])) return `${at}.${f} must be a string`;
      }
      if (kr.liveConfig !== undefined && kr.liveConfig !== null && (typeof kr.liveConfig !== 'object' || Array.isArray(kr.liveConfig))) {
        return `${at}.liveConfig must be an object`;
      }
    }
  }
  return null;
}

/** The first incoming KR id that already belongs to a different goal, or null. */
function foreignKeyResult(db, goalId, keyResults) {
  const owned = db.prepare('SELECT goal_id FROM key_results WHERE id = ?');
  for (const kr of keyResults || []) {
    const row = owned.get(kr.id);
    if (row && row.goal_id !== goalId) return kr.id;
  }
  return null;
}

/**
 * Insert or update key results for a goal. Handles the diff:
 * existing KRs are updated, new KRs inserted, removed KRs deleted.
 */
function upsertKeyResults(db, goalId, keyResults) {
  const existingIds = new Set(
    db.prepare('SELECT id FROM key_results WHERE goal_id = ?').all(goalId).map(r => r.id)
  );
  const incomingIds = new Set();

  const upsert = db.prepare(`
    INSERT INTO key_results (id, goal_id, title, start_val, target_val, current_val, progress, status, live_config, sync_status, sync_error, last_sync_at, kr_template_id, shared_with_mediagenix, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title=excluded.title, start_val=excluded.start_val, target_val=excluded.target_val,
      current_val=excluded.current_val, progress=excluded.progress, status=excluded.status,
      live_config=excluded.live_config, sync_status=excluded.sync_status, sync_error=excluded.sync_error,
      last_sync_at=excluded.last_sync_at, kr_template_id=excluded.kr_template_id,
      shared_with_mediagenix=excluded.shared_with_mediagenix, sort_order=excluded.sort_order
  `);

  keyResults.forEach((kr, idx) => {
    incomingIds.add(kr.id);
    upsert.run(
      kr.id, goalId, kr.title, kr.start, kr.target, kr.current, kr.progress, kr.status,
      kr.liveConfig ? JSON.stringify(kr.liveConfig) : null,
      kr.syncStatus || null, kr.syncError || null, kr.lastSyncAt || null,
      kr.krTemplateId || null, kr.sharedWithMediagenix ? 1 : 0, idx
    );
  });

  // Delete KRs that were removed
  for (const id of existingIds) {
    if (!incomingIds.has(id)) {
      db.prepare('DELETE FROM key_results WHERE id = ?').run(id);
    }
  }
}

function pruneHistory(db, krId) {
  const count = db.prepare('SELECT COUNT(*) as c FROM kr_history WHERE kr_id = ?').get(krId).c;
  if (count > 100) {
    db.prepare(`DELETE FROM kr_history WHERE id IN (
      SELECT id FROM kr_history WHERE kr_id = ? ORDER BY timestamp ASC LIMIT ?
    )`).run(krId, count - 75);
  }
}

/** Full DTO for one goal (KRs + history), or null when it doesn't exist. */
function getGoalDTO(db, id) {
  const goal = db.prepare('SELECT * FROM goals WHERE id = ?').get(id);
  if (!goal) return null;
  const krs = db.prepare('SELECT * FROM key_results WHERE goal_id = ? ORDER BY sort_order').all(id);
  const historyByKR = new Map();
  for (const kr of krs) {
    const history = db.prepare('SELECT * FROM kr_history WHERE kr_id = ? ORDER BY timestamp DESC').all(kr.id);
    if (history.length > 0) {
      historyByKR.set(kr.id, history.map(h => ({
        timestamp: h.timestamp, value: h.value, confidence: h.confidence || undefined,
        note: h.note || undefined, actor: h.actor, source: h.source,
      })));
    }
  }
  return toGoalDTO(goal, krs, historyByKR);
}

// ── ADR-B3 (F4): the check-in command ──

const OPERATION_RETENTION_HOURS = 24;
const OPERATION_ID_MAX = 128;

/** 400 reason for a check-in body, or null. */
function checkInBodyProblem(b) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return 'body must be an object';
  if (typeof b.krId !== 'string' || !b.krId) return 'krId must be a non-empty string';
  if (!isFiniteNumber(b.value)) return 'value must be a finite number';
  if (!isOptionalString(b.confidence)) return 'confidence must be a string';
  if (!isOptionalString(b.note)) return 'note must be a string';
  if (b.operationId !== undefined && b.operationId !== null
    && (typeof b.operationId !== 'string' || !b.operationId || b.operationId.length > OPERATION_ID_MAX)) {
    return `operationId must be a string of at most ${OPERATION_ID_MAX} characters`;
  }
  return null;
}

/**
 * Who a check-in is attributed to. Cloud sessions are trusted (the name on the
 * user row); the desktop API key has no session, so the persona in the body
 * stands, as before.
 */
function checkInActor(db, req, body) {
  if (req.user?.id) {
    const u = db.prepare('SELECT name FROM users WHERE id = ?').get(req.user.id);
    return { principal: `user:${req.user.id}`, actor: u?.name || `user#${req.user.id}` };
  }
  const actor = typeof body.actor === 'string' && body.actor.trim() ? body.actor.trim() : 'desktop';
  return { principal: 'desktop', actor };
}

function createGoalsRouter(db) {
  const router = createRouter();

  // GET /api/goals — list all goals with nested keyResults
  router.get('/', (req, res) => {
    const goals = db.prepare('SELECT * FROM goals ORDER BY created_at DESC').all();
    const allKRs = db.prepare('SELECT * FROM key_results ORDER BY sort_order').all();
    const allHistory = db.prepare('SELECT * FROM kr_history ORDER BY timestamp DESC').all();

    // Group KRs and history by goal/kr
    const krsByGoal = new Map();
    for (const kr of allKRs) {
      if (!krsByGoal.has(kr.goal_id)) krsByGoal.set(kr.goal_id, []);
      krsByGoal.get(kr.goal_id).push(kr);
    }

    const historyByKR = new Map();
    for (const h of allHistory) {
      if (!historyByKR.has(h.kr_id)) historyByKR.set(h.kr_id, []);
      historyByKR.get(h.kr_id).push({
        timestamp: h.timestamp,
        value: h.value,
        confidence: h.confidence || undefined,
        note: h.note || undefined,
        actor: h.actor,
        source: h.source,
      });
    }

    res.json(goals.map(g => toGoalDTO(g, krsByGoal.get(g.id) || [], historyByKR)));
  });

  // GET /api/goals/:id
  router.get('/:id', (req, res) => {
    const dto = getGoalDTO(db, req.params.id);
    if (!dto) return res.status(404).json({ error: 'Goal not found' });
    res.json(dto);
  });

  // POST /api/goals — create. The whole aggregate lands or nothing does; a
  // retry with the same client-generated id gets 409 duplicate with the row.
  const createGoal = db.transaction((g) => {
    const problem = goalBodyProblem(g, { create: true });
    if (problem) return { status: 400, body: { error: 'invalid_goal', detail: problem } };
    const current = getGoalDTO(db, g.id);
    if (current) return { status: 409, body: { error: 'duplicate', current } };
    const foreign = foreignKeyResult(db, g.id, g.keyResults);
    if (foreign) return { status: 409, body: { error: 'kr_owned_by_other_goal', krId: foreign } };

    db.prepare(`INSERT INTO goals (id, title, status, progress, owner, channel, period, client_ids, channel_scope, template_id, monitor_until, archived)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(g.id, g.title, g.status, g.progress, g.owner, g.channel, g.period,
        g.clientIds ? JSON.stringify(g.clientIds) : null,
        g.channelScope ? JSON.stringify(g.channelScope) : null,
        g.templateId || null, g.monitorUntil || null, g.archived ? 1 : 0);

    if (g.keyResults?.length) {
      upsertKeyResults(db, g.id, g.keyResults);
    }
    return { status: 201, body: { ok: true, id: g.id } };
  });

  router.post('/', (req, res) => {
    const out = createGoal(req.body);
    res.status(out.status).json(out.body);
  });

  // PUT /api/goals/:id — update. When the body carries `version`, the write is
  // compare-and-swap: stale versions 409 with the current row. Bodies without
  // a version keep last-write-wins (older clients). Parent, KRs and the audit
  // rows commit together or not at all.
  const updateGoal = db.transaction((id, g, req) => {
    const existing = db.prepare('SELECT id FROM goals WHERE id = ?').get(id);
    if (!existing) return { status: 404, body: { error: 'Goal not found' } };
    const problem = goalBodyProblem(g);
    if (problem) return { status: 400, body: { error: 'invalid_goal', detail: problem } };
    const foreign = foreignKeyResult(db, id, g.keyResults);
    if (foreign) return { status: 409, body: { error: 'kr_owned_by_other_goal', krId: foreign } };

    const checked = typeof g.version === 'number';
    const result = db.prepare(`UPDATE goals SET title=?, status=?, progress=?, owner=?, channel=?, period=?,
      client_ids=?, channel_scope=?, template_id=?, monitor_until=?, archived=?, version=version+1, updated_at=datetime('now')
      WHERE id=?${checked ? ' AND version=?' : ''}`)
      .run(g.title, g.status, g.progress, g.owner, g.channel, g.period,
        g.clientIds ? JSON.stringify(g.clientIds) : null,
        g.channelScope ? JSON.stringify(g.channelScope) : null,
        g.templateId || null, g.monitorUntil || null, g.archived ? 1 : 0,
        ...(checked ? [id, g.version] : [id]));

    if (result.changes === 0) {
      return { status: 409, body: { error: 'version_conflict', current: getGoalDTO(db, id) } };
    }

    if (g.keyResults) {
      const beforeShared = new Map(db.prepare('SELECT id, shared_with_mediagenix AS s FROM key_results WHERE goal_id = ?')
        .all(id).map(r => [r.id, !!r.s]));
      upsertKeyResults(db, id, g.keyResults);
      for (const kr of g.keyResults) {
        const was = beforeShared.get(kr.id);
        if (was !== undefined && was !== !!kr.sharedWithMediagenix) {
          audit(db, req, `${kr.sharedWithMediagenix ? 'Enabled' : 'Disabled'} Mediagenix sharing for KR '${kr.title}'`);
        }
      }
    }

    const row = db.prepare('SELECT version FROM goals WHERE id = ?').get(id);
    return { status: 200, body: { ok: true, version: row.version } };
  });

  router.put('/:id', (req, res) => {
    const out = updateGoal(req.params.id, req.body, req);
    res.status(out.status).json(out.body);
  });

  // DELETE /api/goals/:id
  router.delete('/:id', (req, res) => {
    const result = db.prepare('DELETE FROM goals WHERE id = ?').run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Goal not found' });
    res.json({ ok: true });
  });

  // POST /api/goals/:id/check-in — one authorised command (ADR-B3, F4).
  //
  // A manual KR takes the measured value: history row, current_val, the
  // parent's version and updated_at — all in one transaction. A live KR keeps
  // its externally synced value and only records the annotation. The response
  // carries the authoritative goal, so the client refreshes from it and no
  // longer needs a structural PUT it may not be allowed to make. Progress and
  // status stay client-computed (krProgress) and are refreshed on the next
  // structural write; every client recomputes them on merge.
  //
  // `operationId` (new clients) makes a retry after a lost response return the
  // same answer instead of a second history row; a different body under the
  // same id is refused. Requests without it are not deduplicated — documented.
  const checkIn = db.transaction((goalId, body, who) => {
    const problem = checkInBodyProblem(body);
    if (problem) return { status: 400, body: { error: 'invalid_checkin', detail: problem } };

    db.prepare(`DELETE FROM checkin_operations WHERE created_at < datetime('now', ?)`)
      .run(`-${OPERATION_RETENTION_HOURS} hours`);

    const operationId = body.operationId || null;
    const digest = sha256Hex(JSON.stringify([goalId, body.krId, body.value, body.confidence ?? null, body.note ?? null]));
    if (operationId) {
      const seen = db.prepare('SELECT digest, response FROM checkin_operations WHERE principal = ? AND operation_id = ?')
        .get(who.principal, operationId);
      if (seen) {
        if (seen.digest !== digest) return { status: 409, body: { error: 'operation_conflict', detail: 'operationId was already used for a different check-in' } };
        return { status: 200, body: { ...JSON.parse(seen.response), replayed: true } };
      }
    }

    const kr = db.prepare('SELECT * FROM key_results WHERE id = ? AND goal_id = ?').get(body.krId, goalId);
    if (!kr) return { status: 404, body: { error: 'Key result not found' } };

    const timestamp = new Date().toISOString();
    db.prepare('INSERT INTO kr_history (kr_id, timestamp, value, confidence, note, actor, source) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(body.krId, timestamp, body.value, body.confidence || null, body.note || null, who.actor, 'check-in');
    pruneHistory(db, body.krId);

    const manual = !kr.live_config;
    if (manual) {
      db.prepare('UPDATE key_results SET current_val = ? WHERE id = ?').run(body.value, body.krId);
    }
    db.prepare("UPDATE goals SET version = version + 1, updated_at = datetime('now') WHERE id = ?").run(goalId);

    const goal = getGoalDTO(db, goalId);
    const response = { ok: true, applied: manual ? 'value' : 'history', goal, version: goal.version, timestamp };
    if (operationId) {
      db.prepare('INSERT INTO checkin_operations (principal, operation_id, goal_id, kr_id, digest, response) VALUES (?, ?, ?, ?, ?, ?)')
        .run(who.principal, operationId, goalId, body.krId, digest, JSON.stringify(response));
    }
    return { status: 200, body: response };
  });

  router.post('/:id/check-in', (req, res) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const out = checkIn(req.params.id, body, checkInActor(db, req, body));
    res.status(out.status).json(out.body);
  });

  return router;
}

module.exports = { createGoalsRouter };
