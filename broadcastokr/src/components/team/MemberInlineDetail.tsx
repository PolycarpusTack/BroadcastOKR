import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { PillBadge } from '../ui/PillBadge';
import { ProgressBar } from '../ui/ProgressBar';
import { statusIcon, progressColor } from '../../utils/colors';
import { STATUS_COLORS, STATUS_LABELS } from '../../constants/statuses';
import {
  PRIMARY_COLOR,
  FONT_BODY,
  FONT_HEADING,
} from '../../constants/config';
import type { Task, Goal, Client, Theme } from '../../types';

const MAX_ITEMS = 10;

interface MemberInlineDetailProps {
  tasks: Task[];
  goals: Goal[];
  clients: Client[];
  filter: 'tasks' | 'active' | 'done' | 'overdue' | 'goals';
  theme: Theme;
}

export function MemberInlineDetail({
  tasks,
  goals,
  clients,
  filter,
  theme,
}: MemberInlineDetailProps) {
  const navigate = useNavigate();
  const now = useMemo(() => new Date(), []);

  const filteredTasks = useMemo(() => {
    if (filter === 'goals') return [];
    let list = tasks;
    if (filter === 'active') list = tasks.filter((t) => t.status === 'in_progress');
    else if (filter === 'done') list = tasks.filter((t) => t.status === 'done');
    else if (filter === 'overdue')
      list = tasks.filter((t) => t.status !== 'done' && new Date(t.due) < now);
    return list.slice(0, MAX_ITEMS);
  }, [tasks, goals, filter, now]);

  const filteredGoals = useMemo(() => {
    if (filter !== 'goals') return [];
    return goals.slice(0, MAX_ITEMS);
  }, [goals, filter]);

  const showGoals = filter === 'goals';
  const isEmpty = showGoals ? filteredGoals.length === 0 : filteredTasks.length === 0;

  return (
    <div
      style={{
        borderTop: `1px solid ${theme.border}`,
        padding: '14px 18px',
        background: theme.bgMuted,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      {isEmpty ? (
        <div
          style={{
            fontSize: 12,
            color: theme.textFaint,
            fontFamily: FONT_BODY,
            textAlign: 'center',
            padding: '8px 0',
          }}
        >
          No items matching this filter.
        </div>
      ) : showGoals ? (
        <>
          {filteredGoals.map((goal) => {
            const goalClients = (goal.clientIds ?? [])
              .map((cid) => clients.find((c) => c.id === cid))
              .filter(Boolean) as Client[];
            return (
              <div
                key={goal.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 12,
                  fontFamily: FONT_BODY,
                }}
              >
                <span style={{ fontSize: 13 }}>{statusIcon(goal.status)}</span>
                <span
                  style={{
                    flex: 1,
                    color: theme.text,
                    fontWeight: 500,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {goal.title}
                </span>
                <div style={{ width: 60, flexShrink: 0 }}>
                  <ProgressBar
                    value={goal.progress}
                    theme={theme}
                    color={progressColor(goal.progress)}
                  />
                </div>
                <span
                  style={{
                    fontSize: 10,
                    color: theme.textMuted,
                    fontFamily: FONT_BODY,
                    flexShrink: 0,
                  }}
                >
                  {Math.round(goal.progress * 100)}%
                </span>
                {goalClients.map((client) => (
                  <span
                    key={client.id}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 3,
                      padding: '2px 6px',
                      borderRadius: 8,
                      fontSize: 10,
                      fontWeight: 600,
                      fontFamily: FONT_BODY,
                      background: client.color + '18',
                      color: theme.textSecondary,
                      border: `1px solid ${client.color}40`,
                      flexShrink: 0,
                    }}
                  >
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: client.color,
                        display: 'inline-block',
                        flexShrink: 0,
                      }}
                    />
                    {client.name}
                  </span>
                ))}
              </div>
            );
          })}
        </>
      ) : (
        <>
          {filteredTasks.map((task) => {
            const taskClients = (task.clientIds ?? [])
              .map((cid) => clients.find((c) => c.id === cid))
              .filter(Boolean) as Client[];
            const isOverdue =
              task.status !== 'done' && new Date(task.due) < now;
            const dueDate = task.due
              ? new Date(task.due).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                })
              : null;
            return (
              <div
                key={task.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 12,
                  fontFamily: FONT_BODY,
                }}
              >
                <PillBadge
                  label={STATUS_LABELS[task.status]}
                  color={STATUS_COLORS[task.status]}
                />
                <span
                  style={{
                    flex: 1,
                    color: theme.text,
                    fontWeight: 500,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {task.title}
                </span>
                {dueDate && (
                  <span
                    style={{
                      fontSize: 10,
                      color: isOverdue ? '#F87171' : theme.textMuted,
                      fontWeight: isOverdue ? 700 : 400,
                      flexShrink: 0,
                      fontFamily: FONT_BODY,
                    }}
                  >
                    {dueDate}
                  </span>
                )}
                {taskClients.map((client) => (
                  <span
                    key={client.id}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 3,
                      padding: '2px 6px',
                      borderRadius: 8,
                      fontSize: 10,
                      fontWeight: 600,
                      fontFamily: FONT_BODY,
                      background: client.color + '18',
                      color: theme.textSecondary,
                      border: `1px solid ${client.color}40`,
                      flexShrink: 0,
                    }}
                  >
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: client.color,
                        display: 'inline-block',
                        flexShrink: 0,
                      }}
                    />
                    {client.name}
                  </span>
                ))}
              </div>
            );
          })}
        </>
      )}

      {/* Navigation link */}
      <div style={{ marginTop: 4 }}>
        <button
          onClick={() => navigate(showGoals ? '/goals' : '/tasks')}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 11,
            color: PRIMARY_COLOR,
            fontFamily: FONT_HEADING,
            fontWeight: 700,
            padding: 0,
            textDecoration: 'underline',
          }}
        >
          {showGoals ? 'View in Goals' : 'View in Tasks'} &rarr;
        </button>
      </div>
    </div>
  );
}
