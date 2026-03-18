import { useMemo, useState } from 'react';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useStore } from '../store/store';
import { safeUser } from '../utils/safeGet';
import { roleColor } from '../utils/colors';
import { Avatar } from '../components/ui/Avatar';
import { ProgressBar } from '../components/ui/ProgressBar';
import { PillBadge } from '../components/ui/PillBadge';
import { UserModal } from '../components/team/UserModal';
import { TeamModal } from '../components/team/TeamModal';
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
  const users = useStore((s) => s.users);
  const teams = useStore((s) => s.teams);
  const clients = useStore((s) => s.clients);
  const goals = useStore((s) => s.goals);
  const tasks = useStore((s) => s.tasks);
  const addUser = useStore((s) => s.addUser);
  const updateUser = useStore((s) => s.updateUser);
  const deleteUser = useStore((s) => s.deleteUser);
  const addTeam = useStore((s) => s.addTeam);
  const updateTeam = useStore((s) => s.updateTeam);
  const deleteTeam = useStore((s) => s.deleteTeam);

  // View toggle
  const [view, setView] = useState<'teams' | 'members' | 'workload'>('teams');

  // Modal state
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | undefined>();
  const [teamModalOpen, setTeamModalOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<Team | undefined>();

  // Team card expansion
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);

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

      {/* Members view — placeholder */}
      {view === 'members' && (
        <div
          style={{
            padding: 40,
            textAlign: 'center',
            color: theme.textMuted,
            fontSize: 14,
            fontFamily: FONT_BODY,
          }}
        >
          Members view — coming next
        </div>
      )}

      {/* Workload view — placeholder */}
      {view === 'workload' && (
        <div
          style={{
            padding: 40,
            textAlign: 'center',
            color: theme.textMuted,
            fontSize: 14,
            fontFamily: FONT_BODY,
          }}
        >
          Workload view — coming next
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
