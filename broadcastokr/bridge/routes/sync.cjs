const express = require('express');
const fs = require('fs');

function createSyncRouter(db, dbPath) {
  const router = express.Router();

  // GET /api/sync/state — full state snapshot
  router.get('/state', (req, res) => {
    const goals = db.prepare('SELECT * FROM goals ORDER BY created_at DESC').all();
    const keyResults = db.prepare('SELECT * FROM key_results ORDER BY sort_order').all();
    const krHistory = db.prepare('SELECT * FROM kr_history ORDER BY timestamp DESC').all();
    const tasks = db.prepare('SELECT * FROM tasks ORDER BY created_at DESC').all();
    const subtasks = db.prepare('SELECT * FROM subtasks ORDER BY sort_order').all();
    const clients = db.prepare('SELECT * FROM clients ORDER BY name').all();
    const goalTemplates = db.prepare('SELECT * FROM goal_templates ORDER BY title').all();
    const krTemplates = db.prepare('SELECT * FROM kr_templates ORDER BY sort_order').all();
    const users = db.prepare('SELECT * FROM users ORDER BY id').all();
    const teams = db.prepare('SELECT * FROM teams ORDER BY name').all();
    const teamMembers = db.prepare('SELECT * FROM team_members').all();
    const kpis = db.prepare('SELECT * FROM kpis ORDER BY name').all();

    const { assembleState } = require('./sync-helpers.cjs');
    res.json(assembleState({ goals, keyResults, krHistory, tasks, subtasks, clients, goalTemplates, krTemplates, users, teams, teamMembers, kpis }));
  });

  // GET /api/sync/changes?since=<ISO timestamp>
  router.get('/changes', (req, res) => {
    const since = req.query.since;
    if (!since) return res.status(400).json({ error: 'since parameter required' });

    const goals = db.prepare('SELECT * FROM goals WHERE updated_at > ?').all(since);
    const tasks = db.prepare('SELECT * FROM tasks WHERE updated_at > ?').all(since);
    const clients = db.prepare('SELECT * FROM clients WHERE updated_at > ?').all(since);
    const goalTemplates = db.prepare('SELECT * FROM goal_templates WHERE updated_at > ?').all(since);
    const users = db.prepare('SELECT * FROM users WHERE updated_at > ?').all(since);
    const teams = db.prepare('SELECT * FROM teams WHERE updated_at > ?').all(since);

    // For changed goals, fetch their KRs and history
    const goalIds = goals.map(g => g.id);
    let keyResults = [];
    let krHistory = [];
    if (goalIds.length > 0) {
      const placeholders = goalIds.map(() => '?').join(',');
      keyResults = db.prepare(`SELECT * FROM key_results WHERE goal_id IN (${placeholders}) ORDER BY sort_order`).all(...goalIds);
      const krIds = keyResults.map(kr => kr.id);
      if (krIds.length > 0) {
        const krPlaceholders = krIds.map(() => '?').join(',');
        krHistory = db.prepare(`SELECT * FROM kr_history WHERE kr_id IN (${krPlaceholders}) ORDER BY timestamp DESC`).all(...krIds);
      }
    }

    // For changed tasks, fetch subtasks
    const taskIds = tasks.map(t => t.id);
    let subtasks = [];
    if (taskIds.length > 0) {
      const placeholders = taskIds.map(() => '?').join(',');
      subtasks = db.prepare(`SELECT * FROM subtasks WHERE task_id IN (${placeholders}) ORDER BY sort_order`).all(...taskIds);
    }

    // For changed teams, fetch members
    const teamIds = teams.map(t => t.id);
    let teamMembers = [];
    if (teamIds.length > 0) {
      const placeholders = teamIds.map(() => '?').join(',');
      teamMembers = db.prepare(`SELECT * FROM team_members WHERE team_id IN (${placeholders})`).all(...teamIds);
    }

    // For changed templates, fetch kr_templates
    const templateIds = goalTemplates.map(t => t.id);
    let krTemplates = [];
    if (templateIds.length > 0) {
      const placeholders = templateIds.map(() => '?').join(',');
      krTemplates = db.prepare(`SELECT * FROM kr_templates WHERE template_id IN (${placeholders}) ORDER BY sort_order`).all(...templateIds);
    }

    const kpis = db.prepare('SELECT * FROM kpis WHERE updated_at > ?').all(since);

    const { assembleState } = require('./sync-helpers.cjs');
    res.json({
      ...assembleState({ goals, keyResults, krHistory, tasks, subtasks, clients, goalTemplates, krTemplates, users, teams, teamMembers, kpis }),
      since,
      timestamp: new Date().toISOString(),
    });
  });

  // POST /api/sync/migrate-from-local — one-time import from localStorage format
  router.post('/migrate-from-local', (req, res) => {
    const data = req.body;
    const insertGoal = db.prepare(`INSERT OR IGNORE INTO goals (id, title, status, progress, owner, channel, period, client_ids, channel_scope, template_id, monitor_until) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const insertKR = db.prepare(`INSERT OR IGNORE INTO key_results (id, goal_id, title, start_val, target_val, current_val, progress, status, live_config, sync_status, sync_error, last_sync_at, kr_template_id, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const insertHistory = db.prepare(`INSERT INTO kr_history (kr_id, timestamp, value, confidence, note, actor, source) VALUES (?, ?, ?, ?, ?, ?, ?)`);
    const insertTask = db.prepare(`INSERT OR IGNORE INTO tasks (id, title, description, status, priority, assignee, channel, due, task_type, client_ids, channel_scope, goal_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const insertSubtask = db.prepare(`INSERT INTO subtasks (task_id, text, done, sort_order) VALUES (?, ?, ?, ?)`);
    const insertClient = db.prepare(`INSERT OR IGNORE INTO clients (id, name, connection_id, logo, color, tags, channels, sql_overrides, monitor_until) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const insertTemplate = db.prepare(`INSERT OR IGNORE INTO goal_templates (id, title, category, period, sync_interval_ms) VALUES (?, ?, ?, ?, ?)`);
    const insertKRT = db.prepare(`INSERT OR IGNORE INTO kr_templates (id, template_id, title, sql, unit, direction, start_val, target_val, timeframe_days, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const insertUser = db.prepare(`INSERT OR REPLACE INTO users (id, name, role, av, color, dept, title, email, phone, avatar_url, client_ids, skills) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const insertTeam = db.prepare(`INSERT OR IGNORE INTO teams (id, name, color, icon, lead_id, client_ids) VALUES (?, ?, ?, ?, ?, ?)`);
    const insertTeamMember = db.prepare(`INSERT OR IGNORE INTO team_members (team_id, user_id) VALUES (?, ?)`);

    const migrate = db.transaction(() => {
      // Users first (FK targets)
      for (const u of data.users || []) {
        insertUser.run(u.id, u.name, u.role, u.av, u.color, u.dept, u.title,
          u.email || null, u.phone || null, u.avatarUrl || null,
          u.clientIds ? JSON.stringify(u.clientIds) : null,
          u.skills ? JSON.stringify(u.skills) : null);
      }

      // Teams
      for (const t of data.teams || []) {
        insertTeam.run(t.id, t.name, t.color, t.icon, t.leadId || null,
          t.clientIds ? JSON.stringify(t.clientIds) : null);
        for (const userId of t.members || []) {
          insertTeamMember.run(t.id, userId);
        }
      }

      // Clients
      for (const c of data.clients || []) {
        insertClient.run(c.id, c.name, c.connectionId || '', c.logo || null, c.color,
          c.tags ? JSON.stringify(c.tags) : null,
          JSON.stringify(c.channels || []),
          c.sqlOverrides ? JSON.stringify(c.sqlOverrides) : null,
          c.monitorUntil || null);
      }

      // Templates
      for (const t of data.goalTemplates || []) {
        insertTemplate.run(t.id, t.title, t.category, t.period, t.syncIntervalMs || null);
        (t.krTemplates || []).forEach((krt, idx) => {
          insertKRT.run(krt.id, t.id, krt.title, krt.sql, krt.unit, krt.direction, krt.start, krt.target, krt.timeframeDays || null, idx);
        });
      }

      // Goals + KRs + History
      for (const g of data.goals || []) {
        insertGoal.run(g.id, g.title, g.status, g.progress, g.owner, g.channel, g.period,
          g.clientIds ? JSON.stringify(g.clientIds) : null,
          g.channelScope ? JSON.stringify(g.channelScope) : null,
          g.templateId || null, g.monitorUntil || null);
        (g.keyResults || []).forEach((kr, idx) => {
          insertKR.run(kr.id, g.id, kr.title, kr.start, kr.target, kr.current, kr.progress, kr.status,
            kr.liveConfig ? JSON.stringify(kr.liveConfig) : null,
            kr.syncStatus || null, kr.syncError || null, kr.lastSyncAt || null,
            kr.krTemplateId || null, idx);
          for (const h of kr.history || []) {
            insertHistory.run(kr.id, h.timestamp, h.value, h.confidence || null, h.note || null, h.actor, h.source);
          }
        });
      }

      // Tasks + Subtasks
      for (const t of data.tasks || []) {
        insertTask.run(t.id, t.title, t.description || null, t.status, t.priority, t.assignee, t.channel, t.due, t.taskType,
          t.clientIds ? JSON.stringify(t.clientIds) : null,
          t.channelScope ? JSON.stringify(t.channelScope) : null,
          t.goalId || null);
        (t.subtasks || []).forEach((s, idx) => {
          insertSubtask.run(t.id, s.text, s.done ? 1 : 0, idx);
        });
      }
    });

    try {
      migrate();
      const counts = {
        users: db.prepare('SELECT COUNT(*) as c FROM users').get().c,
        teams: db.prepare('SELECT COUNT(*) as c FROM teams').get().c,
        clients: db.prepare('SELECT COUNT(*) as c FROM clients').get().c,
        goals: db.prepare('SELECT COUNT(*) as c FROM goals').get().c,
        tasks: db.prepare('SELECT COUNT(*) as c FROM tasks').get().c,
        goalTemplates: db.prepare('SELECT COUNT(*) as c FROM goal_templates').get().c,
      };
      res.json({ ok: true, counts });
    } catch (err) {
      console.error('Migration failed:', err);
      res.status(500).json({ error: 'Migration failed', detail: err.message });
    }
  });

  // GET /api/sync/backup — download SQLite database file
  router.get('/backup', (req, res) => {
    if (!dbPath || !fs.existsSync(dbPath)) {
      return res.status(404).json({ error: 'Database file not found' });
    }
    res.download(dbPath, `broadcastokr-backup-${new Date().toISOString().slice(0, 10)}.db`);
  });

  return router;
}

module.exports = { createSyncRouter };
