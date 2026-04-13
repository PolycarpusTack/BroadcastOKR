import React, { useState, useMemo } from 'react';
import { Avatar } from '../ui/Avatar';
import { ProgressBar } from '../ui/ProgressBar';
import { PillBadge } from '../ui/PillBadge';
import { roleColor } from '../../utils/colors';
import {
  PRIMARY_COLOR,
  COLOR_SUCCESS,
  COLOR_WARNING,
  COLOR_DANGER,
  FONT_HEADING,
  FONT_BODY,
} from '../../constants/config';
import type { User, Team, Client, Goal, Task, Theme } from '../../types';

const MAX_AVATARS = 8;

interface TeamTaskSummary {
  total: number;
  active: number;
  done: number;
  overdue: number;
}

interface TeamCardProps {
  team: Team;
  memberUsers: User[];
  goals: Goal[];
  tasksByAssignee: Map<number, Task[]>;
  goalsByOwner: Map<number, Goal[]>;
  clients: Client[];
  theme: Theme;
  permissions: { canEdit: boolean };
  now: Date;
  onEdit: (team: Team) => void;
}

export const TeamCard = React.memo(function TeamCard({
  team,
  memberUsers,
  goals,
  tasksByAssignee,
  goalsByOwner,
  clients,
  theme,
  permissions,
  now,
  onEdit,
}: TeamCardProps) {
  const [expanded, setExpanded] = useState(false);

  const lead = team.leadId != null
    ? memberUsers.find((u) => u.id === team.leadId) ?? null
    : null;

  const teamClients = useMemo(
    () =>
      (team.clientIds ?? [])
        .map((cid) => clients.find((c) => c.id === cid))
        .filter(Boolean),
    [team.clientIds, clients],
  );

  const summary: TeamTaskSummary = useMemo(() => {
    const memberTasks = team.members.flatMap((id) => tasksByAssignee.get(id) || []);
    const total = memberTasks.length;
    const active = memberTasks.filter((t) => t.status === 'in_progress').length;
    const done = memberTasks.filter((t) => t.status === 'done').length;
    const overdue = memberTasks.filter(
      (t) => t.status !== 'done' && new Date(t.due) < now,
    ).length;
    return { total, active, done, overdue };
  }, [team.members, tasksByAssignee, now]);

  const progress = summary.total ? summary.done / summary.total : 0;

  return (
    <div
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
        onClick={() => setExpanded((prev) => !prev)}
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
                onEdit(team);
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
      {expanded && (
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
});
