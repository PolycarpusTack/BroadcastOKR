const express = require('express');

function toTemplateDTO(row, krTemplates) {
  return {
    id: row.id, title: row.title, category: row.category, period: row.period,
    syncIntervalMs: row.sync_interval_ms || undefined,
    krTemplates: krTemplates.map(kr => ({
      id: kr.id, title: kr.title, sql: kr.sql, unit: kr.unit, direction: kr.direction,
      start: kr.start_val, target: kr.target_val, timeframeDays: kr.timeframe_days || undefined,
    })),
  };
}

function upsertKRTemplates(db, templateId, krTemplates) {
  const existingIds = new Set(
    db.prepare('SELECT id FROM kr_templates WHERE template_id = ?').all(templateId).map(r => r.id)
  );
  const incomingIds = new Set();
  const upsert = db.prepare(`INSERT INTO kr_templates (id, template_id, title, sql, unit, direction, start_val, target_val, timeframe_days, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET
    title=excluded.title, sql=excluded.sql, unit=excluded.unit, direction=excluded.direction,
    start_val=excluded.start_val, target_val=excluded.target_val, timeframe_days=excluded.timeframe_days, sort_order=excluded.sort_order`);

  krTemplates.forEach((krt, idx) => {
    incomingIds.add(krt.id);
    upsert.run(krt.id, templateId, krt.title, krt.sql, krt.unit, krt.direction, krt.start, krt.target, krt.timeframeDays || null, idx);
  });

  for (const id of existingIds) {
    if (!incomingIds.has(id)) db.prepare('DELETE FROM kr_templates WHERE id = ?').run(id);
  }
}

function createTemplatesRouter(db) {
  const router = express.Router();

  router.get('/', (req, res) => {
    const templates = db.prepare('SELECT * FROM goal_templates ORDER BY title').all();
    const allKRTs = db.prepare('SELECT * FROM kr_templates ORDER BY sort_order').all();
    const krtByTemplate = new Map();
    for (const krt of allKRTs) {
      if (!krtByTemplate.has(krt.template_id)) krtByTemplate.set(krt.template_id, []);
      krtByTemplate.get(krt.template_id).push(krt);
    }
    res.json(templates.map(t => toTemplateDTO(t, krtByTemplate.get(t.id) || [])));
  });

  router.post('/', (req, res) => {
    const t = req.body;
    db.prepare('INSERT INTO goal_templates (id, title, category, period, sync_interval_ms) VALUES (?, ?, ?, ?, ?)')
      .run(t.id, t.title, t.category, t.period, t.syncIntervalMs || null);
    if (t.krTemplates?.length) upsertKRTemplates(db, t.id, t.krTemplates);
    res.status(201).json({ ok: true, id: t.id });
  });

  router.put('/:id', (req, res) => {
    const t = req.body;
    db.prepare("UPDATE goal_templates SET title=?, category=?, period=?, sync_interval_ms=?, updated_at=datetime('now') WHERE id=?")
      .run(t.title, t.category, t.period, t.syncIntervalMs || null, req.params.id);
    if (t.krTemplates) upsertKRTemplates(db, req.params.id, t.krTemplates);
    res.json({ ok: true });
  });

  router.delete('/:id', (req, res) => {
    db.prepare('DELETE FROM goal_templates WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  return router;
}

module.exports = { createTemplatesRouter };
