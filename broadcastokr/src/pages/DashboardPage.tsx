import { useTheme } from '../context/ThemeContext';
import { useStore } from '../store/store';
import { CHANNELS, USERS } from '../constants';
import { safeUser } from '../utils/safeGet';
import { ProgressBar } from '../components/ui/ProgressBar';
import { SparkLine } from '../components/ui/SparkLine';
import { ChannelBadge } from '../components/ui/ChannelBadge';
import { Avatar } from '../components/ui/Avatar';
import { progressColor, statusIcon, kpiStatus } from '../utils/colors';
import { daysUntil, getUrgencyBadge } from '../utils/dates';

export function DashboardPage() {
  const { theme, dark } = useTheme();
  const goals = useStore((s) => s.goals);
  const tasks = useStore((s) => s.tasks);
  const kpis = useStore((s) => s.kpis);

  const activeTasks = tasks.filter((t) => t.status !== 'done');
  const urgentTasks = activeTasks
    .map((t) => ({ ...t, days: daysUntil(t.due) }))
    .filter((t) => t.days <= 3)
    .sort((a, b) => a.days - b.days)
    .slice(0, 8);

  const statusCounts = {
    in_progress: tasks.filter((t) => t.status === 'in_progress').length,
    done: tasks.filter((t) => t.status === 'done').length,
  };

  const statCards = [
    { label: 'Total Goals', value: goals.length, icon: '\u{1F3AF}', color: '#4f46e5' },
    { label: 'Active Tasks', value: activeTasks.length, icon: '\u2705', color: '#059669' },
    { label: 'In Progress', value: statusCounts.in_progress, icon: '\u{1F504}', color: '#f59e0b' },
    { label: 'Completed', value: statusCounts.done, icon: '\u{1F389}', color: '#10b981' },
  ];

  const cardStyle = {
    background: theme.bgCard,
    border: `1px solid ${theme.border}`,
    borderRadius: 14,
    padding: 20,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        {statCards.map((s) => (
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

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* KPI Panel */}
        <div style={cardStyle}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: theme.text, margin: 0, marginBottom: 16 }}>{'\u{1F4CA}'} Key Performance Indicators</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {kpis.map((kpi) => {
              const st = kpiStatus(kpi);
              return (
                <div key={kpi.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 10, background: theme.bgMuted, border: `1px solid ${theme.borderLight}` }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: theme.text }}>{kpi.name}</div>
                    <div style={{ fontSize: 11, color: theme.textFaint, marginTop: 2 }}>
                      {kpi.current}{kpi.unit} / {kpi.target}{kpi.unit} target
                    </div>
                  </div>
                  <SparkLine data={kpi.trend} color={st.color} w={70} h={24} />
                  <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700, background: st.color + '20', color: st.color }}>{st.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Goals Summary */}
        <div style={cardStyle}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: theme.text, margin: 0, marginBottom: 16 }}>{'\u{1F3AF}'} OKR Progress</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {goals.slice(0, 5).map((goal) => (
              <div key={goal.id} style={{ padding: '12px 14px', borderRadius: 10, background: theme.bgMuted, border: `1px solid ${theme.borderLight}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 14 }}>{statusIcon(goal.status)}</span>
                  <div style={{ flex: 1, fontSize: 12, fontWeight: 600, color: theme.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{goal.title}</div>
                  <ChannelBadge channel={CHANNELS[goal.channel]} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1 }}><ProgressBar value={goal.progress} theme={theme} /></div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: progressColor(goal.progress) }}>{Math.round(goal.progress * 100)}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Urgent Tasks */}
        <div style={cardStyle}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: theme.text, margin: 0, marginBottom: 16 }}>{'\u{1F525}'} Urgent Tasks</h3>
          {urgentTasks.length === 0 ? (
            <div style={{ color: theme.textFaint, fontSize: 13, textAlign: 'center', padding: 30 }}>No urgent tasks</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {urgentTasks.map((t) => {
                const badge = getUrgencyBadge(t.days, dark);
                const user = safeUser(USERS, t.assignee);
                return (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, background: theme.bgMuted, border: `1px solid ${theme.borderLight}` }}>
                    <Avatar user={user} size={24} />
                    <div style={{ flex: 1, fontSize: 12, fontWeight: 500, color: theme.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</div>
                    <span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: badge.bg, color: badge.fg, animation: badge.pulse ? 'urgPulse 2s infinite' : 'none' }}>{badge.text}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Channel Health */}
        <div style={cardStyle}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: theme.text, margin: 0, marginBottom: 16 }}>{'\u{1F4FA}'} Channel Health</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {CHANNELS.map((ch, ci) => {
              const chGoals = goals.filter((g) => g.channel === ci);
              const chTasks = tasks.filter((t) => t.channel === ci);
              const avgProgress = chGoals.length ? chGoals.reduce((s, g) => s + g.progress, 0) / chGoals.length : 0;
              const doneTasks = chTasks.filter((t) => t.status === 'done').length;

              return (
                <div key={ch.name} style={{ padding: '12px 14px', borderRadius: 10, background: theme.bgMuted, border: `1px solid ${theme.borderLight}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <ChannelBadge channel={ch} />
                    <span style={{ fontSize: 11, color: theme.textMuted }}>{chGoals.length} goals &middot; {chTasks.length} tasks</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ flex: 1 }}><ProgressBar value={avgProgress} theme={theme} /></div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: progressColor(avgProgress) }}>{Math.round(avgProgress * 100)}%</span>
                    <span style={{ fontSize: 10, color: theme.textFaint }}>{doneTasks}/{chTasks.length} done</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
