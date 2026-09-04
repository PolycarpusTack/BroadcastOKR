const { createRouter } = require('../utils/router.cjs');
const { isFleetAllowed } = require('../editions.cjs');
const { capViolation } = require('../entitlements.cjs');

/** Channels licensed across the instance's clients, after this client's write. */
function channelsAfter(db, id, channels) {
  const others = db.prepare('SELECT id, channels FROM clients').all()
    .filter((c) => c.id !== id)
    .reduce((n, c) => { try { return n + (JSON.parse(c.channels || '[]').length || 0); } catch { return n; } }, 0);
  return others + (Array.isArray(channels) ? channels.length : 0);
}

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
  const router = createRouter();

  router.get('/', (req, res) => {
    const rows = db.prepare('SELECT * FROM clients ORDER BY name').all();
    res.json(rows.map(toClientDTO));
  });

  router.post('/', (req, res) => {
    const c = req.body;
    // Single-tenant instances are pinned to exactly one client row
    if (!isFleetAllowed) {
      const count = db.prepare('SELECT COUNT(*) AS c FROM clients').get().c;
      if (count >= 1) return res.status(403).json({ error: 'single_tenant' });
    }
    const overCap = capViolation('channels', channelsAfter(db, c.id, c.channels));
    if (overCap) return res.status(403).json(overCap);
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
    const overCap = capViolation('channels', channelsAfter(db, req.params.id, c.channels));
    if (overCap) return res.status(403).json(overCap);
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
    if (!isFleetAllowed) {
      const count = db.prepare('SELECT COUNT(*) AS c FROM clients').get().c;
      if (count <= 1) return res.status(403).json({ error: 'single_tenant' });
    }
    db.prepare('DELETE FROM clients WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  return router;
}

module.exports = { createClientsRouter };
