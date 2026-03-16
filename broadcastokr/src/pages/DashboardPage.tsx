import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import { useStore } from '../store/store';
import { CHANNELS, USERS } from '../constants';
import { safeUser, safeChannel } from '../utils/safeGet';
import { ProgressBar } from '../components/ui/ProgressBar';
import { SparkLine } from '../components/ui/SparkLine';
import { ChannelBadge } from '../components/ui/ChannelBadge';
import { Avatar } from '../components/ui/Avatar';
import { PillBadge } from '../components/ui/PillBadge';
import { LiveKPIPanel } from '../components/kpi/LiveKPIPanel';
import { progressColor, statusIcon, kpiStatus } from '../utils/colors';
import { daysUntil, getUrgencyBadge } from '../utils/dates';
import { cardStyle as makeCardStyle } from '../utils/styles';
import { PRIMARY_COLOR, COLOR_SUCCESS, COLOR_WARNING, FONT_HEADING } from '../constants/config';
import type { LiveKPI, DriverStatus } from '../hooks/useBridge';

interface DashboardPageProps {
  onOpenKPIConfig?: () => void;
  bridgeConnected?: boolean;
  bridgeRunning?: boolean;
  bridgeSyncing?: boolean;
  liveKPIs?: LiveKPI[];
  drivers?: DriverStatus;
  onStartBridge?: () => Promise<{ ok: boolean; message: string }>;
  onStopBridge?: () => Promise<{ ok: boolean; message: string }>;
  onSyncNow?: () => Promise<void>;
}

const noopAsync = () => Promise.resolve({ ok: false, message: '' });
const noopVoid = () => Promise.resolve();

export function DashboardPage({
  onOpenKPIConfig, bridgeConnected = false, bridgeRunning = false,
  bridgeSyncing = false, liveKPIs = [], drivers,
  onStartBridge = noopAsync, onStopBridge = noopAsync, onSyncNow = noopVoid,
}: DashboardPageProps) {
  const { theme, dark } = useTheme();
  const navigate = useNavigate();
  const goals = useStore((s) => s.goals);
  const tasks = useStore((s) => s.tasks);
  const kpis = useStore((s) => s.kpis);

  const activeTasks = useMemo(() => tasks.filter((t) => t.status !== 'done'), [tasks]);
  const urgentTasks = useMemo(() =>
    activeTasks
      .map((t) => ({ ...t, days: daysUntil(t.due) }))
      .filter((t) => t.days <= 3)
      .sort((a, b) => a.days - b.days)
      .slice(0, 8),
    [activeTasks]
  );

  const statusCounts = useMemo(() => ({
    in_progress: tasks.filter((t) => t.status === 'in_progress').length,
    done: tasks.filter((t) => t.status === 'done').length,
  }), [tasks]);

  const statCards = [
    { label: 'Total Goals', value: goals.length, icon: '\u{1F3AF}', color: PRIMARY_COLOR },
    { label: 'Active Tasks', value: activeTasks.length, icon: '\u2705', color: COLOR_SUCCESS },
    { label: 'In Progress', value: statusCounts.in_progress, icon: '\u{1F504}', color: COLOR_WARNING },
    { label: 'Completed', value: statusCounts.done, icon: '\u{1F389}', color: COLOR_SUCCESS },
  ];

  const channelHealth = useMemo(() => {
    return CHANNELS.map((ch, ci) => {
      const chGoals = goals.filter((g) => g.channel === ci);
      const chTasks = tasks.filter((t) => t.channel === ci);
      const avgProgress = chGoals.length ? chGoals.reduce((s, g) => s + g.progress, 0) / chGoals.length : 0;
      const doneTasks = chTasks.filter((t) => t.status === 'done').length;
      return { ch, goalCount: chGoals.length, taskCount: chTasks.length, avgProgress, doneTasks };
    });
  }, [goals, tasks]);

  const cStyle = useMemo(() => makeCardStyle(theme), [theme]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
        {statCards.map((s) => (
          <div key={s.label} style={{ ...cStyle, display: 'flex', alignItems: 'center', gap: 14 }}>
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

      {/* Live KPIs from Bridge */}
      <LiveKPIPanel
        kpis={liveKPIs}
        connected={bridgeConnected}
        bridgeRunning={bridgeRunning}
        syncing={bridgeSyncing}
        drivers={drivers}
        theme={theme}
        onConfigure={onOpenKPIConfig || (() => {})}
        onStartBridge={onStartBridge}
        onStopBridge={onStopBridge}
        onSyncNow={onSyncNow}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 20 }}>
        {/* KPI Panel */}
        <div style={cStyle}>
          <h3 style={{ fontFamily: FONT_HEADING, fontSize: 15, fontWeight: 700, color: theme.text, margin: 0, marginBottom: 16 }}>{'\u{1F4CA}'} Key Performance Indicators</h3>
          {kpis.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 24, color: theme.textFaint, fontSize: 12 }}>No KPIs configured.</div>
          ) : (
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
                  <PillBadge label={st.label} color={st.color} bold />
                </div>
              );
            })}
          </div>
          )}
        </div>

        {/* Goals Summary */}
        <div style={cStyle}>
          <h3 style={{ fontFamily: FONT_HEADING, fontSize: 15, fontWeight: 700, color: theme.text, margin: 0, marginBottom: 16 }}>{'\u{1F3AF}'} OKR Progress</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {goals.slice(0, 5).map((goal) => (
              <div
                key={goal.id}
                onClick={() => navigate('/goals')}
                title="View all goals"
                style={{
                  padding: '12px 14px',
                  borderRadius: 10,
                  background: theme.bgMuted,
                  border: `1px solid ${theme.borderLight}`,
                  cursor: 'pointer',
                  transition: 'border-color 0.15s',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = PRIMARY_COLOR + '80'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = theme.borderLight; }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 14 }}>{statusIcon(goal.status)}</span>
                  <div style={{ flex: 1, fontSize: 12, fontWeight: 600, color: theme.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{goal.title}</div>
                  <ChannelBadge channel={safeChannel(CHANNELS, goal.channel)} />
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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 20 }}>
        {/* Urgent Tasks */}
        <div style={cStyle}>
          <h3 style={{ fontFamily: FONT_HEADING, fontSize: 15, fontWeight: 700, color: theme.text, margin: 0, marginBottom: 16 }}>{'\u{1F525}'} Urgent Tasks</h3>
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
                    <PillBadge label={badge.text} color={badge.fg} bold bg={badge.bg} fg={badge.fg} pulse={badge.pulse} style={{ padding: '2px 6px' }} />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Channel Health */}
        <div style={cStyle}>
          <h3 style={{ fontFamily: FONT_HEADING, fontSize: 15, fontWeight: 700, color: theme.text, margin: 0, marginBottom: 16 }}>{'\u{1F4FA}'} Channel Health</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {channelHealth.map((cs) => (
                <div key={cs.ch.name} style={{ padding: '12px 14px', borderRadius: 10, background: theme.bgMuted, border: `1px solid ${theme.borderLight}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <ChannelBadge channel={cs.ch} />
                    <span style={{ fontSize: 11, color: theme.textMuted }}>{cs.goalCount} goals &middot; {cs.taskCount} tasks</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ flex: 1 }}><ProgressBar value={cs.avgProgress} theme={theme} /></div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: progressColor(cs.avgProgress) }}>{Math.round(cs.avgProgress * 100)}%</span>
                    <span style={{ fontSize: 10, color: theme.textFaint }}>{cs.doneTasks}/{cs.taskCount} done</span>
                  </div>
                </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
