import { useState } from 'react';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useActivityLog } from '../context/ActivityLogContext';
import { useStore } from '../store/store';
import { CHANNELS, USERS, STATUS_FLOW, STATUS_LABELS, STATUS_COLORS, PRIORITIES, TASK_TYPES } from '../constants';
import { ChannelBadge } from '../components/ui/ChannelBadge';
import { Avatar } from '../components/ui/Avatar';
import { Modal } from '../components/ui/Modal';
import { daysUntil, getUrgencyBadge } from '../utils/dates';
import { nextTaskId } from '../utils/ids';
import type { Task, TaskStatus, Priority } from '../types';

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
  const toggleSubtask = useStore((s) => s.toggleSubtask);

  const [view, setView] = useState<'kanban' | 'list'>('kanban');
  const [filterChannel, setFilterChannel] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  // Create form state
  const [newTitle, setNewTitle] = useState('');
  const [newChannel, setNewChannel] = useState(0);
  const [newPriority, setNewPriority] = useState<Priority>('medium');
  const [newType, setNewType] = useState('schedule_change');
  const [newAssignee, setNewAssignee] = useState(0);
  const [newDue, setNewDue] = useState('2026-03-15');

  const filtered = tasks.filter((t) => {
    if (filterChannel !== 'all' && t.channel !== Number(filterChannel)) return false;
    if (filterPriority !== 'all' && t.priority !== filterPriority) return false;
    return true;
  });

  const selectStyle = {
    padding: '6px 10px',
    borderRadius: 8,
    border: `1px solid ${theme.borderInput}`,
    background: theme.bgInput,
    color: theme.text,
    fontSize: 12,
    outline: 'none',
  };

  const handleCreate = () => {
    if (!newTitle.trim()) return;
    const task: Task = {
      id: nextTaskId(),
      title: newTitle.trim(),
      status: 'todo',
      priority: newPriority,
      assignee: newAssignee,
      channel: newChannel,
      due: newDue,
      taskType: newType,
      subtasks: [],
    };
    addTask(task);
    toast(`Task created: ${task.title}`, '#4f46e5', '\u2705');
    logAction(`Created task: ${task.title}`, currentUser.name, '#4f46e5');
    setCreateOpen(false);
    setNewTitle('');
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

  const renderTaskCard = (task: Task) => {
    const user = USERS[task.assignee];
    const days = daysUntil(task.due);
    const badge = getUrgencyBadge(days, dark);
    const pri = PRIORITIES[task.priority];
    const tt = TASK_TYPES.find((t) => t.key === task.taskType);

    return (
      <div
        key={task.id}
        onClick={() => setSelectedTask(task)}
        style={{
          background: theme.bgCard,
          border: `1px solid ${theme.borderLight}`,
          borderRadius: 10,
          padding: '12px 14px',
          cursor: 'pointer',
          borderLeft: `3px solid ${pri.color}`,
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 600, color: theme.text, marginBottom: 8 }}>{task.title}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <ChannelBadge channel={CHANNELS[task.channel]} />
          {tt && <span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: tt.color + '18', color: tt.color }}>{tt.icon} {tt.label}</span>}
          <span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: badge.bg, color: badge.fg, animation: badge.pulse ? 'urgPulse 1.5s infinite' : 'none' }}>{badge.text}</span>
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
                  {colTasks.map(renderTaskCard)}
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
                const user = USERS[task.assignee];
                const days = daysUntil(task.due);
                const badge = getUrgencyBadge(days, dark);
                const pri = PRIORITIES[task.priority];
                return (
                  <tr key={task.id} onClick={() => setSelectedTask(task)} style={{ borderBottom: `1px solid ${theme.borderLight}`, cursor: 'pointer' }}>
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

      {/* Task Detail Modal */}
      <Modal open={!!selectedTask} onClose={() => setSelectedTask(null)} title={selectedTask?.title || ''} theme={theme} width={560}>
        {selectedTask && (() => {
          const user = USERS[selectedTask.assignee];
          const pri = PRIORITIES[selectedTask.priority];
          const tt = TASK_TYPES.find((t) => t.key === selectedTask.taskType);
          const days = daysUntil(selectedTask.due);
          const badge = getUrgencyBadge(days, dark);

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <ChannelBadge channel={CHANNELS[selectedTask.channel]} />
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

              {/* Status move buttons */}
              {permissions.canChangeStatus && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, marginBottom: 6, textTransform: 'uppercase' }}>Move to</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {STATUS_FLOW.filter((s) => s !== selectedTask.status).map((s) => (
                      <button
                        key={s}
                        onClick={() => { handleMove(selectedTask.id, s); setSelectedTask({ ...selectedTask, status: s }); }}
                        style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${STATUS_COLORS[s]}40`, background: STATUS_COLORS[s] + '18', color: STATUS_COLORS[s], fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                      >
                        {STATUS_LABELS[s]}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Subtasks */}
              {selectedTask.subtasks.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, marginBottom: 6, textTransform: 'uppercase' }}>
                    Subtasks ({selectedTask.subtasks.filter((s) => s.done).length}/{selectedTask.subtasks.length})
                  </div>
                  {selectedTask.subtasks.map((sub, si) => (
                    <div
                      key={si}
                      onClick={() => {
                        toggleSubtask(selectedTask.id, si);
                        const updated = { ...selectedTask, subtasks: selectedTask.subtasks.map((s, i) => i === si ? { ...s, done: !s.done } : s) };
                        setSelectedTask(updated);
                      }}
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
        })()}
      </Modal>

      {/* Create Task Modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title={'\u2705 New Task'} theme={theme} width={520}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: theme.textMuted, display: 'block', marginBottom: 4 }}>Title</label>
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="e.g. Clear rights for show X"
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: `1px solid ${theme.borderInput}`, background: theme.bgInput, color: theme.text, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: theme.textMuted, display: 'block', marginBottom: 4 }}>Channel</label>
              <select value={newChannel} onChange={(e) => setNewChannel(Number(e.target.value))} style={{ ...selectStyle, width: '100%', padding: '10px 12px' }}>
                {CHANNELS.map((ch, i) => (
                  <option key={i} value={i}>{ch.icon} {ch.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: theme.textMuted, display: 'block', marginBottom: 4 }}>Priority</label>
              <select value={newPriority} onChange={(e) => setNewPriority(e.target.value as Priority)} style={{ ...selectStyle, width: '100%', padding: '10px 12px' }}>
                {Object.entries(PRIORITIES).map(([k, v]) => (
                  <option key={k} value={k}>{v.icon} {v.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: theme.textMuted, display: 'block', marginBottom: 4 }}>Type</label>
              <select value={newType} onChange={(e) => setNewType(e.target.value)} style={{ ...selectStyle, width: '100%', padding: '10px 12px' }}>
                {TASK_TYPES.map((t) => (
                  <option key={t.key} value={t.key}>{t.icon} {t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: theme.textMuted, display: 'block', marginBottom: 4 }}>Assignee</label>
              <select value={newAssignee} onChange={(e) => setNewAssignee(Number(e.target.value))} style={{ ...selectStyle, width: '100%', padding: '10px 12px' }}>
                {USERS.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: theme.textMuted, display: 'block', marginBottom: 4 }}>Due Date</label>
            <input
              type="date"
              value={newDue}
              onChange={(e) => setNewDue(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: `1px solid ${theme.borderInput}`, background: theme.bgInput, color: theme.text, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
          <button
            onClick={handleCreate}
            style={{ padding: '10px 16px', borderRadius: 8, border: 'none', background: '#4f46e5', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', marginTop: 6 }}
          >
            Create Task
          </button>
        </div>
      </Modal>
    </div>
  );
}
