const express = require('express');

function toClientDTO(row) {
  return {
    id: row.id, name: row.name, connectionId: row.connection_id,
    logo: row.logo || undefined, color: row.color,
    tags: row.tags ? JSON.parse(row.tags) : undefined,
    channels: row.channels ? JSON.parse(row.channels) : [],
    sqlOverrides: row.sql_overrides ? JSON.parse(row.sql_overrides) : undefined,
    monitorUntil: row.monitor_until || undefined,
  };
}

function createClientsRouter(db) {
  const router = express.Router();

  router.get('/', (req, res) => {
    const rows = db.prepare('SELECT * FROM clients ORDER BY name').all();
    res.json(rows.map(toClientDTO));
  });

  router.post('/', (req, res) => {
    const c = req.body;
    db.prepare(`INSERT INTO clients (id, name, connection_id, logo, color, tags, channels, sql_overrides, monitor_until)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(c.id, c.name, c.connectionId || '', c.logo || null, c.color,
        c.tags ? JSON.stringify(c.tags) : null,
        JSON.stringify(c.channels || []),
        c.sqlOverrides ? JSON.stringify(c.sqlOverrides) : null,
        c.monitorUntil || null);
    res.status(201).json({ ok: true, id: c.id });
  });

  router.put('/:id', (req, res) => {
    const c = req.body;
    db.prepare(`UPDATE clients SET name=?, connection_id=?, logo=?, color=?, tags=?, channels=?,
      sql_overrides=?, monitor_until=?, updated_at=datetime('now') WHERE id=?`)
      .run(c.name, c.connectionId || '', c.logo || null, c.color,
        c.tags ? JSON.stringify(c.tags) : null,
        JSON.stringify(c.channels || []),
        c.sqlOverrides ? JSON.stringify(c.sqlOverrides) : null,
        c.monitorUntil || null, req.params.id);
    res.json({ ok: true });
  });

  router.delete('/:id', (req, res) => {
    db.prepare('DELETE FROM clients WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  return router;
}

module.exports = { createClientsRouter };
