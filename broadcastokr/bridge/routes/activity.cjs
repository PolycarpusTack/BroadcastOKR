const { createRouter } = require('../utils/router.cjs');
const { MODE } = require('../editions.cjs');
const { actorName } = require('../audit.cjs');

const RETENTION_DAYS = 90;

function createActivityRouter(db) {
  const router = createRouter();

  // GET /api/activity?limit=100 — newest first
  router.get('/', (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const rows = db.prepare(
      'SELECT id, timestamp, actor, text, color FROM activity_log ORDER BY id DESC LIMIT ?',
    ).all(limit);
    res.json(rows);
  });

  // POST /api/activity — { actor, text, color? }
  router.post('/', (req, res) => {
    const { actor, text, color } = req.body;
    // Cloud modes derive the actor from the session; the body claim is ignored
    const effectiveActor = MODE !== 'desktop' && req.user ? actorName(db, req) : actor;
    if (!effectiveActor || !text) return res.status(400).json({ error: 'actor and text required' });
    const result = db.prepare('INSERT INTO activity_log (actor, text, color) VALUES (?, ?, ?)')
      .run(String(effectiveActor), String(text), color ? String(color) : null);
    db.prepare(`DELETE FROM activity_log WHERE timestamp < datetime('now', '-${RETENTION_DAYS} days')`).run();
    res.status(201).json({ ok: true, id: result.lastInsertRowid });
  });

  return router;
}

module.exports = { createActivityRouter };
