import { useMemo } from 'react';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useStore } from '../store/store';
import { CHANNELS, STATUS_FLOW, STATUS_LABELS, STATUS_COLORS, PRIORITIES } from '../constants';
import { ProgressBar } from '../components/ui/ProgressBar';
import { SparkLine } from '../components/ui/SparkLine';
import { ChannelBadge } from '../components/ui/ChannelBadge';
import { kpiStatus } from '../utils/colors';
import { cardStyle as makeCardStyle } from '../utils/styles';
import type { Priority } from '../types';

export function ReportsPage() {
  const { theme } = useTheme();
  const { permissions } = useAuth();
  const tasks = useStore((s) => s.tasks);
  const goals = useStore((s) => s.goals);
  const kpis = useStore((s) => s.kpis);

  if (!permissions.canViewReports) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60, flexDirection: 'column', gap: 12 }}>
        <span style={{ fontSize: 48 }}>{'\u{1F512}'}</span>
        <div style={{ fontSize: 16, fontWeight: 700, color: theme.text }}>Reports Restricted</div>
        <div style={{ fontSize: 13, color: theme.textMuted, textAlign: 'center', maxWidth: 300 }}>
          Switch to an owner or manager persona using the control panel.
        </div>
      </div>
    );
  }

  const totalTasks = tasks.length;
  const { doneTasks, overdueTasks, statusBreakdown, priorityBreakdown } = useMemo(() => {
    const now = new Date();
    const done = tasks.filter((t) => t.status === 'done').length;
    const overdue = tasks.filter((t) => t.status !== 'done' && new Date(t.due) < now).length;
    const statuses = STATUS_FLOW.map((status) => ({
      status,
      label: STATUS_LABELS[status],
      count: tasks.filter((t) => t.status === status).length,
      color: STATUS_COLORS[status],
    }));
    const priorityKeys: Priority[] = ['critical', 'high', 'medium', 'low'];
    const priorities = priorityKeys.map((key) => ({
      priority: key,
      label: PRIORITIES[key].label,
      count: tasks.filter((t) => t.priority === key).length,
      color: PRIORITIES[key].color,
      icon: PRIORITIES[key].icon,
    }));
    return { doneTasks: done, overdueTasks: overdue, statusBreakdown: statuses, priorityBreakdown: priorities };
  }, [tasks]);
  const completionRate = totalTasks ? doneTasks / totalTasks : 0;

  const channelCompliance = useMemo(() => {
    const now = new Date();
    return CHANNELS.map((ch, ci) => {
      const chGoals = goals.filter((g) => g.channel === ci);
      const chTasks = tasks.filter((t) => t.channel === ci);
      const chDone = chTasks.filter((t) => t.status === 'done').length;
      const chOverdue = chTasks.filter((t) => t.status !== 'done' && new Date(t.due) < now).length;
      const avgProgress = chGoals.length ? chGoals.reduce((s, g) => s + g.progress, 0) / chGoals.length : 0;
      const compliant = chOverdue === 0 && avgProgress >= 0.5;
      return { ch, chDone, chOverdue, chTasks, avgProgress, compliant };
    });
  }, [goals, tasks]);

  const cardStyle = makeCardStyle(theme);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
        {[
          { label: 'Completion Rate', value: `${Math.round(completionRate * 100)}%`, icon: '\u{1F4CA}', color: '#10b981' },
          { label: 'Total Tasks', value: totalTasks, icon: '\u{1F4CB}', color: '#4f46e5' },
          { label: 'Overdue', value: overdueTasks, icon: '\u26A0\uFE0F', color: overdueTasks > 0 ? '#ef4444' : '#10b981' },
          { label: 'Goals Tracked', value: goals.length, icon: '\u{1F3AF}', color: '#7c3aed' },
        ].map((s) => (
          <div key={s.label} style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: s.color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
              {s.icon}
            </div>
            <div>
              <div style={{ fontSize: 24, fontWeight: 800, color: theme.text }}>{s.value}</div>
              <div style={{ fontSize: 12, color: theme.textMuted, fontWeight: 500 }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 20 }}>
        {/* Status Breakdown */}
        <div style={cardStyle}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: theme.text, margin: 0, marginBottom: 16 }}>{'\u{1F4CA}'} Task Status Breakdown</h3>
          {statusBreakdown.map((s) => (
            <div key={s.status} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: theme.text, width: 90 }}>{s.label}</span>
              <div style={{ flex: 1 }}><ProgressBar value={totalTasks ? s.count / totalTasks : 0} color={s.color} theme={theme} /></div>
              <span style={{ fontSize: 12, fontWeight: 700, color: s.color, minWidth: 30, textAlign: 'right' }}>{s.count}</span>
            </div>
          ))}
        </div>

        {/* Priority Breakdown */}
        <div style={cardStyle}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: theme.text, margin: 0, marginBottom: 16 }}>{'\u26A1'} Priority Distribution</h3>
          {priorityBreakdown.map((p) => (
            <div key={p.priority} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
              <span style={{ fontSize: 14 }}>{p.icon}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: theme.text, width: 70 }}>{p.label}</span>
              <div style={{ flex: 1 }}><ProgressBar value={totalTasks ? p.count / totalTasks : 0} color={p.color} theme={theme} /></div>
              <span style={{ fontSize: 12, fontWeight: 700, color: p.color, minWidth: 30, textAlign: 'right' }}>{p.count}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 20 }}>
        {/* KPI Report */}
        <div style={cardStyle}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: theme.text, margin: 0, marginBottom: 16 }}>{'\u{1F4C8}'} KPI Trends</h3>
          {kpis.map((kpi) => {
            const st = kpiStatus(kpi);
            const pct = kpi.direction === 'hi'
              ? Math.min(kpi.current / kpi.target, 1)
              : Math.min(kpi.target / kpi.current, 1);
            return (
              <div key={kpi.name} style={{ padding: '10px 12px', borderRadius: 10, background: theme.bgMuted, border: `1px solid ${theme.borderLight}`, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: theme.text }}>{kpi.name}</div>
                  <div style={{ fontSize: 11, color: theme.textFaint }}>{kpi.current}{kpi.unit} / {kpi.target}{kpi.unit}</div>
                  <div style={{ marginTop: 4 }}><ProgressBar value={pct} color={st.color} theme={theme} height={4} /></div>
                </div>
                <SparkLine data={kpi.trend} color={st.color} w={70} h={24} />
                <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700, background: st.color + '20', color: st.color }}>{st.label}</span>
              </div>
            );
          })}
        </div>

        {/* Channel Compliance */}
        <div style={cardStyle}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: theme.text, margin: 0, marginBottom: 16 }}>{'\u2696\uFE0F'} Channel Compliance</h3>
          {channelCompliance.map(({ ch, chDone, chOverdue, chTasks, avgProgress, compliant }) => (
              <div key={ch.name} style={{ padding: '12px 14px', borderRadius: 10, background: compliant ? theme.compliantBg : theme.atRiskBg, border: `1px solid ${compliant ? theme.compliantBorder : theme.atRiskBorder}`, marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <ChannelBadge channel={ch} />
                  <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700, background: compliant ? '#10b98120' : '#ef444420', color: compliant ? '#10b981' : '#ef4444' }}>
                    {compliant ? '\u2713 Compliant' : '\u26A0 At Risk'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 16, fontSize: 11, color: theme.textMuted }}>
                  <span>{chDone}/{chTasks.length} tasks done</span>
                  <span>{chOverdue} overdue</span>
                  <span>{Math.round(avgProgress * 100)}% goal progress</span>
                </div>
              </div>
          ))}
        </div>
      </div>
    </div>
  );
}
