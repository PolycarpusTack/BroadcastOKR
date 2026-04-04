import { useMemo, useState } from 'react';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useStore } from '../store/store';
import { useShallow } from 'zustand/react/shallow';
import { safeUser } from '../utils/safeGet';
import { roleColor } from '../utils/colors';
import { Avatar } from '../components/ui/Avatar';
import { ProgressBar } from '../components/ui/ProgressBar';
import { PillBadge } from '../components/ui/PillBadge';
import { UserModal } from '../components/team/UserModal';
import { TeamModal } from '../components/team/TeamModal';
import { MemberInlineDetail } from '../components/team/MemberInlineDetail';
import { TaskLoadChart } from '../components/team/TaskLoadChart';
import { ClientCoverageMatrix } from '../components/team/ClientCoverageMatrix';
import {
  PRIMARY_COLOR,
  COLOR_SUCCESS,
  COLOR_WARNING,
  COLOR_DANGER,
  FONT_HEADING,
  FONT_BODY,
} from '../constants/config';
import type { User, Team } from '../types';

const MAX_AVATARS = 8;

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

  // Team card expansion
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);

  // Member card expansion
  const [expandedMember, setExpandedMember] = useState<number | null>(null);
  const [memberFilter, setMemberFilter] = useState<'tasks' | 'active' | 'done' | 'overdue' | 'goals'>('tasks');

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

  // Compute team task summary
  function teamTaskSummary(memberIds: number[]) {
    const memberTasks = memberIds.flatMap((id) => tasksByAssignee.get(id) || []);
    const total = memberTasks.length;
    const active = memberTasks.filter((t) => t.status === 'in_progress').length;
    const done = memberTasks.filter((t) => t.status === 'done').length;
    const overdue = memberTasks.filter(
      (t) => t.status !== 'done' && new Date(t.due) < now,
    ).length;
    return { total, active, done, overdue };
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
                const lead = team.leadId != null ? safeUser(users, team.leadId) : null;
                const teamClients = (team.clientIds ?? [])
                  .map((cid) => clients.find((c) => c.id === cid))
                  .filter(Boolean);
                const summary = teamTaskSummary(team.members);
                const progress = summary.total ? summary.done / summary.total : 0;
                const isExpanded = expandedTeam === team.id;

                return (
                  <div
                    key={team.id}
                    style={{
                      background: theme.bgCard,
                      border: `1px solid ${theme.border}`,
                      borderRadius: 10,
                      borderTop: `3px solid ${team.color}`,
                      overflow: 'hidden',
                    }}
                  >
                    {/* Card body — clickable for expand/collapse */}
                    <div
                      onClick={() =>
                        setExpandedTeam(isExpanded ? null : team.id)
                      }
                      style={{ padding: 18, cursor: 'pointer' }}
                    >
                      {/* Icon + name + member count */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          marginBottom: 10,
                        }}
                      >
                        <span style={{ fontSize: 20 }}>{team.icon}</span>
                        <div style={{ flex: 1 }}>
                          <div
                            style={{
                              fontSize: 14,
                              fontWeight: 700,
                              color: theme.text,
                              fontFamily: FONT_HEADING,
                            }}
                          >
                            {team.name}
                          </div>
                          <div
                            style={{
                              fontSize: 11,
                              color: theme.textFaint,
                              fontFamily: FONT_BODY,
                            }}
                          >
                            {memberUsers.length} member
                            {memberUsers.length !== 1 ? 's' : ''}
                          </div>
                        </div>
                        {/* Edit button */}
                        {permissions.canEdit && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditTeam(team);
                            }}
                            title="Edit team"
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              fontSize: 14,
                              color: theme.textMuted,
                              padding: '4px 6px',
                              borderRadius: 6,
                            }}
                          >
                            {'\u270F\uFE0F'}
                          </button>
                        )}
                      </div>

                      {/* Lead badge */}
                      {lead && lead.id !== -1 && (
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            marginBottom: 10,
                          }}
                        >
                          <Avatar user={lead} size={20} />
                          <span
                            style={{
                              fontSize: 11,
                              color: theme.textSecondary,
                              fontFamily: FONT_BODY,
                            }}
                          >
                            {lead.name}
                          </span>
                          <PillBadge
                            label="Lead"
                            color={PRIMARY_COLOR}
                            style={{ marginLeft: 2 }}
                          />
                        </div>
                      )}

                      {/* Member avatars row */}
                      {memberUsers.length > 0 && (
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            marginBottom: 10,
                          }}
                        >
                          {memberUsers.slice(0, MAX_AVATARS).map((u) => (
                            <Avatar key={u.id} user={u} size={28} />
                          ))}
                          {memberUsers.length > MAX_AVATARS && (
                            <span
                              style={{
                                fontSize: 10,
                                color: theme.textMuted,
                                fontWeight: 600,
                                fontFamily: FONT_BODY,
                              }}
                            >
                              +{memberUsers.length - MAX_AVATARS} more
                            </span>
                          )}
                        </div>
                      )}

                      {/* Client pills */}
                      {teamClients.length > 0 && (
                        <div
                          style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: 6,
                            marginBottom: 10,
                          }}
                        >
                          {teamClients.map((client) =>
                            client ? (
                              <span
                                key={client.id}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  padding: '2px 8px',
                                  borderRadius: 10,
                                  fontSize: 10,
                                  fontWeight: 600,
                                  fontFamily: FONT_BODY,
                                  background: client.color + '18',
                                  color: theme.textSecondary,
                                  border: `1px solid ${client.color}40`,
                                }}
                              >
                                <span
                                  style={{
                                    width: 7,
                                    height: 7,
                                    borderRadius: '50%',
                                    background: client.color,
                                    display: 'inline-block',
                                    flexShrink: 0,
                                  }}
                                />
                                {client.name}
                              </span>
                            ) : null,
                          )}
                        </div>
                      )}

                      {/* Task summary */}
                      <div
                        style={{
                          display: 'flex',
                          gap: 10,
                          marginBottom: 10,
                          fontSize: 11,
                          fontFamily: FONT_BODY,
                        }}
                      >
                        <span style={{ color: theme.textMuted }}>
                          {summary.total} tasks
                        </span>
                        <span style={{ color: COLOR_WARNING }}>
                          {summary.active} active
                        </span>
                        <span style={{ color: COLOR_SUCCESS }}>
                          {summary.done} done
                        </span>
                        {summary.overdue > 0 && (
                          <span style={{ color: COLOR_DANGER, fontWeight: 700 }}>
                            {summary.overdue} overdue
                          </span>
                        )}
                      </div>

                      {/* Progress bar */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <ProgressBar value={progress} theme={theme} />
                        </div>
                        <span
                          style={{
                            fontSize: 11,
                            color: theme.textMuted,
                            fontFamily: FONT_BODY,
                          }}
                        >
                          {summary.done}/{summary.total}
                        </span>
                      </div>
                    </div>

                    {/* Expanded section */}
                    {isExpanded && (
                      <div
                        style={{
                          borderTop: `1px solid ${theme.border}`,
                          padding: 18,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 10,
                        }}
                      >
                        {/* Per-member rows */}
                        <div
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: theme.textMuted,
                            fontFamily: FONT_HEADING,
                            marginBottom: 2,
                          }}
                        >
                          Members
                        </div>
                        {memberUsers.map((u) => {
                          const uTasks = tasksByAssignee.get(u.id) || [];
                          const uGoals = goalsByOwner.get(u.id) || [];
                          const uOverdue = uTasks.filter(
                            (t) =>
                              t.status !== 'done' && new Date(t.due) < now,
                          ).length;
                          return (
                            <div
                              key={u.id}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                fontSize: 12,
                                fontFamily: FONT_BODY,
                              }}
                            >
                              <Avatar user={u} size={24} />
                              <span
                                style={{
                                  flex: 1,
                                  color: theme.text,
                                  fontWeight: 600,
                                }}
                              >
                                {u.name}
                              </span>
                              <PillBadge
                                label={u.role}
                                color={roleColor(u.role)}
                              />
                              <span
                                style={{
                                  color: theme.textMuted,
                                  fontSize: 10,
                                }}
                              >
                                {uTasks.length} tasks
                              </span>
                              <span
                                style={{
                                  color: theme.textMuted,
                                  fontSize: 10,
                                }}
                              >
                                {uGoals.length} goals
                              </span>
                              {uOverdue > 0 && (
                                <PillBadge
                                  label={`${uOverdue} overdue`}
                                  color={COLOR_DANGER}
                                  bold
                                />
                              )}
                            </div>
                          );
                        })}

                        {/* Per-client rows */}
                        {teamClients.length > 0 && (
                          <>
                            <div
                              style={{
                                fontSize: 11,
                                fontWeight: 700,
                                color: theme.textMuted,
                                fontFamily: FONT_HEADING,
                                marginTop: 8,
                                marginBottom: 2,
                              }}
                            >
                              Clients
                            </div>
                            {teamClients.map((client) => {
                              if (!client) return null;
                              // Goals owned by team members that belong to this client
                              const clientGoals = goals.filter(
                                (g) =>
                                  team.members.includes(g.owner) &&
                                  g.clientIds?.includes(client.id),
                              );
                              const avgProgress =
                                clientGoals.length > 0
                                  ? clientGoals.reduce(
                                      (sum, g) => sum + g.progress,
                                      0,
                                    ) / clientGoals.length
                                  : 0;
                              return (
                                <div
                                  key={client.id}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    fontSize: 12,
                                    fontFamily: FONT_BODY,
                                  }}
                                >
                                  <span
                                    style={{
                                      width: 8,
                                      height: 8,
                                      borderRadius: '50%',
                                      background: client.color,
                                      flexShrink: 0,
                                    }}
                                  />
                                  <span
                                    style={{
                                      flex: 1,
                                      color: theme.text,
                                      fontWeight: 600,
                                    }}
                                  >
                                    {client.name}
                                  </span>
                                  <span
                                    style={{
                                      color: theme.textMuted,
                                      fontSize: 10,
                                    }}
                                  >
                                    {clientGoals.length} goal
                                    {clientGoals.length !== 1 ? 's' : ''}
                                  </span>
                                  <div style={{ width: 80 }}>
                                    <ProgressBar
                                      value={avgProgress}
                                      theme={theme}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </>
                        )}
                      </div>
                    )}
                  </div>
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
              {users.map((user) => {
                const userTasks = tasksByAssignee.get(user.id) || [];
                const userGoals = goalsByOwner.get(user.id) || [];
                const activeTasks = userTasks.filter((t) => t.status === 'in_progress');
                const doneTasks = userTasks.filter((t) => t.status === 'done');
                const overdueTasks = userTasks.filter(
                  (t) => t.status !== 'done' && new Date(t.due) < now,
                );
                const userClients = (user.clientIds ?? [])
                  .map((cid) => clients.find((c) => c.id === cid))
                  .filter(Boolean);
                const isExpanded = expandedMember === user.id;

                type StatFilter = 'tasks' | 'active' | 'done' | 'overdue' | 'goals';
                const stats: { label: string; value: number; color: string; filter: StatFilter }[] = [
                  { label: 'Tasks', value: userTasks.length, color: theme.textSecondary, filter: 'tasks' },
                  { label: 'Active', value: activeTasks.length, color: COLOR_WARNING, filter: 'active' },
                  { label: 'Done', value: doneTasks.length, color: COLOR_SUCCESS, filter: 'done' },
                  { label: 'Overdue', value: overdueTasks.length, color: COLOR_DANGER, filter: 'overdue' },
                ];

                return (
                  <div
                    key={user.id}
                    style={{
                      background: theme.bgCard,
                      border: `1px solid ${theme.border}`,
                      borderRadius: 10,
                      overflow: 'hidden',
                    }}
                  >
                    {/* Card body */}
                    <div style={{ padding: 18 }}>
                      {/* Avatar + name + role badge + edit */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: 10,
                          marginBottom: 12,
                        }}
                      >
                        <Avatar user={user} size={40} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: 14,
                              fontWeight: 700,
                              color: theme.text,
                              fontFamily: FONT_HEADING,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {user.name}
                          </div>
                          <div
                            style={{
                              fontSize: 11,
                              color: theme.textSecondary,
                              fontFamily: FONT_BODY,
                              marginTop: 1,
                            }}
                          >
                            {user.title}
                            {user.dept ? ` · ${user.dept}` : ''}
                          </div>
                        </div>
                        <PillBadge
                          label={user.role}
                          color={roleColor(user.role)}
                        />
                        {permissions.canEdit && (
                          <button
                            onClick={() => {
                              setEditingUser(user);
                              setUserModalOpen(true);
                            }}
                            title="Edit member"
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              fontSize: 14,
                              color: theme.textMuted,
                              padding: '4px 6px',
                              borderRadius: 6,
                              flexShrink: 0,
                            }}
                          >
                            {'\u270F\uFE0F'}
                          </button>
                        )}
                      </div>

                      {/* Skills */}
                      {(user.skills ?? []).length > 0 && (
                        <div
                          style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: 4,
                            marginBottom: 10,
                          }}
                        >
                          {(user.skills ?? []).map((skill) => (
                            <PillBadge
                              key={skill}
                              label={skill}
                              color={PRIMARY_COLOR}
                            />
                          ))}
                        </div>
                      )}

                      {/* Client pills */}
                      {userClients.length > 0 && (
                        <div
                          style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: 6,
                            marginBottom: 10,
                          }}
                        >
                          {userClients.map((client) =>
                            client ? (
                              <span
                                key={client.id}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  padding: '2px 8px',
                                  borderRadius: 10,
                                  fontSize: 10,
                                  fontWeight: 600,
                                  fontFamily: FONT_BODY,
                                  background: client.color + '18',
                                  color: theme.textSecondary,
                                  border: `1px solid ${client.color}40`,
                                }}
                              >
                                <span
                                  style={{
                                    width: 7,
                                    height: 7,
                                    borderRadius: '50%',
                                    background: client.color,
                                    display: 'inline-block',
                                    flexShrink: 0,
                                  }}
                                />
                                {client.name}
                              </span>
                            ) : null,
                          )}
                        </div>
                      )}

                      {/* Stat cards row */}
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(4, 1fr)',
                          gap: 6,
                          marginBottom: 4,
                        }}
                      >
                        {stats.map((stat) => {
                          const isActive =
                            isExpanded && memberFilter === stat.filter;
                          return (
                            <button
                              key={stat.filter}
                              onClick={() => {
                                if (isActive) {
                                  setExpandedMember(null);
                                } else {
                                  setExpandedMember(user.id);
                                  setMemberFilter(stat.filter);
                                }
                              }}
                              style={{
                                padding: '8px 4px',
                                borderRadius: 8,
                                border: `1px solid ${isActive ? stat.color : theme.border}`,
                                background: isActive
                                  ? stat.color + '18'
                                  : theme.bgMuted,
                                cursor: 'pointer',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                gap: 2,
                              }}
                            >
                              <span
                                style={{
                                  fontSize: 15,
                                  fontWeight: 700,
                                  color: stat.color,
                                  fontFamily: FONT_HEADING,
                                  lineHeight: 1,
                                }}
                              >
                                {stat.value}
                              </span>
                              <span
                                style={{
                                  fontSize: 9,
                                  color: theme.textMuted,
                                  fontFamily: FONT_BODY,
                                  fontWeight: 600,
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.04em',
                                }}
                              >
                                {stat.label}
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      {/* Goals owned */}
                      <button
                        onClick={() => {
                          const isGoalsActive =
                            isExpanded && memberFilter === 'goals';
                          if (isGoalsActive) {
                            setExpandedMember(null);
                          } else {
                            setExpandedMember(user.id);
                            setMemberFilter('goals');
                          }
                        }}
                        style={{
                          width: '100%',
                          marginTop: 6,
                          padding: '6px 10px',
                          borderRadius: 8,
                          border: `1px solid ${isExpanded && memberFilter === 'goals' ? PRIMARY_COLOR : theme.border}`,
                          background:
                            isExpanded && memberFilter === 'goals'
                              ? PRIMARY_COLOR + '12'
                              : theme.bgMuted,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          fontSize: 11,
                          fontFamily: FONT_BODY,
                          color: theme.textSecondary,
                        }}
                      >
                        <span>Goals owned</span>
                        <span
                          style={{
                            fontWeight: 700,
                            color: PRIMARY_COLOR,
                            fontFamily: FONT_HEADING,
                            fontSize: 13,
                          }}
                        >
                          {userGoals.length}
                        </span>
                      </button>
                    </div>

                    {/* Inline detail */}
                    {isExpanded && (
                      <MemberInlineDetail
                        tasks={userTasks}
                        goals={userGoals}
                        clients={clients}
                        filter={memberFilter}
                        theme={theme}
                      />
                    )}
                  </div>
                );
              })}
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
