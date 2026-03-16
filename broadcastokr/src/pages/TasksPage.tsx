import { useState, useMemo } from 'react';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useActivityLog } from '../context/ActivityLogContext';
import { useStore } from '../store/store';
import { CHANNELS, USERS, STATUS_FLOW, STATUS_LABELS, STATUS_COLORS, PRIORITIES, TASK_TYPES } from '../constants';
import { PRIMARY_COLOR, COLOR_DANGER } from '../constants/config';
import { safeUser, safeChannel } from '../utils/safeGet';
import { selectStyle as makeSelectStyle } from '../utils/styles';
import { ChannelBadge } from '../components/ui/ChannelBadge';
import { PillBadge } from '../components/ui/PillBadge';
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
  const clients = useStore((s) => s.clients);

  const [view, setView] = useState<'kanban' | 'list'>('kanban');
  const [filterChannel, setFilterChannel] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [filterClient, setFilterClient] = useState('all');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const filtered = useMemo(() => tasks.filter((t) => {
    if (filterChannel !== 'all' && t.channel !== Number(filterChannel)) return false;
    if (filterPriority !== 'all' && t.priority !== filterPriority) return false;
    if (filterType !== 'all' && t.taskType !== filterType) return false;
    if (filterClient !== 'all' && !(t.clientIds?.includes(filterClient))) return false;
    return true;
  }), [tasks, filterChannel, filterPriority, filterType, filterClient]);

  const selStyle = useMemo(() => makeSelectStyle(theme), [theme]);

  const handleMove = (taskId: string, status: TaskStatus) => {
    if (!permissions.canChangeStatus) {
      toast('No permission to change status', COLOR_DANGER, '\u{1F512}');
      return;
    }
    moveTask(taskId, status);
    toast(`Task moved to ${STATUS_LABELS[status]}`, STATUS_COLORS[status], '\u{1F504}');
    logAction(`Moved task to ${STATUS_LABELS[status]}`, currentUser.name, STATUS_COLORS[status]);
  };

  const handleCreated = (task: Task) => {
    addTask(task);
    toast(`Task created: ${task.title}`, PRIMARY_COLOR, '\u2705');
    logAction(`Created task: ${task.title}`, currentUser.name, PRIMARY_COLOR);
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
                background: view === v ? PRIMARY_COLOR : theme.bgMuted,
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
        <select aria-label="Filter by channel" value={filterChannel} onChange={(e) => setFilterChannel(e.target.value)} style={selStyle}>
          <option value="all">All Channels</option>
          {CHANNELS.map((ch, i) => (
            <option key={i} value={String(i)}>{ch.icon} {ch.name}</option>
          ))}
        </select>
        <select aria-label="Filter by priority" value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)} style={selStyle}>
          <option value="all">All Priorities</option>
          {Object.entries(PRIORITIES).map(([k, v]) => (
            <option key={k} value={k}>{v.icon} {v.label}</option>
          ))}
        </select>
        <select aria-label="Filter by task type" value={filterType} onChange={(e) => setFilterType(e.target.value)} style={selStyle}>
          <option value="all">All Types</option>
          {TASK_TYPES.map((t) => (
            <option key={t.key} value={t.key}>{t.icon} {t.label}</option>
          ))}
        </select>
        {clients.length > 0 && (
          <select aria-label="Filter by client" value={filterClient} onChange={(e) => setFilterClient(e.target.value)} style={selStyle}>
            <option value="all">All Clients</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}
        <div style={{ flex: 1 }} />
        {permissions.canCreate && (
          <button
            onClick={() => setCreateOpen(true)}
            style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: PRIMARY_COLOR, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
          >
            + New Task
          </button>
        )}
      </div>

      {/* Kanban View */}
      {view === 'kanban' ? (
        <div className="kanban-grid" style={{ display: 'grid', gridTemplateColumns: `repeat(${STATUS_FLOW.length}, minmax(200px, 1fr))`, gap: 14, alignItems: 'start', overflowX: 'auto', paddingBottom: 8 }}>
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
                  {colTasks.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '24px 12px', color: theme.textFaint, fontSize: 12 }}>No tasks</div>
                  ) : (
                    colTasks.map((task) => (
                      <TaskCard key={task.id} task={task} theme={theme} dark={dark} onClick={() => setSelectedTaskId(task.id)} />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* List View */
        <div style={{ background: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 10, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${theme.borderLight}` }}>
                {['Task', 'Status', 'Priority', 'Channel', 'Assignee', 'Due'].map((h) => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '.04em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 40, color: theme.textFaint, fontSize: 13 }}>No tasks match the current filters.</td>
                </tr>
              )}
              {filtered.map((task) => {
                const user = safeUser(USERS, task.assignee);
                const days = daysUntil(task.due);
                const badge = getUrgencyBadge(days, dark);
                const pri = PRIORITIES[task.priority];
                return (
                  <tr key={task.id} onClick={() => setSelectedTaskId(task.id)} style={{ borderBottom: `1px solid ${theme.borderLight}`, cursor: 'pointer' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 600, color: theme.text }}>{task.title}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <PillBadge label={STATUS_LABELS[task.status]} color={STATUS_COLORS[task.status]} bold />
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ fontSize: 11, color: pri.color, fontWeight: 600 }}>{pri.icon} {pri.label}</span>
                    </td>
                    <td style={{ padding: '10px 14px' }}><ChannelBadge channel={safeChannel(CHANNELS, task.channel)} /></td>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Avatar user={user} size={20} />
                        <span style={{ color: theme.textMuted }}>{user.name.split(' ')[0]}</span>
                      </div>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <PillBadge label={badge.text} color={badge.fg} bold bg={badge.bg} fg={badge.fg} style={{ padding: '2px 6px' }} />
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
        onDeleted={() => {
          toast('Task deleted', COLOR_DANGER, '\u{1F5D1}');
          logAction('Deleted a task', currentUser.name, COLOR_DANGER);
          setSelectedTaskId(null);
        }}
        onUpdated={(t) => {
          toast(`Task updated: ${t.title}`, PRIMARY_COLOR, '\u270E');
          logAction(`Updated task: ${t.title}`, currentUser.name, PRIMARY_COLOR);
        }}
        onError={(msg) => toast(msg, COLOR_DANGER, '\u26A0\uFE0F')}
        permissions={permissions}
        theme={theme}
        dark={dark}
      />

      <CreateTaskModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={handleCreated}
        onError={(msg) => toast(msg, COLOR_DANGER, '\u26A0\uFE0F')}
        theme={theme}
        selectStyle={selStyle}
      />
    </div>
  );
}
