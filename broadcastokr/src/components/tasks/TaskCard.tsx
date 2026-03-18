import { memo, useMemo } from 'react';
import { CHANNELS, USERS, PRIORITIES, TASK_TYPES } from '../../constants';
import { safeUser, safeChannel } from '../../utils/safeGet';
import { ChannelBadge } from '../ui/ChannelBadge';
import { PillBadge } from '../ui/PillBadge';
import { Avatar } from '../ui/Avatar';
import { daysUntil, getUrgencyBadge } from '../../utils/dates';
import { useStore } from '../../store/store';
import type { Task, Theme } from '../../types';
import { resolveScopedChannels } from '../../utils/channelScope';

interface TaskCardProps {
  task: Task;
  theme: Theme;
  dark: boolean;
  onClick: () => void;
}

export const TaskCard = memo(function TaskCard({ task, theme, dark, onClick }: TaskCardProps) {
  const clients = useStore((s) => s.clients);
  const user = safeUser(USERS, task.assignee);
  const days = daysUntil(task.due);
  const badge = getUrgencyBadge(days, dark);
  const pri = PRIORITIES[task.priority];
  const tt = TASK_TYPES.find((t) => t.key === task.taskType);

  const taskClientsData = useMemo(
    () => clients.filter((c) => task.clientIds?.includes(c.id)),
    [clients, task.clientIds],
  );
  const resolvedTaskScopedChannels = useMemo(
    () => task.channelScope?.type === 'selected' ? resolveScopedChannels(task.channelScope, clients) : [],
    [clients, task.channelScope],
  );
  const visibleTaskScopedChannels = resolvedTaskScopedChannels.slice(0, 2);
  const remainingScopedChannelCount = resolvedTaskScopedChannels.length - visibleTaskScopedChannels.length;

  const hasClientScope = task.clientIds && task.clientIds.length > 0;

  return (
    <div
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      role="button"
      tabIndex={0}
      aria-label={`Task: ${task.title}, ${pri.label} priority, assigned to ${user.name}`}
      style={{
        background: theme.bgCard,
        border: `1px solid ${theme.borderLight}`,
        borderRadius: 10,
        padding: '12px 14px',
        cursor: 'pointer',
        borderLeft: `3px solid ${pri.color}`,
        transition: 'box-shadow .15s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,.3)'; e.currentTarget.style.background = theme.bgCardHover; }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.background = theme.bgCard; }}
    >
      <div style={{ fontSize: 12, fontWeight: 600, color: theme.text, marginBottom: 8 }}>{task.title}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {hasClientScope ? (
          <>
            {taskClientsData.map((c) => (
              <span
                key={c.id}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3,
                  padding: '1px 6px',
                  borderRadius: 8,
                  background: c.color + '22',
                  border: `1px solid ${c.color}55`,
                  fontSize: 10,
                  color: theme.text,
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: c.color, flexShrink: 0 }} />
                {c.name}
              </span>
            ))}
            {task.channelScope && (
              task.channelScope.type === 'all' ? (
                <span style={{ fontSize: 10, color: theme.textMuted, padding: '1px 5px', borderRadius: 6, background: theme.bgMuted, border: `1px solid ${theme.borderLight}` }}>
                  All Ch.
                </span>
              ) : (
                <>
                  {visibleTaskScopedChannels.map((channel) => (
                    <PillBadge
                      key={channel.key}
                      label={channel.label}
                      color={channel.color}
                      style={{ padding: '1px 5px', fontSize: 10 }}
                    />
                  ))}
                  {remainingScopedChannelCount > 0 && (
                    <span style={{ fontSize: 10, color: theme.textMuted, padding: '1px 5px', borderRadius: 6, background: theme.bgMuted, border: `1px solid ${theme.borderLight}` }}>
                      +{remainingScopedChannelCount} more
                    </span>
                  )}
                </>
              )
            )}
          </>
        ) : (
          <ChannelBadge channel={safeChannel(CHANNELS, task.channel)} />
        )}
        {tt && <PillBadge label={tt.label} color={tt.color} icon={tt.icon} bg={tt.color + '18'} style={{ padding: '2px 6px' }} />}
        <PillBadge label={badge.text} color={badge.fg} bold bg={badge.bg} fg={badge.fg} pulse={badge.pulse} style={{ padding: '2px 6px' }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Avatar user={user} size={20} />
          <span style={{ fontSize: 11, color: theme.textMuted }}>{user.name.split(' ')[0]}</span>
        </div>
        {task.subtasks.length > 0 && (
          <span style={{ fontSize: 10, color: theme.textFaint }}>
            {task.subtasks.filter((s) => s.done).length}/{task.subtasks.length} subtasks
          </span>
        )}
      </div>
    </div>
  );
});
