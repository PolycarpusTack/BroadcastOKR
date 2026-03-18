import { useMemo } from 'react';
import type { User, Task, Theme } from '../../types';
import { Avatar } from '../ui/Avatar';
import { PillBadge } from '../ui/PillBadge';
import { STATUS_FLOW, STATUS_COLORS, STATUS_LABELS } from '../../constants';
import { COLOR_DANGER, FONT_BODY, FONT_HEADING } from '../../constants/config';

interface TaskLoadChartProps {
  users: User[];
  tasks: Task[];
  theme: Theme;
}

export function TaskLoadChart({ users, tasks, theme }: TaskLoadChartProps) {
  const now = useMemo(() => new Date(), []);

  const rows = useMemo(() => {
    return users
      .map((user) => {
        const userTasks = tasks.filter((t) => t.assignee === user.id);
        const counts: Record<string, number> = {};
        for (const status of STATUS_FLOW) {
          counts[status] = userTasks.filter((t) => t.status === status).length;
        }
        const total = userTasks.length;
        const overdue = userTasks.filter(
          (t) => t.status !== 'done' && new Date(t.due) < now,
        ).length;
        return { user, counts, total, overdue };
      })
      .sort((a, b) => b.total - a.total);
  }, [users, tasks, now]);

  const maxTotal = useMemo(
    () => Math.max(1, ...rows.map((r) => r.total)),
    [rows],
  );

  if (rows.length === 0 || rows.every((r) => r.total === 0)) {
    return (
      <div
        style={{
          padding: '32px 0',
          textAlign: 'center',
          color: theme.textMuted,
          fontSize: 13,
          fontFamily: FONT_BODY,
        }}
      >
        No tasks assigned to any team member.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {/* Legend */}
      <div
        style={{
          display: 'flex',
          gap: 12,
          marginBottom: 8,
          flexWrap: 'wrap',
        }}
      >
        {STATUS_FLOW.map((status) => (
          <span
            key={status}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              fontSize: 10,
              fontFamily: FONT_BODY,
              color: theme.textMuted,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 2,
                background: STATUS_COLORS[status],
                display: 'inline-block',
                flexShrink: 0,
              }}
            />
            {STATUS_LABELS[status]}
          </span>
        ))}
      </div>

      {/* Rows */}
      {rows.map(({ user, counts, total, overdue }) => (
        <div
          key={user.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            height: 36,
            borderRadius: 8,
            background: theme.bgMuted,
            padding: '0 10px',
          }}
        >
          {/* Left: avatar + name */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              width: 128,
              flexShrink: 0,
            }}
          >
            <Avatar user={user} size={24} />
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: theme.text,
                fontFamily: FONT_HEADING,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {user.name}
            </span>
          </div>

          {/* Middle: stacked segments */}
          <div
            style={{
              flex: 1,
              height: 20,
              borderRadius: 4,
              overflow: 'hidden',
              display: 'flex',
              background: theme.border,
            }}
          >
            {STATUS_FLOW.map((status) => {
              const count = counts[status] ?? 0;
              if (count === 0) return null;
              const widthPct = (count / maxTotal) * 100;
              return (
                <div
                  key={status}
                  title={`${STATUS_LABELS[status]}: ${count}`}
                  style={{
                    width: `${widthPct}%`,
                    height: '100%',
                    background: STATUS_COLORS[status],
                    flexShrink: 0,
                  }}
                />
              );
            })}
          </div>

          {/* Right: total + overdue badge */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              flexShrink: 0,
              minWidth: 60,
              justifyContent: 'flex-end',
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: theme.textSecondary,
                fontFamily: FONT_HEADING,
              }}
            >
              {total}
            </span>
            {overdue > 0 && (
              <PillBadge
                label={`${overdue} overdue`}
                color={COLOR_DANGER}
                bold
              />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
