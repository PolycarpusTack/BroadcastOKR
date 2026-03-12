import { useState } from 'react';
import { CHANNELS, USERS, PRIORITIES, TASK_TYPES } from '../../constants';
import { Modal } from '../ui/Modal';
import { nextTaskId } from '../../utils/ids';
import type { Task, Theme, Priority } from '../../types';

interface SelectStyle {
  padding: string;
  borderRadius: number;
  border: string;
  background: string;
  color: string;
  fontSize: number;
  outline: string;
}

interface CreateTaskModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (task: Task) => void;
  theme: Theme;
  selectStyle: SelectStyle;
}

export function CreateTaskModal({ open, onClose, onCreated, theme, selectStyle }: CreateTaskModalProps) {
  const [title, setTitle] = useState('');
  const [channel, setChannel] = useState(0);
  const [priority, setPriority] = useState<Priority>('medium');
  const [type, setType] = useState('schedule_change');
  const [assignee, setAssignee] = useState(0);
  const [due, setDue] = useState('2026-03-15');
  const [subtasks, setSubtasks] = useState<string[]>([]);
  const [subtaskText, setSubtaskText] = useState('');

  const handleCreate = () => {
    if (!title.trim()) return;
    const task: Task = {
      id: nextTaskId(),
      title: title.trim(),
      status: 'todo',
      priority,
      assignee,
      channel,
      due,
      taskType: type,
      subtasks: subtasks.filter((s) => s.trim()).map((s) => ({ text: s.trim(), done: false })),
    };
    onCreated(task);
    setTitle('');
    setSubtasks([]);
    setSubtaskText('');
  };

  return (
    <Modal open={open} onClose={onClose} title={'\u2705 New Task'} theme={theme} width={520}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: theme.textMuted, display: 'block', marginBottom: 4 }}>Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Clear rights for show X"
            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: `1px solid ${theme.borderInput}`, background: theme.bgInput, color: theme.text, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: theme.textMuted, display: 'block', marginBottom: 4 }}>Channel</label>
            <select value={channel} onChange={(e) => setChannel(Number(e.target.value))} style={{ ...selectStyle, width: '100%', padding: '10px 12px' }}>
              {CHANNELS.map((ch, i) => (
                <option key={i} value={i}>{ch.icon} {ch.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: theme.textMuted, display: 'block', marginBottom: 4 }}>Priority</label>
            <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)} style={{ ...selectStyle, width: '100%', padding: '10px 12px' }}>
              {Object.entries(PRIORITIES).map(([k, v]) => (
                <option key={k} value={k}>{v.icon} {v.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: theme.textMuted, display: 'block', marginBottom: 4 }}>Type</label>
            <select value={type} onChange={(e) => setType(e.target.value)} style={{ ...selectStyle, width: '100%', padding: '10px 12px' }}>
              {TASK_TYPES.map((t) => (
                <option key={t.key} value={t.key}>{t.icon} {t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: theme.textMuted, display: 'block', marginBottom: 4 }}>Assignee</label>
            <select value={assignee} onChange={(e) => setAssignee(Number(e.target.value))} style={{ ...selectStyle, width: '100%', padding: '10px 12px' }}>
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
            value={due}
            onChange={(e) => setDue(e.target.value)}
            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: `1px solid ${theme.borderInput}`, background: theme.bgInput, color: theme.text, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
          />
        </div>

        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: theme.textMuted, display: 'block', marginBottom: 4 }}>Subtasks</label>
          {subtasks.map((sub, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: theme.textMuted, flex: 1, padding: '6px 8px', borderRadius: 6, background: theme.bgMuted }}>{sub}</span>
              <button
                onClick={() => setSubtasks(subtasks.filter((_, j) => j !== i))}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.textFaint, fontSize: 12 }}
              >
                {'\u2715'}
              </button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              value={subtaskText}
              onChange={(e) => setSubtaskText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && subtaskText.trim()) {
                  setSubtasks([...subtasks, subtaskText.trim()]);
                  setSubtaskText('');
                }
              }}
              placeholder="Add subtask and press Enter"
              style={{ flex: 1, padding: '8px 10px', borderRadius: 6, border: `1px solid ${theme.borderInput}`, background: theme.bgInput, color: theme.text, fontSize: 12, outline: 'none', boxSizing: 'border-box' }}
            />
            <button
              onClick={() => {
                if (subtaskText.trim()) {
                  setSubtasks([...subtasks, subtaskText.trim()]);
                  setSubtaskText('');
                }
              }}
              style={{ padding: '6px 10px', borderRadius: 6, border: `1px solid ${theme.border}`, background: 'transparent', color: theme.text, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
            >
              + Add
            </button>
          </div>
        </div>

        <button
          onClick={handleCreate}
          style={{ padding: '10px 16px', borderRadius: 8, border: 'none', background: '#4f46e5', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', marginTop: 6 }}
        >
          Create Task
        </button>
      </div>
    </Modal>
  );
}
