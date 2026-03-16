import { useState, useMemo, useRef, useEffect, type CSSProperties } from 'react';
import { CHANNELS, USERS, PRIORITIES, TASK_TYPES } from '../../constants';
import { Modal } from '../ui/Modal';
import { nextTaskId } from '../../utils/ids';
import { useStore } from '../../store/store';
import type { Task, Theme, Priority, ChannelScope } from '../../types';
import { PRIMARY_COLOR } from '../../constants/config';

const PRIORITY_KEYS: Priority[] = ['critical', 'high', 'medium', 'low'];

interface CreateTaskModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (task: Task) => void;
  onError?: (msg: string) => void;
  theme: Theme;
  selectStyle: CSSProperties;
}

export function CreateTaskModal({ open, onClose, onCreated, onError, theme, selectStyle }: CreateTaskModalProps) {
  const clients = useStore((s) => s.clients);

  const [title, setTitle] = useState('');
  const [channel, setChannel] = useState(0);
  const [priority, setPriority] = useState<Priority>('medium');
  const [type, setType] = useState('schedule_change');
  const [assignee, setAssignee] = useState(0);
  const [due, setDue] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  });
  const [subtasks, setSubtasks] = useState<string[]>([]);
  const [subtaskText, setSubtaskText] = useState('');

  // Client + channel scope state
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([]);
  const [channelScopeType, setChannelScopeType] = useState<'all' | 'selected'>('all');
  const [selectedChannelIds, setSelectedChannelIds] = useState<string[]>([]);

  // Client dropdown state
  const [clientDropOpen, setClientDropOpen] = useState(false);
  const [clientSearch, setClientSearch] = useState('');
  const clientDropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!clientDropOpen) return;
    const handler = (e: MouseEvent) => {
      if (clientDropRef.current && !clientDropRef.current.contains(e.target as Node)) {
        setClientDropOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [clientDropOpen]);

  const resetClientState = () => {
    setSelectedClientIds([]);
    setChannelScopeType('all');
    setSelectedChannelIds([]);
    setClientDropOpen(false);
    setClientSearch('');
  };

  const hasClients = clients.length > 0;
  const clientsSelected = selectedClientIds.length > 0;

  const filteredClients = useMemo(
    () => clients.filter((c) => c.name.toLowerCase().includes(clientSearch.toLowerCase())),
    [clients, clientSearch],
  );

  const selectedClientsData = useMemo(
    () => clients.filter((c) => selectedClientIds.includes(c.id)),
    [clients, selectedClientIds],
  );

  const allScopedChannels = useMemo(
    () => selectedClientsData.flatMap((c) => (c.channels || []).map((ch) => ({ ...ch, clientId: c.id, clientName: c.name, clientColor: c.color }))),
    [selectedClientsData],
  );

  const toggleClient = (id: string) => {
    if (selectedClientIds.includes(id)) {
      setSelectedClientIds(selectedClientIds.filter((c) => c !== id));
    } else {
      setSelectedClientIds([...selectedClientIds, id]);
    }
  };

  const removeClient = (id: string) => {
    setSelectedClientIds(selectedClientIds.filter((c) => c !== id));
  };

  const toggleChannel = (id: string) => {
    if (selectedChannelIds.includes(id)) {
      setSelectedChannelIds(selectedChannelIds.filter((c) => c !== id));
    } else {
      setSelectedChannelIds([...selectedChannelIds, id]);
    }
  };

  const handleCreate = () => {
    if (!title.trim() || title.length > 200) { onError?.('Please enter a title (max 200 chars)'); return; }
    if (!clientsSelected && (channel < 0 || channel >= CHANNELS.length)) return;
    if (assignee < 0 || assignee >= USERS.length) return;
    if (!due) { onError?.('Please select a due date'); return; }

    let channelScope: ChannelScope | undefined;
    if (clientsSelected) {
      channelScope = channelScopeType === 'all'
        ? { type: 'all' }
        : { type: 'selected', channelIds: selectedChannelIds };
    }

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
      ...(clientsSelected && { clientIds: selectedClientIds, channelScope }),
    };
    onCreated(task);
    setTitle('');
    setSubtasks([]);
    setSubtaskText('');
    resetClientState();
  };

  const inputStyle: CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 8, border: `1px solid ${theme.borderInput}`, background: theme.bgInput, color: theme.text, fontSize: 13, outline: 'none', boxSizing: 'border-box' };
  const labelStyle: CSSProperties = { fontSize: 12, fontWeight: 600, color: theme.textMuted, display: 'block', marginBottom: 4 };

  return (
    <Modal open={open} onClose={() => { onClose(); resetClientState(); }} title={'\u2705 New Task'} theme={theme} width={520}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={labelStyle}>Title</label>
          <input
            aria-label="Task title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Clear rights for show X"
            style={inputStyle}
          />
        </div>

        {/* Client multi-select */}
        {hasClients && (
          <div>
            <label style={labelStyle}>Clients</label>
            <div ref={clientDropRef} style={{ position: 'relative' }}>
              <div
                onClick={() => setClientDropOpen((o) => !o)}
                style={{
                  minHeight: 38,
                  padding: '5px 10px',
                  borderRadius: 8,
                  border: `1px solid ${clientDropOpen ? PRIMARY_COLOR : theme.borderInput}`,
                  background: theme.bgInput,
                  cursor: 'pointer',
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 4,
                  alignItems: 'center',
                }}
              >
                {selectedClientIds.length === 0 ? (
                  <span style={{ fontSize: 12, color: theme.textFaint }}>No clients selected (optional)</span>
                ) : (
                  selectedClientsData.map((c) => (
                    <span
                      key={c.id}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '2px 6px',
                        borderRadius: 10,
                        background: c.color + '22',
                        border: `1px solid ${c.color}55`,
                        fontSize: 11,
                        color: theme.text,
                      }}
                    >
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: c.color, flexShrink: 0 }} />
                      {c.name}
                      <span
                        onClick={(e) => { e.stopPropagation(); removeClient(c.id); }}
                        style={{ cursor: 'pointer', color: theme.textFaint, fontSize: 12, lineHeight: 1, marginLeft: 2 }}
                      >
                        ×
                      </span>
                    </span>
                  ))
                )}
                <span style={{ marginLeft: 'auto', color: theme.textFaint, fontSize: 11 }}>{clientDropOpen ? '▲' : '▼'}</span>
              </div>

              {clientDropOpen && (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    zIndex: 50,
                    marginTop: 4,
                    borderRadius: 8,
                    border: `1px solid ${theme.border}`,
                    background: theme.bgCard,
                    boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
                    overflow: 'hidden',
                  }}
                >
                  <div style={{ padding: '8px 10px', borderBottom: `1px solid ${theme.borderLight}` }}>
                    <input
                      value={clientSearch}
                      onChange={(e) => setClientSearch(e.target.value)}
                      placeholder="Search clients..."
                      autoFocus
                      style={{ ...inputStyle, padding: '6px 10px', fontSize: 12 }}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                  <div style={{ maxHeight: 180, overflowY: 'auto' }}>
                    {filteredClients.length === 0 ? (
                      <div style={{ padding: '10px 12px', fontSize: 12, color: theme.textFaint }}>No clients found</div>
                    ) : (
                      filteredClients.map((c) => (
                        <label
                          key={c.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            padding: '8px 12px',
                            cursor: 'pointer',
                            background: selectedClientIds.includes(c.id) ? PRIMARY_COLOR + '12' : 'transparent',
                            fontSize: 12,
                            color: theme.text,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={selectedClientIds.includes(c.id)}
                            onChange={() => toggleClient(c.id)}
                            style={{ accentColor: PRIMARY_COLOR, width: 13, height: 13 }}
                          />
                          <span style={{ width: 9, height: 9, borderRadius: '50%', background: c.color, flexShrink: 0 }} />
                          <span style={{ flex: 1 }}>{c.name}</span>
                          <span style={{ fontSize: 10, color: theme.textFaint }}>{(c.channels || []).length} ch</span>
                        </label>
                      ))
                    )}
                  </div>
                  <div style={{ padding: '6px 12px', borderTop: `1px solid ${theme.borderLight}`, textAlign: 'right' }}>
                    <button
                      onClick={() => setClientDropOpen(false)}
                      style={{ background: 'none', border: 'none', fontSize: 11, color: PRIMARY_COLOR, cursor: 'pointer', fontWeight: 600, padding: 0 }}
                    >
                      Done
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>{clientsSelected ? 'Channels' : 'Category'}</label>
            {!clientsSelected ? (
              <select aria-label="Category" value={channel} onChange={(e) => setChannel(Number(e.target.value))} style={{ ...selectStyle, width: '100%', padding: '10px 12px' }}>
                {CHANNELS.map((ch, i) => (
                  <option key={i} value={i}>{ch.icon} {ch.name}</option>
                ))}
              </select>
            ) : (
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  type="button"
                  onClick={() => setChannelScopeType('all')}
                  style={{
                    flex: 1,
                    padding: '8px 6px',
                    borderRadius: 6,
                    border: `1px solid ${channelScopeType === 'all' ? PRIMARY_COLOR : theme.border}`,
                    background: channelScopeType === 'all' ? PRIMARY_COLOR + '18' : 'transparent',
                    color: channelScopeType === 'all' ? PRIMARY_COLOR : theme.textMuted,
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  All Channels
                </button>
                <button
                  type="button"
                  onClick={() => setChannelScopeType('selected')}
                  style={{
                    flex: 1,
                    padding: '8px 6px',
                    borderRadius: 6,
                    border: `1px solid ${channelScopeType === 'selected' ? PRIMARY_COLOR : theme.border}`,
                    background: channelScopeType === 'selected' ? PRIMARY_COLOR + '18' : 'transparent',
                    color: channelScopeType === 'selected' ? PRIMARY_COLOR : theme.textMuted,
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
            <label style={labelStyle}>Priority</label>
            <select aria-label="Priority" value={priority} onChange={(e) => { const v = e.target.value; if (PRIORITY_KEYS.includes(v as Priority)) setPriority(v as Priority); }} style={{ ...selectStyle, width: '100%', padding: '10px 12px' }}>
              {PRIORITY_KEYS.map((k) => (
                <option key={k} value={k}>{PRIORITIES[k].icon} {PRIORITIES[k].label}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Type</label>
            <select aria-label="Task type" value={type} onChange={(e) => setType(e.target.value)} style={{ ...selectStyle, width: '100%', padding: '10px 12px' }}>
              {TASK_TYPES.map((t) => (
                <option key={t.key} value={t.key}>{t.icon} {t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Assignee</label>
            <select aria-label="Assignee" value={assignee} onChange={(e) => setAssignee(Number(e.target.value))} style={{ ...selectStyle, width: '100%', padding: '10px 12px' }}>
              {USERS.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Channel picker when clients selected and scope = 'selected' */}
        {clientsSelected && channelScopeType === 'selected' && (
          <div>
            <label style={labelStyle}>Select Channels</label>
            <div style={{ maxHeight: 180, overflowY: 'auto', borderRadius: 8, border: `1px solid ${theme.borderLight}`, background: theme.bgMuted }}>
              {selectedClientsData.map((client) => {
                const clientChannels = client.channels || [];
                if (clientChannels.length === 0) return null;
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
                    {clientChannels.map((ch) => (
                      <label
                        key={ch.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '6px 12px 6px 18px',
                          cursor: 'pointer',
                          background: selectedChannelIds.includes(ch.id) ? PRIMARY_COLOR + '10' : 'transparent',
                          borderBottom: `1px solid ${theme.borderLight}`,
                          fontSize: 12,
                          color: theme.text,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selectedChannelIds.includes(ch.id)}
                          onChange={() => toggleChannel(ch.id)}
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
              {allScopedChannels.length === 0 && (
                <div style={{ padding: '12px', fontSize: 12, color: theme.textFaint, textAlign: 'center' }}>No channels available</div>
              )}
            </div>
            <div style={{ fontSize: 11, color: theme.textFaint, marginTop: 4 }}>
              {selectedChannelIds.length} of {allScopedChannels.length} channels selected
            </div>
          </div>
        )}

        <div>
          <label style={labelStyle}>Due Date</label>
          <input
            aria-label="Due date"
            type="date"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            style={inputStyle}
          />
        </div>

        <div>
          <label style={labelStyle}>Subtasks</label>
          {subtasks.map((sub, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: theme.textMuted, flex: 1, padding: '6px 8px', borderRadius: 6, background: theme.bgMuted }}>{sub}</span>
              <button
                onClick={() => setSubtasks(subtasks.filter((_, j) => j !== i))}
                aria-label="Remove subtask"
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
          style={{ padding: '10px 16px', borderRadius: 8, border: 'none', background: PRIMARY_COLOR, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', marginTop: 6 }}
        >
          Create Task
        </button>
      </div>
    </Modal>
  );
}
