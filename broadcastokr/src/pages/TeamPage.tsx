import { useMemo } from 'react';
import { useTheme } from '../context/ThemeContext';
import { useStore } from '../store/store';
import { USERS, TEAMS } from '../constants';
import { safeUser } from '../utils/safeGet';
import { Avatar } from '../components/ui/Avatar';
import { ProgressBar } from '../components/ui/ProgressBar';

export function TeamPage() {
  const { theme } = useTheme();
  const tasks = useStore((s) => s.tasks);
  const goals = useStore((s) => s.goals);

  const now = useMemo(() => new Date(), [tasks]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Team Grid */}
      <div>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: theme.text, margin: 0, marginBottom: 16 }}>{'\u{1F465}'} Teams</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
          {TEAMS.map((team) => {
            const memberUsers = team.members.map((id) => safeUser(USERS, id));
            const memberTasks = tasks.filter((t) => team.members.includes(t.assignee));
            const doneTasks = memberTasks.filter((t) => t.status === 'done').length;
            const progress = memberTasks.length ? doneTasks / memberTasks.length : 0;

            return (
              <div key={team.name} style={{ background: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 14, padding: 18, borderTop: `3px solid ${team.color}` }}>
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
        <h3 style={{ fontSize: 15, fontWeight: 700, color: theme.text, margin: 0, marginBottom: 16 }}>{'\u{1F464}'} Team Members</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
          {USERS.map((user) => {
            const userTasks = tasks.filter((t) => t.assignee === user.id);
            const userGoals = goals.filter((g) => g.owner === user.id);
            const doneTasks = userTasks.filter((t) => t.status === 'done').length;
            const inProgress = userTasks.filter((t) => t.status === 'in_progress').length;
            const overdue = userTasks.filter((t) => t.status !== 'done' && new Date(t.due) < now).length;

            return (
              <div key={user.id} style={{ background: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 14, padding: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                  <Avatar user={user} size={40} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: theme.text }}>{user.name}</div>
                    <div style={{ fontSize: 11, color: theme.textFaint }}>{user.title}</div>
                    <div style={{ fontSize: 11, marginTop: 2 }}>
                      <span style={{ color: user.role === 'owner' ? '#4f46e5' : user.role === 'manager' ? '#059669' : '#f59e0b', fontWeight: 700 }}>{user.role}</span>
                      <span style={{ color: theme.textFaint }}> &middot; {user.dept}</span>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12 }}>
                  {[
                    { label: 'Tasks', value: userTasks.length, color: '#4f46e5' },
                    { label: 'Active', value: inProgress, color: '#f59e0b' },
                    { label: 'Done', value: doneTasks, color: '#10b981' },
                    { label: 'Overdue', value: overdue, color: overdue > 0 ? '#ef4444' : theme.textFaint },
                  ].map((s) => (
                    <div key={s.label} style={{ textAlign: 'center', padding: '8px 4px', borderRadius: 8, background: theme.bgMuted }}>
                      <div style={{ fontSize: 18, fontWeight: 800, color: s.color }}>{s.value}</div>
                      <div style={{ fontSize: 10, color: theme.textMuted, fontWeight: 500 }}>{s.label}</div>
                    </div>
                  ))}
                </div>

                {userGoals.length > 0 && (
                  <div style={{ fontSize: 11, color: theme.textFaint }}>
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
