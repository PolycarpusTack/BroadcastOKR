import { CHANNELS, USERS, STATUS_FLOW, STATUS_LABELS, STATUS_COLORS, PRIORITIES, TASK_TYPES } from '../../constants';
import { safeUser } from '../../utils/safeGet';
import { ChannelBadge } from '../ui/ChannelBadge';
import { Avatar } from '../ui/Avatar';
import { Modal } from '../ui/Modal';
import { daysUntil, getUrgencyBadge } from '../../utils/dates';
import { useStore } from '../../store/store';
import type { Task, TaskStatus, Theme, RolePermissions } from '../../types';

interface TaskDetailModalProps {
  taskId: string | null;
  onClose: () => void;
  onMove: (taskId: string, status: TaskStatus) => void;
  permissions: RolePermissions;
  theme: Theme;
  dark: boolean;
}

export function TaskDetailModal({ taskId, onClose, onMove, permissions, theme, dark }: TaskDetailModalProps) {
  const tasks = useStore((s) => s.tasks);
  const toggleSubtask = useStore((s) => s.toggleSubtask);

  const task = taskId ? tasks.find((t) => t.id === taskId) ?? null : null;

  return (
    <Modal open={!!task} onClose={onClose} title={task?.title || ''} theme={theme} width={560}>
      {task && <TaskDetailContent task={task} onMove={onMove} toggleSubtask={toggleSubtask} permissions={permissions} theme={theme} dark={dark} />}
    </Modal>
  );
}

function TaskDetailContent({ task, onMove, toggleSubtask, permissions, theme, dark }: {
  task: Task;
  onMove: (taskId: string, status: TaskStatus) => void;
  toggleSubtask: (taskId: string, subtaskIndex: number) => void;
  permissions: RolePermissions;
  theme: Theme;
  dark: boolean;
}) {
  const user = safeUser(USERS, task.assignee);
  const pri = PRIORITIES[task.priority];
  const tt = TASK_TYPES.find((t) => t.key === task.taskType);
  const days = daysUntil(task.due);
  const badge = getUrgencyBadge(days, dark);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <ChannelBadge channel={CHANNELS[task.channel]} />
        {tt && <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: tt.color + '18', color: tt.color }}>{tt.icon} {tt.label}</span>}
        <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: pri.color + '18', color: pri.color }}>{pri.icon} {pri.label}</span>
        <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: badge.bg, color: badge.fg }}>{badge.text}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Avatar user={user} size={28} />
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>{user.name}</div>
          <div style={{ fontSize: 11, color: theme.textFaint }}>{user.title}</div>
        </div>
      </div>

      {permissions.canChangeStatus && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, marginBottom: 6, textTransform: 'uppercase' }}>Move to</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {STATUS_FLOW.filter((s) => s !== task.status).map((s) => (
              <button
                key={s}
                onClick={() => onMove(task.id, s)}
                style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${STATUS_COLORS[s]}40`, background: STATUS_COLORS[s] + '18', color: STATUS_COLORS[s], fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
              >
                {STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        </div>
      )}

      {task.subtasks.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, marginBottom: 6, textTransform: 'uppercase' }}>
            Subtasks ({task.subtasks.filter((s) => s.done).length}/{task.subtasks.length})
          </div>
          {task.subtasks.map((sub, si) => (
            <div
              key={si}
              onClick={() => toggleSubtask(task.id, si)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 6, cursor: 'pointer', background: theme.bgMuted, marginBottom: 4 }}
            >
              <div style={{ width: 16, height: 16, borderRadius: 4, border: `2px solid ${sub.done ? '#10b981' : theme.border}`, background: sub.done ? '#10b981' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#fff', flexShrink: 0 }}>
                {sub.done && '\u2713'}
              </div>
              <span style={{ fontSize: 12, color: sub.done ? theme.textFaint : theme.text, textDecoration: sub.done ? 'line-through' : 'none' }}>{sub.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
