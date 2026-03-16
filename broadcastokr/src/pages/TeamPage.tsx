import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import { useStore } from '../store/store';
import { USERS, TEAMS } from '../constants';
import { safeUser } from '../utils/safeGet';
import { Avatar } from '../components/ui/Avatar';
import { ProgressBar } from '../components/ui/ProgressBar';
import { roleColor } from '../utils/colors';
import { PRIMARY_COLOR, COLOR_SUCCESS, COLOR_WARNING, COLOR_DANGER, FONT_HEADING } from '../constants/config';

export function TeamPage() {
  const { theme } = useTheme();
  const navigate = useNavigate();
  const tasks = useStore((s) => s.tasks);
  const goals = useStore((s) => s.goals);

  const now = useMemo(() => new Date(), []);

  const tasksByAssignee = useMemo(() => {
    const map = new Map<number, typeof tasks>();
    for (const t of tasks) {
      const list = map.get(t.assignee);
      if (list) list.push(t);
      else map.set(t.assignee, [t]);
    }
    return map;
  }, [tasks]);

  const goalsByOwner = useMemo(() => {
    const map = new Map<number, typeof goals>();
    for (const g of goals) {
      const list = map.get(g.owner);
      if (list) list.push(g);
      else map.set(g.owner, [g]);
    }
    return map;
  }, [goals]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Team Grid */}
      <div>
        <h3 style={{ fontFamily: FONT_HEADING, fontSize: 15, fontWeight: 700, color: theme.text, margin: 0, marginBottom: 16 }}>{'\u{1F465}'} Teams</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
          {TEAMS.map((team) => {
            const memberUsers = team.members.map((id) => safeUser(USERS, id));
            const memberTasks = team.members.flatMap((id) => tasksByAssignee.get(id) || []);
            const doneTasks = memberTasks.filter((t) => t.status === 'done').length;
            const progress = memberTasks.length ? doneTasks / memberTasks.length : 0;

            return (
              <div key={team.name} style={{ background: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 10, padding: 18, borderTop: `3px solid ${team.color}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <span style={{ fontSize: 20 }}>{team.icon}</span>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: theme.text }}>{team.name}</div>
                    <div style={{ fontSize: 11, color: theme.textFaint }}>{memberUsers.length} member{memberUsers.length > 1 ? 's' : ''}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  {memberUsers.map((u) => (
                    <Avatar key={u.id} user={u} size={28} />
                  ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1 }}><ProgressBar value={progress} theme={theme} /></div>
                  <span style={{ fontSize: 11, color: theme.textMuted }}>{doneTasks}/{memberTasks.length} tasks</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Individual Members */}
      <div>
        <h3 style={{ fontFamily: FONT_HEADING, fontSize: 15, fontWeight: 700, color: theme.text, margin: 0, marginBottom: 16 }}>{'\u{1F464}'} Team Members</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
          {USERS.map((user) => {
            const userTasks = tasksByAssignee.get(user.id) || [];
            const userGoals = goalsByOwner.get(user.id) || [];
            const doneTasks = userTasks.filter((t) => t.status === 'done').length;
            const inProgress = userTasks.filter((t) => t.status === 'in_progress').length;
            const overdue = userTasks.filter((t) => t.status !== 'done' && new Date(t.due) < now).length;

            return (
              <div key={user.id} style={{ background: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 10, padding: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                  <Avatar user={user} size={40} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: theme.text }}>{user.name}</div>
                    <div style={{ fontSize: 11, color: theme.textFaint }}>{user.title}</div>
                    <div style={{ fontSize: 11, marginTop: 2 }}>
                      <span style={{ color: roleColor(user.role), fontWeight: 700 }}>{user.role}</span>
                      <span style={{ color: theme.textFaint }}> &middot; {user.dept}</span>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(80px, 1fr))', gap: 8, marginBottom: 12 }}>
                  {[
                    { label: 'Tasks', value: userTasks.length, color: PRIMARY_COLOR, onClick: () => navigate('/tasks') },
                    { label: 'Active', value: inProgress, color: COLOR_WARNING, onClick: () => navigate('/tasks') },
                    { label: 'Done', value: doneTasks, color: COLOR_SUCCESS, onClick: () => navigate('/tasks') },
                    { label: 'Overdue', value: overdue, color: overdue > 0 ? COLOR_DANGER : theme.textFaint, onClick: () => navigate('/tasks') },
                  ].map((s) => (
                    <div
                      key={s.label}
                      onClick={s.onClick}
                      style={{ textAlign: 'center', padding: '8px 4px', borderRadius: 8, background: theme.bgMuted, cursor: 'pointer' }}
                    >
                      <div style={{ fontSize: 18, fontWeight: 800, color: s.color }}>{s.value}</div>
                      <div style={{ fontSize: 10, color: theme.textMuted, fontWeight: 500 }}>{s.label}</div>
                    </div>
                  ))}
                </div>

                {userGoals.length > 0 && (
                  <div
                    onClick={() => navigate('/goals')}
                    style={{ fontSize: 11, color: theme.textFaint, cursor: 'pointer' }}
                    title="View goals"
                  >
                    {'\u{1F3AF}'} {userGoals.length} goal{userGoals.length > 1 ? 's' : ''} owned
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
