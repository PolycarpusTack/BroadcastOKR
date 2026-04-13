import { useMemo, useState } from 'react';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useStore } from '../store/store';
import { useShallow } from 'zustand/react/shallow';
import { safeUser } from '../utils/safeGet';
import { UserModal } from '../components/team/UserModal';
import { TeamModal } from '../components/team/TeamModal';
import { TeamCard } from '../components/team/TeamCard';
import { MemberCard } from '../components/team/MemberCard';
import { TaskLoadChart } from '../components/team/TaskLoadChart';
import { ClientCoverageMatrix } from '../components/team/ClientCoverageMatrix';
import {
  PRIMARY_COLOR,
  FONT_HEADING,
  FONT_BODY,
} from '../constants/config';
import type { User, Team } from '../types';

export function TeamPage() {
  const { theme } = useTheme();
  const { permissions } = useAuth();

  // Store selectors
  const {
    users, teams, clients, goals, tasks,
    addUser, updateUser, deleteUser,
    addTeam, updateTeam, deleteTeam,
  } = useStore(
    useShallow((s) => ({
      users: s.users,
      teams: s.teams,
      clients: s.clients,
      goals: s.goals,
      tasks: s.tasks,
      addUser: s.addUser,
      updateUser: s.updateUser,
      deleteUser: s.deleteUser,
      addTeam: s.addTeam,
      updateTeam: s.updateTeam,
      deleteTeam: s.deleteTeam,
    })),
  );

  // View toggle
  const [view, setView] = useState<'teams' | 'members' | 'workload'>('teams');

  // Modal state
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | undefined>();
  const [teamModalOpen, setTeamModalOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<Team | undefined>();

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

  // Modal handlers
  function handleSaveUser(user: User) {
    if (editingUser) {
      updateUser(user.id, user);
    } else {
      addUser(user);
    }
  }

  function handleDeleteUser(id: number, reassignTo: number | null) {
    deleteUser(id, reassignTo);
  }

  function handleSaveTeam(team: Team) {
    if (editingTeam) {
      updateTeam(team.id, team);
    } else {
      addTeam(team);
    }
  }

  function handleDeleteTeam(id: string) {
    deleteTeam(id);
  }

  function openEditTeam(team: Team) {
    setEditingTeam(team);
    setTeamModalOpen(true);
  }

  function openAddTeam() {
    setEditingTeam(undefined);
    setTeamModalOpen(true);
  }

  function openEditUser(user: User) {
    setEditingUser(user);
    setUserModalOpen(true);
  }

  const views = ['teams', 'members', 'workload'] as const;
  const viewLabels: Record<typeof views[number], string> = {
    teams: 'Teams',
    members: 'Members',
    workload: 'Workload',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* View toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {views.map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            style={{
              padding: '6px 16px',
              borderRadius: 8,
              border: `1px solid ${view === v ? PRIMARY_COLOR : theme.border}`,
              background: view === v ? PRIMARY_COLOR : 'transparent',
              color: view === v ? '#fff' : theme.textSecondary,
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: FONT_BODY,
            }}
          >
            {viewLabels[v]}
          </button>
        ))}
      </div>

      {/* Teams view */}
      {view === 'teams' && (
        <div>
          {/* Header row */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 16,
            }}
          >
            <h3
              style={{
                fontFamily: FONT_HEADING,
                fontSize: 15,
                fontWeight: 700,
                color: theme.text,
                margin: 0,
              }}
            >
              Teams
            </h3>
            {permissions.canCreate && (
              <button
                onClick={openAddTeam}
                style={{
                  padding: '6px 14px',
                  borderRadius: 8,
                  border: 'none',
                  background: PRIMARY_COLOR,
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: FONT_BODY,
                }}
              >
                + Add Team
              </button>
            )}
          </div>

          {teams.length === 0 ? (
            /* Empty state */
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 60,
                gap: 12,
                background: theme.bgCard,
                border: `1px solid ${theme.border}`,
                borderRadius: 12,
              }}
            >
              <span style={{ fontSize: 36, opacity: 0.6 }}>{'\u{1F465}'}</span>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: theme.text,
                  fontFamily: FONT_HEADING,
                }}
              >
                No teams configured
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: theme.textMuted,
                  textAlign: 'center',
                  maxWidth: 320,
                  fontFamily: FONT_BODY,
                }}
              >
                Add a team to organize your broadcast ops crew.
              </div>
              {permissions.canCreate && (
                <button
                  onClick={openAddTeam}
                  style={{
                    marginTop: 8,
                    padding: '6px 14px',
                    borderRadius: 8,
                    border: 'none',
                    background: PRIMARY_COLOR,
                    color: '#fff',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontFamily: FONT_BODY,
                  }}
                >
                  + Add Team
                </button>
              )}
            </div>
          ) : (
            /* Team grid */
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                gap: 14,
              }}
            >
              {teams.map((team) => {
                const memberUsers = team.members.map((id) => safeUser(users, id));
                return (
                  <TeamCard
                    key={team.id}
                    team={team}
                    memberUsers={memberUsers}
                    goals={goals}
                    tasksByAssignee={tasksByAssignee}
                    goalsByOwner={goalsByOwner}
                    clients={clients}
                    theme={theme}
                    permissions={permissions}
                    now={now}
                    onEdit={openEditTeam}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Members view */}
      {view === 'members' && (
        <div>
          {/* Header row */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 16,
            }}
          >
            <h3
              style={{
                fontFamily: FONT_HEADING,
                fontSize: 15,
                fontWeight: 700,
                color: theme.text,
                margin: 0,
              }}
            >
              Members
            </h3>
            {permissions.canCreate && (
              <button
                onClick={() => {
                  setEditingUser(undefined);
                  setUserModalOpen(true);
                }}
                style={{
                  padding: '6px 14px',
                  borderRadius: 8,
                  border: 'none',
                  background: PRIMARY_COLOR,
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: FONT_BODY,
                }}
              >
                + Add Member
              </button>
            )}
          </div>

          {users.length === 0 ? (
            /* Empty state */
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 60,
                gap: 12,
                background: theme.bgCard,
                border: `1px solid ${theme.border}`,
                borderRadius: 12,
              }}
            >
              <span style={{ fontSize: 36, opacity: 0.6 }}>{'\u{1F464}'}</span>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: theme.text,
                  fontFamily: FONT_HEADING,
                }}
              >
                No team members
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: theme.textMuted,
                  textAlign: 'center',
                  maxWidth: 320,
                  fontFamily: FONT_BODY,
                }}
              >
                Add your first team member to get started.
              </div>
            </div>
          ) : (
            /* Member grid */
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                gap: 14,
              }}
            >
              {users.map((user) => (
                <MemberCard
                  key={user.id}
                  user={user}
                  userTasks={tasksByAssignee.get(user.id) || []}
                  userGoals={goalsByOwner.get(user.id) || []}
                  clients={clients}
                  theme={theme}
                  permissions={permissions}
                  onEdit={openEditUser}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Workload view */}
      {view === 'workload' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div>
            <h3
              style={{
                fontFamily: FONT_HEADING,
                fontSize: 15,
                fontWeight: 700,
                color: theme.text,
                margin: '0 0 12px 0',
              }}
            >
              Task Load Balance
            </h3>
            <TaskLoadChart users={users} tasks={tasks} theme={theme} />
          </div>
          <div>
            <h3
              style={{
                fontFamily: FONT_HEADING,
                fontSize: 15,
                fontWeight: 700,
                color: theme.text,
                margin: '0 0 12px 0',
              }}
            >
              Client Coverage
            </h3>
            <ClientCoverageMatrix
              users={users}
              clients={clients}
              goals={goals}
              theme={theme}
            />
          </div>
        </div>
      )}

      {/* Modals */}
      <UserModal
        open={userModalOpen}
        onClose={() => {
          setUserModalOpen(false);
          setEditingUser(undefined);
        }}
        theme={theme}
        user={editingUser}
        users={users}
        clients={clients}
        onSave={handleSaveUser}
        onDelete={handleDeleteUser}
        taskCount={editingUser ? (tasksByAssignee.get(editingUser.id) || []).length : 0}
        goalCount={editingUser ? (goalsByOwner.get(editingUser.id) || []).length : 0}
        teamLeadCount={editingUser ? teams.filter((t) => t.leadId === editingUser.id).length : 0}
      />
      <TeamModal
        open={teamModalOpen}
        onClose={() => {
          setTeamModalOpen(false);
          setEditingTeam(undefined);
        }}
        theme={theme}
        team={editingTeam}
        users={users}
        clients={clients}
        onSave={handleSaveTeam}
        onDelete={handleDeleteTeam}
      />
    </div>
  );
}
