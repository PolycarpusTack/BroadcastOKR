import { useState, useMemo } from 'react';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useActivityLog } from '../context/ActivityLogContext';
import { useStore } from '../store/store';
import { CHANNELS, USERS, STATUS_FLOW, STATUS_LABELS, STATUS_COLORS, PRIORITIES, TASK_TYPES } from '../constants';
import { safeUser } from '../utils/safeGet';
import { ChannelBadge } from '../components/ui/ChannelBadge';
import { Avatar } from '../components/ui/Avatar';
import { daysUntil, getUrgencyBadge } from '../utils/dates';
import { TaskCard } from '../components/tasks/TaskCard';
import { TaskDetailModal } from '../components/tasks/TaskDetailModal';
import { CreateTaskModal } from '../components/tasks/CreateTaskModal';
import type { Task, TaskStatus } from '../types';

interface TasksPageProps {
  createOpen: boolean;
  setCreateOpen: (open: boolean) => void;
}

export function TasksPage({ createOpen, setCreateOpen }: TasksPageProps) {
  const { theme, dark } = useTheme();
  const { currentUser, permissions } = useAuth();
  const { toast } = useToast();
  const { logAction } = useActivityLog();
  const tasks = useStore((s) => s.tasks);
  const addTask = useStore((s) => s.addTask);
  const moveTask = useStore((s) => s.moveTask);

  const [view, setView] = useState<'kanban' | 'list'>('kanban');
  const [filterChannel, setFilterChannel] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const filtered = useMemo(() => tasks.filter((t) => {
    if (filterChannel !== 'all' && t.channel !== Number(filterChannel)) return false;
    if (filterPriority !== 'all' && t.priority !== filterPriority) return false;
    if (filterType !== 'all' && t.taskType !== filterType) return false;
    return true;
  }), [tasks, filterChannel, filterPriority, filterType]);

  const selectStyle = {
    padding: '6px 10px',
    borderRadius: 8,
    border: `1px solid ${theme.borderInput}`,
    background: theme.bgInput,
    color: theme.text,
    fontSize: 12,
    outline: 'none',
  };

  const handleMove = (taskId: string, status: TaskStatus) => {
    if (!permissions.canChangeStatus) {
      toast('No permission to change status', '#ef4444', '\u{1F512}');
      return;
    }
    moveTask(taskId, status);
    toast(`Task moved to ${STATUS_LABELS[status]}`, STATUS_COLORS[status], '\u{1F504}');
    logAction(`Moved task to ${STATUS_LABELS[status]}`, currentUser.name, STATUS_COLORS[status]);
  };

  const handleCreated = (task: Task) => {
    addTask(task);
    toast(`Task created: ${task.title}`, '#4f46e5', '\u2705');
    logAction(`Created task: ${task.title}`, currentUser.name, '#4f46e5');
    setCreateOpen(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', borderRadius: 8, border: `1px solid ${theme.border}`, overflow: 'hidden' }}>
          {(['kanban', 'list'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                padding: '6px 14px',
                border: 'none',
                background: view === v ? '#4f46e5' : theme.bgMuted,
                color: view === v ? '#fff' : theme.textMuted,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {v === 'kanban' ? '\u{1F4CB} Board' : '\u{1F4DD} List'}
            </button>
          ))}
        </div>
        <select value={filterChannel} onChange={(e) => setFilterChannel(e.target.value)} style={selectStyle}>
          <option value="all">All Channels</option>
          {CHANNELS.map((ch, i) => (
            <option key={i} value={String(i)}>{ch.icon} {ch.name}</option>
          ))}
        </select>
        <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)} style={selectStyle}>
          <option value="all">All Priorities</option>
          {Object.entries(PRIORITIES).map(([k, v]) => (
            <option key={k} value={k}>{v.icon} {v.label}</option>
          ))}
        </select>
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)} style={selectStyle}>
          <option value="all">All Types</option>
          {TASK_TYPES.map((t) => (
            <option key={t.key} value={t.key}>{t.icon} {t.label}</option>
          ))}
        </select>
        <div style={{ flex: 1 }} />
        {permissions.canCreate && (
          <button
            onClick={() => setCreateOpen(true)}
            style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#4f46e5', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
          >
            + New Task
          </button>
        )}
      </div>

      {/* Kanban View */}
      {view === 'kanban' ? (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${STATUS_FLOW.length}, 1fr)`, gap: 14, alignItems: 'start' }}>
          {STATUS_FLOW.map((status) => {
            const colTasks = filtered.filter((t) => t.status === status);
            return (
              <div key={status} style={{ minHeight: 200 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_COLORS[status] }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: theme.text }}>{STATUS_LABELS[status]}</span>
                  <span style={{ fontSize: 11, color: theme.textFaint, marginLeft: 'auto' }}>{colTasks.length}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {colTasks.map((task) => (
                    <TaskCard key={task.id} task={task} theme={theme} dark={dark} onClick={() => setSelectedTaskId(task.id)} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* List View */
        <div style={{ background: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 14, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${theme.borderLight}` }}>
                {['Task', 'Status', 'Priority', 'Channel', 'Assignee', 'Due'].map((h) => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '.04em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((task) => {
                const user = safeUser(USERS, task.assignee);
                const days = daysUntil(task.due);
                const badge = getUrgencyBadge(days, dark);
                const pri = PRIORITIES[task.priority];
                return (
                  <tr key={task.id} onClick={() => setSelectedTaskId(task.id)} style={{ borderBottom: `1px solid ${theme.borderLight}`, cursor: 'pointer' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 600, color: theme.text }}>{task.title}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700, background: STATUS_COLORS[task.status] + '20', color: STATUS_COLORS[task.status] }}>{STATUS_LABELS[task.status]}</span>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ fontSize: 11, color: pri.color, fontWeight: 600 }}>{pri.icon} {pri.label}</span>
                    </td>
                    <td style={{ padding: '10px 14px' }}><ChannelBadge channel={CHANNELS[task.channel]} /></td>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Avatar user={user} size={20} />
                        <span style={{ color: theme.textMuted }}>{user.name.split(' ')[0]}</span>
                      </div>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: badge.bg, color: badge.fg }}>{badge.text}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <TaskDetailModal
        taskId={selectedTaskId}
        onClose={() => setSelectedTaskId(null)}
        onMove={handleMove}
        permissions={permissions}
        theme={theme}
        dark={dark}
      />

      <CreateTaskModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={handleCreated}
        theme={theme}
        selectStyle={selectStyle}
      />
    </div>
  );
}
