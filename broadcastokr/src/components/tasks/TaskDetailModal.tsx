import { useState, useMemo } from 'react';
import { CHANNELS, USERS, STATUS_FLOW, STATUS_LABELS, STATUS_COLORS, PRIORITIES, TASK_TYPES } from '../../constants';
import { safeUser, safeChannel } from '../../utils/safeGet';
import { ChannelBadge } from '../ui/ChannelBadge';
import { PillBadge } from '../ui/PillBadge';
import { Avatar } from '../ui/Avatar';
import { Modal } from '../ui/Modal';
import { daysUntil, getUrgencyBadge } from '../../utils/dates';
import { useStore } from '../../store/store';
import type { Task, TaskStatus, Theme, RolePermissions, Priority, ChannelScope, Client } from '../../types';
import { PRIMARY_COLOR, COLOR_SUCCESS, COLOR_DANGER, FONT_MONO, FONT_BODY } from '../../constants/config';

const PRIORITY_KEYS: Priority[] = ['critical', 'high', 'medium', 'low'];

interface TaskDetailModalProps {
  taskId: string | null;
  onClose: () => void;
  onMove: (taskId: string, status: TaskStatus) => void;
  onDeleted?: () => void;
  onUpdated?: (task: Task) => void;
  onError?: (msg: string) => void;
  permissions: RolePermissions;
  theme: Theme;
  dark: boolean;
}

export function TaskDetailModal({ taskId, onClose, onMove, onDeleted, onUpdated, onError, permissions, theme, dark }: TaskDetailModalProps) {
  const task = useStore((s) => taskId ? s.tasks.find((t) => t.id === taskId) ?? null : null);
  const toggleSubtask = useStore((s) => s.toggleSubtask);
  const updateTask = useStore((s) => s.updateTask);
  const deleteTask = useStore((s) => s.deleteTask);
  const clients: Client[] = useStore((s) => s.clients);

  return (
    <Modal open={!!task} onClose={onClose} title={task?.title || ''} theme={theme} width={560}>
      {task && (
        <TaskDetailContent
          task={task}
          clients={clients}
          onMove={onMove}
          toggleSubtask={toggleSubtask}
          updateTask={updateTask}
          deleteTask={deleteTask}
          onDeleted={onDeleted}
          onUpdated={onUpdated}
          onError={onError}
          onClose={onClose}
          permissions={permissions}
          theme={theme}
          dark={dark}
        />
      )}
    </Modal>
  );
}

