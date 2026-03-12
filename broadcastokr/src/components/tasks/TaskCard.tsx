import { CHANNELS, USERS, PRIORITIES, TASK_TYPES } from '../../constants';
import { safeUser } from '../../utils/safeGet';
import { ChannelBadge } from '../ui/ChannelBadge';
import { Avatar } from '../ui/Avatar';
import { daysUntil, getUrgencyBadge } from '../../utils/dates';
import type { Task, Theme } from '../../types';

interface TaskCardProps {
  task: Task;
  theme: Theme;
  dark: boolean;
  onClick: () => void;
}

export function TaskCard({ task, theme, dark, onClick }: TaskCardProps) {
  const user = safeUser(USERS, task.assignee);
  const days = daysUntil(task.due);
  const badge = getUrgencyBadge(days, dark);
  const pri = PRIORITIES[task.priority];
  const tt = TASK_TYPES.find((t) => t.key === task.taskType);

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
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,.08)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'none'; }}
    >
      <div style={{ fontSize: 12, fontWeight: 600, color: theme.text, marginBottom: 8 }}>{task.title}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <ChannelBadge channel={CHANNELS[task.channel]} />
        {tt && <span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: tt.color + '18', color: tt.color }}>{tt.icon} {tt.label}</span>}
        <span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: badge.bg, color: badge.fg, animation: badge.pulse ? 'urgPulse 2s infinite' : 'none' }}>{badge.text}</span>
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
}
