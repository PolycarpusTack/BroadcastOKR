const express = require('express');

function toTeamDTO(row, members) {
  return {
    id: row.id, name: row.name, color: row.color, icon: row.icon,
    leadId: row.lead_id || undefined,
    members,
    clientIds: row.client_ids ? JSON.parse(row.client_ids) : undefined,
  };
}

function createTeamsRouter(db) {
  const router = express.Router();

  router.get('/', (req, res) => {
    const teams = db.prepare('SELECT * FROM teams ORDER BY name').all();
    const allMembers = db.prepare('SELECT * FROM team_members').all();
    const membersByTeam = new Map();
    for (const m of allMembers) {
      if (!membersByTeam.has(m.team_id)) membersByTeam.set(m.team_id, []);
      membersByTeam.get(m.team_id).push(m.user_id);
    }
    res.json(teams.map(t => toTeamDTO(t, membersByTeam.get(t.id) || [])));
  });

  router.post('/', (req, res) => {
    const t = req.body;
    db.prepare('INSERT INTO teams (id, name, color, icon, lead_id, client_ids) VALUES (?, ?, ?, ?, ?, ?)')
      .run(t.id, t.name, t.color, t.icon, t.leadId || null, t.clientIds ? JSON.stringify(t.clientIds) : null);
    if (t.members?.length) {
      const insert = db.prepare('INSERT INTO team_members (team_id, user_id) VALUES (?, ?)');
      for (const userId of t.members) insert.run(t.id, userId);
    }
    res.status(201).json({ ok: true, id: t.id });
  });

  router.put('/:id', (req, res) => {
    const t = req.body;
    db.prepare("UPDATE teams SET name=?, color=?, icon=?, lead_id=?, client_ids=?, updated_at=datetime('now') WHERE id=?")
      .run(t.name, t.color, t.icon, t.leadId || null, t.clientIds ? JSON.stringify(t.clientIds) : null, req.params.id);
    db.prepare('DELETE FROM team_members WHERE team_id = ?').run(req.params.id);
    if (t.members?.length) {
      const insert = db.prepare('INSERT INTO team_members (team_id, user_id) VALUES (?, ?)');
      for (const userId of t.members) insert.run(req.params.id, userId);
    }
    res.json({ ok: true });
  });

  router.delete('/:id', (req, res) => {
    db.prepare('DELETE FROM teams WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  return router;
}

module.exports = { createTeamsRouter };
