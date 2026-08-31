const express = require('express');

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

function createGoalsRouter(db) {
  const router = express.Router();

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

  // POST /api/goals — create
  router.post('/', (req, res) => {
    const g = req.body;
    db.prepare(`INSERT INTO goals (id, title, status, progress, owner, channel, period, client_ids, channel_scope, template_id, monitor_until)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(g.id, g.title, g.status, g.progress, g.owner, g.channel, g.period,
        g.clientIds ? JSON.stringify(g.clientIds) : null,
        g.channelScope ? JSON.stringify(g.channelScope) : null,
        g.templateId || null, g.monitorUntil || null);

    if (g.keyResults?.length) {
      upsertKeyResults(db, g.id, g.keyResults);
    }

    res.status(201).json({ ok: true, id: g.id });
  });

  // PUT /api/goals/:id — update. When the body carries `version`, the write is
  // compare-and-swap: stale versions 409 with the current row. Bodies without
  // a version keep last-write-wins (older clients).
  router.put('/:id', (req, res) => {
    const g = req.body;
    const existing = db.prepare('SELECT id FROM goals WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Goal not found' });

    const checked = typeof g.version === 'number';
    const result = db.prepare(`UPDATE goals SET title=?, status=?, progress=?, owner=?, channel=?, period=?,
      client_ids=?, channel_scope=?, template_id=?, monitor_until=?, version=version+1, updated_at=datetime('now')
      WHERE id=?${checked ? ' AND version=?' : ''}`)
      .run(g.title, g.status, g.progress, g.owner, g.channel, g.period,
        g.clientIds ? JSON.stringify(g.clientIds) : null,
        g.channelScope ? JSON.stringify(g.channelScope) : null,
        g.templateId || null, g.monitorUntil || null,
        ...(checked ? [req.params.id, g.version] : [req.params.id]));

    if (result.changes === 0) {
      return res.status(409).json({ error: 'version_conflict', current: getGoalDTO(db, req.params.id) });
    }

    if (g.keyResults) {
      upsertKeyResults(db, req.params.id, g.keyResults);
    }

    const row = db.prepare('SELECT version FROM goals WHERE id = ?').get(req.params.id);
    res.json({ ok: true, version: row.version });
  });

  // DELETE /api/goals/:id
  router.delete('/:id', (req, res) => {
    const result = db.prepare('DELETE FROM goals WHERE id = ?').run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Goal not found' });
    res.json({ ok: true });
  });

  // POST /api/goals/:id/check-in — record a KR check-in
  router.post('/:id/check-in', (req, res) => {
    const { krId, value, confidence, note, actor } = req.body;
    const kr = db.prepare('SELECT * FROM key_results WHERE id = ? AND goal_id = ?').get(krId, req.params.id);
    if (!kr) return res.status(404).json({ error: 'Key result not found' });

    // Insert history entry. Values and progress are NOT computed here: the
    // client owns progress semantics (direction-aware krProgress) and PUTs the
    // recalculated goal alongside this call.
    db.prepare('INSERT INTO kr_history (kr_id, timestamp, value, confidence, note, actor, source) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(krId, new Date().toISOString(), value, confidence || null, note || null, actor, 'check-in');

    // Bump the goal so /api/sync/changes propagates this check-in even if the
    // client's follow-up PUT is lost.
    db.prepare("UPDATE goals SET updated_at=datetime('now') WHERE id=?").run(req.params.id);

    // Prune history to 100 entries
    const count = db.prepare('SELECT COUNT(*) as c FROM kr_history WHERE kr_id = ?').get(krId).c;
    if (count > 100) {
      db.prepare(`DELETE FROM kr_history WHERE id IN (
        SELECT id FROM kr_history WHERE kr_id = ? ORDER BY timestamp ASC LIMIT ?
      )`).run(krId, count - 75);
    }

    res.json({ ok: true });
  });

  return router;
}

module.exports = { createGoalsRouter, toGoalDTO, upsertKeyResults };