function TaskDetailContent({ task, clients, onMove, toggleSubtask, updateTask, deleteTask, onDeleted, onUpdated, onError, onClose, permissions, theme, dark }: {
  task: Task;
  clients: Client[];
  onMove: (taskId: string, status: TaskStatus) => void;
  toggleSubtask: (taskId: string, subtaskIndex: number) => void;
  updateTask: (id: string, updates: Partial<Omit<Task, 'id'>>) => void;
  deleteTask: (id: string) => void;
  onDeleted?: () => void;
  onUpdated?: (task: Task) => void;
  onError?: (msg: string) => void;
  onClose: () => void;
  permissions: RolePermissions;
  theme: Theme;
  dark: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Edit form state
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editChannel, setEditChannel] = useState(0);
  const [editPriority, setEditPriority] = useState<Priority>('medium');
  const [editType, setEditType] = useState('');
  const [editAssignee, setEditAssignee] = useState(0);
  const [editDue, setEditDue] = useState('');
  const [editClientIds, setEditClientIds] = useState<string[]>([]);
  const [editChannelScopeType, setEditChannelScopeType] = useState<'all' | 'selected'>('all');
  const [editSelectedChannelIds, setEditSelectedChannelIds] = useState<string[]>([]);

  const startEdit = () => {
    setEditTitle(task.title);
    setEditDescription(task.description || '');
    setEditChannel(task.channel);
    setEditPriority(task.priority);
    setEditType(task.taskType);
    setEditAssignee(task.assignee);
    setEditDue(task.due);
    setEditClientIds(task.clientIds ?? []);
    setEditChannelScopeType(task.channelScope?.type ?? 'all');
    setEditSelectedChannelIds(task.channelScope?.type === 'selected' ? task.channelScope.channelIds : []);
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
  };

  const saveEdit = () => {
    if (!editTitle.trim() || editTitle.length > 200) { onError?.('Please enter a title (max 200 chars)'); return; }
    if (!editDue) { onError?.('Please select a due date'); return; }

    const editClientsSelected = editClientIds.length > 0;
    let channelScope: ChannelScope | undefined;
    if (editClientsSelected) {
      channelScope = editChannelScopeType === 'all'
        ? { type: 'all' }
        : { type: 'selected', channelIds: editSelectedChannelIds };
    }

    const updates: Partial<Omit<Task, 'id'>> = {
      title: editTitle.trim(),
      description: editDescription.trim() || undefined,
      channel: editChannel,
      priority: editPriority,
      taskType: editType,
      assignee: editAssignee,
      due: editDue,
      ...(editClientsSelected
        ? { clientIds: editClientIds, channelScope }
        : { clientIds: undefined, channelScope: undefined }),
    };
    updateTask(task.id, updates);
    onUpdated?.({ ...task, ...updates });
    setEditing(false);
  };

  const handleDelete = () => {
    deleteTask(task.id);
    onDeleted?.();
    onClose();
  };

  const user = safeUser(USERS, task.assignee);
  const pri = PRIORITIES[task.priority];
  const tt = TASK_TYPES.find((t) => t.key === task.taskType);
  const days = daysUntil(task.due);
  const badge = getUrgencyBadge(days, dark);

  const labelStyle = { fontFamily: FONT_MONO as string, fontSize: '10.5px', fontWeight: 700 as const, color: theme.textMuted, marginBottom: 4, textTransform: 'uppercase' as const, letterSpacing: '0.05em' };
  const inputStyle = { width: '100%', padding: '8px 12px', borderRadius: 6, border: `1px solid ${theme.borderInput}`, background: theme.bgInput, color: theme.text, fontSize: 13, outline: 'none', boxSizing: 'border-box' as const };
  const selectStyle = { ...inputStyle, fontSize: '12.5px', fontFamily: FONT_BODY };

  // Derived data for edit form
  const editSelectedClientsData = useMemo(
    () => clients.filter((c) => editClientIds.includes(c.id)),
    [clients, editClientIds],
  );

  const editAllScopedChannels = useMemo(
    () => editSelectedClientsData.flatMap((c) => (c.channels || []).map((ch) => ({ ...ch, clientId: c.id, clientName: c.name, clientColor: c.color }))),
    [editSelectedClientsData],
  );

  const toggleEditClient = (id: string) => {
    if (editClientIds.includes(id)) {
      setEditClientIds(editClientIds.filter((c) => c !== id));
    } else {
      setEditClientIds([...editClientIds, id]);
    }
  };

  const toggleEditChannel = (id: string) => {
    if (editSelectedChannelIds.includes(id)) {
      setEditSelectedChannelIds(editSelectedChannelIds.filter((c) => c !== id));
    } else {
      setEditSelectedChannelIds([...editSelectedChannelIds, id]);
    }
  };

  // Read-only view derived data
  const taskClientsData = useMemo(
    () => clients.filter((c) => task.clientIds?.includes(c.id)),
    [clients, task.clientIds],
  );

  const hasClients = clients.length > 0;
  const editClientsSelected = editClientIds.length > 0;

  if (editing) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <div style={labelStyle}>Title</div>
          <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <div style={labelStyle}>Description</div>
          <textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} rows={3} placeholder="Add a description..." style={{ ...inputStyle, resize: 'vertical' }} />
        </div>

        {/* Client multi-select in edit mode */}
        {hasClients && (
          <div>
            <div style={labelStyle}>Clients</div>
            <div style={{
              maxHeight: 160,
              overflowY: 'auto',
              borderRadius: 8,
              border: `1px solid ${theme.borderLight}`,
              background: theme.bgMuted,
            }}>
              {clients.map((c) => (
                <label
                  key={c.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '7px 12px',
                    cursor: 'pointer',
                    background: editClientIds.includes(c.id) ? PRIMARY_COLOR + '12' : 'transparent',
                    borderBottom: `1px solid ${theme.borderLight}`,
                    fontSize: 12,
                    color: theme.text,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={editClientIds.includes(c.id)}
                    onChange={() => toggleEditClient(c.id)}
                    style={{ accentColor: PRIMARY_COLOR, width: 13, height: 13 }}
                  />
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: c.color, flexShrink: 0 }} />
                  <span style={{ flex: 1 }}>{c.name}</span>
                  <span style={{ fontSize: 10, color: theme.textFaint }}>{(c.channels || []).length} ch</span>
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <div style={labelStyle}>{editClientsSelected ? 'Channels' : 'Category'}</div>
            {!editClientsSelected ? (
              <select value={editChannel} onChange={(e) => setEditChannel(Number(e.target.value))} style={selectStyle}>
                {CHANNELS.map((ch, i) => <option key={i} value={i}>{ch.icon} {ch.name}</option>)}
              </select>
            ) : (
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  type="button"
                  onClick={() => setEditChannelScopeType('all')}
                  style={{
                    flex: 1,
                    padding: '7px 6px',
                    borderRadius: 6,
                    border: `1px solid ${editChannelScopeType === 'all' ? PRIMARY_COLOR : theme.border}`,
                    background: editChannelScopeType === 'all' ? PRIMARY_COLOR + '18' : 'transparent',
                    color: editChannelScopeType === 'all' ? PRIMARY_COLOR : theme.textMuted,
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  All Channels
                </button>
                <button
                  type="button"
                  onClick={() => setEditChannelScopeType('selected')}
                  style={{
                    flex: 1,
                    padding: '7px 6px',
                    borderRadius: 6,
                    border: `1px solid ${editChannelScopeType === 'selected' ? PRIMARY_COLOR : theme.border}`,
                    background: editChannelScopeType === 'selected' ? PRIMARY_COLOR + '18' : 'transparent',
                    color: editChannelScopeType === 'selected' ? PRIMARY_COLOR : theme.textMuted,
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Select
                </button>
              </div>
            )}
          </div>
          <div>
            <div style={labelStyle}>Priority</div>
            <select value={editPriority} onChange={(e) => { const v = e.target.value; if (PRIORITY_KEYS.includes(v as Priority)) setEditPriority(v as Priority); }} style={selectStyle}>
              {PRIORITY_KEYS.map((k) => <option key={k} value={k}>{PRIORITIES[k].icon} {PRIORITIES[k].label}</option>)}
            </select>
          </div>
          <div>
            <div style={labelStyle}>Type</div>
            <select value={editType} onChange={(e) => setEditType(e.target.value)} style={selectStyle}>
              {TASK_TYPES.map((t) => <option key={t.key} value={t.key}>{t.icon} {t.label}</option>)}
            </select>
          </div>
          <div>
            <div style={labelStyle}>Assignee</div>
            <select value={editAssignee} onChange={(e) => setEditAssignee(Number(e.target.value))} style={selectStyle}>
              {USERS.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
        </div>

        {/* Channel picker when editing with clients selected and scope = 'selected' */}
        {editClientsSelected && editChannelScopeType === 'selected' && (
          <div>
            <div style={labelStyle}>Select Channels</div>
            <div style={{ maxHeight: 160, overflowY: 'auto', borderRadius: 8, border: `1px solid ${theme.borderLight}`, background: theme.bgMuted }}>
              {editSelectedClientsData.map((client) => {
                if ((client.channels || []).length === 0) return null;
                return (
                  <div key={client.id}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '5px 10px',
                      background: theme.bgInput,
                      borderBottom: `1px solid ${theme.borderLight}`,
                      fontSize: 11,
                      fontWeight: 700,
                      color: theme.textMuted,
                    }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: client.color, flexShrink: 0 }} />
                      {client.name}
                    </div>
                    {(client.channels || []).map((ch) => (
                      <label
                        key={ch.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '6px 12px 6px 18px',
                          cursor: 'pointer',
                          background: editSelectedChannelIds.includes(ch.id) ? PRIMARY_COLOR + '10' : 'transparent',
                          borderBottom: `1px solid ${theme.borderLight}`,
                          fontSize: 12,
                          color: theme.text,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={editSelectedChannelIds.includes(ch.id)}
                          onChange={() => toggleEditChannel(ch.id)}
                          style={{ accentColor: PRIMARY_COLOR, width: 13, height: 13 }}
                        />
                        <span style={{
                          width: 7, height: 7, borderRadius: '50%',
                          background: ch.color ?? client.color,
                          flexShrink: 0,
                        }} />
                        <span style={{ flex: 1 }}>{ch.name}</span>
                        {ch.channelKind && (
                          <span style={{ fontSize: 10, color: theme.textFaint }}>{ch.channelKind}</span>
                        )}
                      </label>
                    ))}
                  </div>
                );
              })}
              {editAllScopedChannels.length === 0 && (
                <div style={{ padding: '10px', fontSize: 12, color: theme.textFaint, textAlign: 'center' }}>No channels available</div>
              )}
            </div>
            <div style={{ fontSize: 11, color: theme.textFaint, marginTop: 4 }}>
              {editSelectedChannelIds.length} of {editAllScopedChannels.length} selected
            </div>
          </div>
        )}

        <div>
          <div style={labelStyle}>Due Date</div>
          <input type="date" value={editDue} onChange={(e) => setEditDue(e.target.value)} style={inputStyle} />
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button onClick={saveEdit} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: PRIMARY_COLOR, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', flex: 1 }}>Save</button>
          <button onClick={cancelEdit} style={{ padding: '8px 16px', borderRadius: 8, border: `1px solid ${theme.border}`, background: 'transparent', color: theme.text, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Badges row */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        {/* Channel display: client scope if present, legacy badge otherwise */}
        {task.clientIds && task.clientIds.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
            {taskClientsData.map((c) => (
              <span
                key={c.id}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '2px 7px',
                  borderRadius: 10,
                  background: c.color + '22',
                  border: `1px solid ${c.color}55`,
                  fontSize: 11,
                  color: theme.text,
                }}
              >
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: c.color, flexShrink: 0 }} />
                {c.name}
              </span>
            ))}
            {task.channelScope && (
              <span style={{ fontSize: 11, color: theme.textMuted, padding: '2px 6px', borderRadius: 8, background: theme.bgMuted, border: `1px solid ${theme.borderLight}` }}>
                {task.channelScope.type === 'all'
                  ? 'All Channels'
                  : `${task.channelScope.channelIds.length} channel${task.channelScope.channelIds.length !== 1 ? 's' : ''}`}
              </span>
            )}
          </div>
        ) : (
          <ChannelBadge channel={safeChannel(CHANNELS, task.channel)} />
        )}
        {tt && <PillBadge label={tt.label} color={tt.color} icon={tt.icon} bg={tt.color + '18'} />}
        <PillBadge label={pri.label} color={pri.color} icon={pri.icon} bg={pri.color + '18'} />
        <PillBadge label={badge.text} color={badge.fg} bold bg={badge.bg} fg={badge.fg} />
        {permissions.canEdit && (
          <button onClick={startEdit} style={{ marginLeft: 'auto', padding: '4px 12px', borderRadius: 6, border: `1px solid ${theme.border}`, background: 'transparent', color: theme.textSecondary, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
            {'\u270E'} Edit
          </button>
        )}
      </div>

      {/* Description */}
      <div>
        <div style={labelStyle}>Description</div>
        <p style={{ fontSize: 13, color: task.description ? theme.text : theme.textFaint, margin: 0, lineHeight: 1.5 }}>
          {task.description || 'No description'}
        </p>
      </div>

      {/* Assignee */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Avatar user={user} size={28} />
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>{user.name}</div>
          <div style={{ fontSize: 11, color: theme.textFaint }}>{user.title}</div>
        </div>
      </div>

      {/* Status move */}
      {permissions.canChangeStatus && (
        <div>
          <div style={labelStyle}>Move to</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {STATUS_FLOW.filter((s) => s !== task.status).map((s) => (
              <button
                key={s}
                onClick={() => onMove(task.id, s)}
                style={{ padding: '4px 10px', borderRadius: 12, border: `1px solid ${STATUS_COLORS[s]}4D`, background: STATUS_COLORS[s] + '18', color: STATUS_COLORS[s], fontSize: '10.5px', fontWeight: 600, fontFamily: FONT_MONO, cursor: 'pointer' }}
              >
                {STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Subtasks */}
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
              <div style={{ width: 16, height: 16, borderRadius: 4, border: `2px solid ${sub.done ? COLOR_SUCCESS : theme.border}`, background: sub.done ? COLOR_SUCCESS : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#fff', flexShrink: 0 }}>
                {sub.done && '\u2713'}
              </div>
              <span style={{ fontSize: 12, color: sub.done ? theme.textFaint : theme.text, textDecoration: sub.done ? 'line-through' : 'none' }}>{sub.text}</span>
            </div>
          ))}
        </div>
      )}

      {/* Delete */}
      {permissions.canDelete && (
        <div style={{ borderTop: `1px solid ${theme.borderLight}`, paddingTop: 12 }}>
          {!confirmDelete ? (
            <button onClick={() => setConfirmDelete(true)} style={{ padding: '6px 14px', borderRadius: 6, border: `1px solid ${COLOR_DANGER}4D`, background: `${COLOR_DANGER}18`, color: COLOR_DANGER, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
              Delete Task
            </button>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: COLOR_DANGER, fontWeight: 600 }}>Delete this task?</span>
              <button onClick={handleDelete} style={{ padding: '4px 12px', borderRadius: 6, border: 'none', background: COLOR_DANGER, color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Confirm</button>
              <button onClick={() => setConfirmDelete(false)} style={{ padding: '4px 12px', borderRadius: 6, border: `1px solid ${theme.border}`, background: 'transparent', color: theme.text, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
