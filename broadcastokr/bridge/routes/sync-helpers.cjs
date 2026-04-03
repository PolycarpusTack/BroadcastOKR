/**
 * Assemble raw DB rows into the frontend-compatible state shape.
 */
function assembleState({ goals, keyResults, krHistory, tasks, subtasks, clients, goalTemplates, krTemplates, users, teams, teamMembers, kpis }) {
  // Group KRs by goal
  const krsByGoal = new Map();
  for (const kr of keyResults) {
    if (!krsByGoal.has(kr.goal_id)) krsByGoal.set(kr.goal_id, []);
    krsByGoal.get(kr.goal_id).push(kr);
  }

  // Group history by KR
  const historyByKR = new Map();
  for (const h of krHistory) {
    if (!historyByKR.has(h.kr_id)) historyByKR.set(h.kr_id, []);
    historyByKR.get(h.kr_id).push({
      timestamp: h.timestamp, value: h.value,
      confidence: h.confidence || undefined, note: h.note || undefined,
      actor: h.actor, source: h.source,
    });
  }

  // Group subtasks by task
  const subsByTask = new Map();
  for (const s of subtasks) {
    if (!subsByTask.has(s.task_id)) subsByTask.set(s.task_id, []);
    subsByTask.get(s.task_id).push(s);
  }

  // Group members by team
  const membersByTeam = new Map();
  for (const m of teamMembers) {
    if (!membersByTeam.has(m.team_id)) membersByTeam.set(m.team_id, []);
    membersByTeam.get(m.team_id).push(m.user_id);
  }

  // Group KR templates by template
  const krtByTemplate = new Map();
  for (const krt of krTemplates) {
    if (!krtByTemplate.has(krt.template_id)) krtByTemplate.set(krt.template_id, []);
    krtByTemplate.get(krt.template_id).push(krt);
  }

  return {
    goals: goals.map(g => ({
      id: g.id, title: g.title, status: g.status, progress: g.progress,
      owner: g.owner, channel: g.channel, period: g.period,
      clientIds: g.client_ids ? JSON.parse(g.client_ids) : undefined,
      channelScope: g.channel_scope ? JSON.parse(g.channel_scope) : undefined,
      templateId: g.template_id || undefined, monitorUntil: g.monitor_until || undefined,
      keyResults: (krsByGoal.get(g.id) || []).map(kr => ({
        id: kr.id, title: kr.title, start: kr.start_val, target: kr.target_val,
        current: kr.current_val, progress: kr.progress, status: kr.status,
        liveConfig: kr.live_config ? JSON.parse(kr.live_config) : undefined,
        syncStatus: kr.sync_status || undefined, syncError: kr.sync_error || undefined,
        lastSyncAt: kr.last_sync_at || undefined, krTemplateId: kr.kr_template_id || undefined,
        history: historyByKR.get(kr.id) || undefined,
      })),
    })),
    tasks: tasks.map(t => ({
      id: t.id, title: t.title, description: t.description || undefined,
      status: t.status, priority: t.priority, assignee: t.assignee,
      channel: t.channel, due: t.due, taskType: t.task_type,
      clientIds: t.client_ids ? JSON.parse(t.client_ids) : undefined,
      channelScope: t.channel_scope ? JSON.parse(t.channel_scope) : undefined,
      goalId: t.goal_id || undefined,
      subtasks: (subsByTask.get(t.id) || []).map(s => ({ text: s.text, done: !!s.done })),
    })),
    clients: clients.map(c => ({
      id: c.id, name: c.name, connectionId: c.connection_id,
      logo: c.logo || undefined, color: c.color,
      tags: c.tags ? JSON.parse(c.tags) : undefined,
      channels: c.channels ? JSON.parse(c.channels) : [],
      sqlOverrides: c.sql_overrides ? JSON.parse(c.sql_overrides) : undefined,
      monitorUntil: c.monitor_until || undefined,
    })),
    goalTemplates: goalTemplates.map(t => ({
      id: t.id, title: t.title, category: t.category, period: t.period,
      syncIntervalMs: t.sync_interval_ms || undefined,
      krTemplates: (krtByTemplate.get(t.id) || []).map(krt => ({
        id: krt.id, title: krt.title, sql: krt.sql, unit: krt.unit,
        direction: krt.direction, start: krt.start_val, target: krt.target_val,
        timeframeDays: krt.timeframe_days || undefined,
      })),
    })),
    users: users.map(u => ({
      id: u.id, name: u.name, role: u.role, av: u.av, color: u.color,
      dept: u.dept, title: u.title, email: u.email || undefined,
      phone: u.phone || undefined, avatarUrl: u.avatar_url || undefined,
      clientIds: u.client_ids ? JSON.parse(u.client_ids) : undefined,
      skills: u.skills ? JSON.parse(u.skills) : undefined,
    })),
    teams: teams.map(t => ({
      id: t.id, name: t.name, color: t.color, icon: t.icon,
      leadId: t.lead_id || undefined,
      members: membersByTeam.get(t.id) || [],
      clientIds: t.client_ids ? JSON.parse(t.client_ids) : undefined,
    })),
    kpis: kpis.map(k => ({
      name: k.name, unit: k.unit, direction: k.direction,
      target: k.target, current: k.current_val,
      trend: k.trend ? JSON.parse(k.trend) : [],
    })),
    timestamp: new Date().toISOString(),
  };
}

module.exports = { assembleState };
