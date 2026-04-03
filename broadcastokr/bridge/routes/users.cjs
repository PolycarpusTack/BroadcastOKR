const express = require('express');

function toUserDTO(row) {
  return {
    id: row.id, name: row.name, role: row.role, av: row.av, color: row.color,
    dept: row.dept, title: row.title, email: row.email || undefined,
    phone: row.phone || undefined, avatarUrl: row.avatar_url || undefined,
    clientIds: row.client_ids ? JSON.parse(row.client_ids) : undefined,
    skills: row.skills ? JSON.parse(row.skills) : undefined,
  };
}

function createUsersRouter(db) {
  const router = express.Router();

  router.get('/', (req, res) => {
    res.json(db.prepare('SELECT * FROM users ORDER BY id').all().map(toUserDTO));
  });

  router.post('/', (req, res) => {
    const u = req.body;
    db.prepare(`INSERT INTO users (id, name, role, av, color, dept, title, email, phone, avatar_url, client_ids, skills)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(u.id, u.name, u.role, u.av, u.color, u.dept, u.title, u.email || null, u.phone || null,
        u.avatarUrl || null, u.clientIds ? JSON.stringify(u.clientIds) : null, u.skills ? JSON.stringify(u.skills) : null);
    res.status(201).json({ ok: true, id: u.id });
  });

  router.put('/:id', (req, res) => {
    const u = req.body;
    db.prepare(`UPDATE users SET name=?, role=?, av=?, color=?, dept=?, title=?, email=?, phone=?,
      avatar_url=?, client_ids=?, skills=?, updated_at=datetime('now') WHERE id=?`)
      .run(u.name, u.role, u.av, u.color, u.dept, u.title, u.email || null, u.phone || null,
        u.avatarUrl || null, u.clientIds ? JSON.stringify(u.clientIds) : null, u.skills ? JSON.stringify(u.skills) : null,
        req.params.id);
    res.json({ ok: true });
  });

  router.delete('/:id', (req, res) => {
    db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  return router;
}

module.exports = { createUsersRouter };
