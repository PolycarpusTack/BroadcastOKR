import React, { useState, useMemo } from 'react';
import { Avatar } from '../ui/Avatar';
import { PillBadge } from '../ui/PillBadge';
import { MemberInlineDetail } from './MemberInlineDetail';
import { roleColor } from '../../utils/colors';
import {
  PRIMARY_COLOR,
  COLOR_SUCCESS,
  COLOR_WARNING,
  COLOR_DANGER,
  FONT_HEADING,
  FONT_BODY,
} from '../../constants/config';
import type { User, Client, Goal, Task, Theme } from '../../types';

type StatFilter = 'tasks' | 'active' | 'done' | 'overdue' | 'goals';

interface MemberCardProps {
  user: User;
  userTasks: Task[];
  userGoals: Goal[];
  clients: Client[];
  theme: Theme;
  permissions: { canEdit: boolean };
  onEdit: (user: User) => void;
}

export const MemberCard = React.memo(function MemberCard({
  user,
  userTasks,
  userGoals,
  clients,
  theme,
  permissions,
  onEdit,
}: MemberCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [filter, setFilter] = useState<StatFilter>('tasks');

  const activeTasks = useMemo(
    () => userTasks.filter((t) => t.status === 'in_progress'),
    [userTasks],
  );
  const doneTasks = useMemo(
    () => userTasks.filter((t) => t.status === 'done'),
    [userTasks],
  );
  const overdueTasks = useMemo(
    () =>
      userTasks.filter(
        (t) => t.status !== 'done' && new Date(t.due) < new Date(),
      ),
    [userTasks],
  );

  const userClients = useMemo(
    () =>
      (user.clientIds ?? [])
        .map((cid) => clients.find((c) => c.id === cid))
        .filter(Boolean),
    [user.clientIds, clients],
  );

  const stats: { label: string; value: number; color: string; filter: StatFilter }[] = [
    { label: 'Tasks', value: userTasks.length, color: theme.textSecondary, filter: 'tasks' },
    { label: 'Active', value: activeTasks.length, color: COLOR_WARNING, filter: 'active' },
    { label: 'Done', value: doneTasks.length, color: COLOR_SUCCESS, filter: 'done' },
    { label: 'Overdue', value: overdueTasks.length, color: COLOR_DANGER, filter: 'overdue' },
  ];

  return (
    <div
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
              onClick={() => onEdit(user)}
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
              expanded && filter === stat.filter;
            return (
              <button
                key={stat.filter}
                onClick={() => {
                  if (isActive) {
                    setExpanded(false);
                  } else {
                    setExpanded(true);
                    setFilter(stat.filter);
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
              expanded && filter === 'goals';
            if (isGoalsActive) {
              setExpanded(false);
            } else {
              setExpanded(true);
              setFilter('goals');
            }
          }}
          style={{
            width: '100%',
            marginTop: 6,
            padding: '6px 10px',
            borderRadius: 8,
            border: `1px solid ${expanded && filter === 'goals' ? PRIMARY_COLOR : theme.border}`,
            background:
              expanded && filter === 'goals'
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
      {expanded && (
        <MemberInlineDetail
          tasks={userTasks}
          goals={userGoals}
          clients={clients}
          filter={filter}
          theme={theme}
        />
      )}
    </div>
  );
});
