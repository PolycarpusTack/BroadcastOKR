import { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { inputStyle, labelStyle, buttonStyle } from '../../styles/formStyles';
import {
  PRIMARY_COLOR,
  COLOR_DANGER,
  FONT_BODY,
} from '../../constants/config';
import type { Team, User, Client, Theme } from '../../types';

const PRESET_COLORS = [
  '#3805E3',
  '#2DD4BF',
  '#F59E0B',
  '#F87171',
  '#6366F1',
  '#EC4899',
  '#10B981',
  '#F97316',
  '#8B5CF6',
  '#06B6D4',
];

export interface TeamModalProps {
  open: boolean;
  onClose: () => void;
  theme: Theme;
  team?: Team;
  users: User[];
  clients: Client[];
  onSave: (team: Team) => void;
  onDelete?: (id: string) => void;
}

export function TeamModal({
  open,
  onClose,
  theme,
  team,
  users,
  clients,
  onSave,
  onDelete,
}: TeamModalProps) {
  const isEdit = !!team;

  const [name, setName] = useState('');
  const [icon, setIcon] = useState('');
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [memberIds, setMemberIds] = useState<number[]>([]);
  const [leadId, setLeadId] = useState<string>('');
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([]);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (!open) return;
    setShowDeleteConfirm(false);
    if (team) {
      setName(team.name);
      setIcon(team.icon ?? '');
      setColor(team.color);
      setMemberIds(team.members ?? []);
      setLeadId(team.leadId != null ? String(team.leadId) : '');
      setSelectedClientIds(team.clientIds ?? []);
    } else {
      setName('');
      setIcon('');
      setColor(PRESET_COLORS[0]);
      setMemberIds([]);
      setLeadId('');
      setSelectedClientIds([]);
    }
  }, [open, team]);

  function toggleMember(userId: number) {
    setMemberIds((prev) => {
      if (prev.includes(userId)) {
        const next = prev.filter((id) => id !== userId);
        // If removed member was lead, clear lead
        if (leadId === String(userId)) setLeadId('');
        return next;
      }
      return [...prev, userId];
    });
  }

  function toggleClient(clientId: string) {
    setSelectedClientIds((prev) =>
      prev.includes(clientId) ? prev.filter((id) => id !== clientId) : [...prev, clientId],
    );
  }

  function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) return;

    const saved: Team = {
      id: team?.id ?? crypto.randomUUID(),
      name: trimmed,
      icon: icon.trim(),
      color,
      members: memberIds,
      leadId: leadId ? Number(leadId) : undefined,
      clientIds: selectedClientIds.length > 0 ? selectedClientIds : undefined,
    };

    onSave(saved);
    onClose();
  }

  function handleDelete() {
    if (!team || !onDelete) return;
    onDelete(team.id);
    onClose();
  }

  const selectedMembers = users.filter((u) => memberIds.includes(u.id));
  const noMembers = memberIds.length === 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit Team' : 'Add Team'}
      theme={theme}
      width={520}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Name */}
        <div>
          <label style={labelStyle(theme)}>Name</label>
          <input
            style={inputStyle(theme)}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Frontend Team"
            autoFocus
          />
        </div>

        {/* Icon */}
        <div>
          <label style={labelStyle(theme)}>Icon</label>
          <input
            style={{ ...inputStyle(theme), maxWidth: 80 }}
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
            placeholder="🏆"
            maxLength={4}
          />
        </div>

        {/* Color */}
        <div>
          <label style={labelStyle(theme)}>Color</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                title={c}
                onClick={() => setColor(c)}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: c,
                  border: color === c ? `3px solid ${theme.text}` : `2px solid transparent`,
                  cursor: 'pointer',
                  outline: color === c ? `2px solid ${c}` : 'none',
                  outlineOffset: 2,
                  flexShrink: 0,
                }}
              />
            ))}
          </div>
        </div>

        {/* Members */}
        <div>
          <label style={labelStyle(theme)}>Members</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
            {users.map((u) => (
              <label
                key={u.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  cursor: 'pointer',
                  fontSize: 12,
                  fontFamily: FONT_BODY,
                  color: theme.text,
                }}
              >
                <input
                  type="checkbox"
                  checked={memberIds.includes(u.id)}
                  onChange={() => toggleMember(u.id)}
                  style={{ accentColor: PRIMARY_COLOR }}
                />
                {/* Avatar */}
                <span
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    background: u.color,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 9,
                    fontWeight: 700,
                    color: '#fff',
                    flexShrink: 0,
                    fontFamily: FONT_BODY,
                  }}
                >
                  {u.av}
                </span>
                {u.name}
              </label>
            ))}
          </div>
        </div>

        {/* Lead */}
        <div>
          <label htmlFor="team-lead-select" style={labelStyle(theme)}>Lead</label>
          <select
            id="team-lead-select"
            aria-label="Lead"
            style={{ ...inputStyle(theme), cursor: noMembers ? 'not-allowed' : 'pointer' }}
            value={leadId}
            onChange={(e) => setLeadId(e.target.value)}
            disabled={noMembers}
          >
            <option value="">No lead</option>
            {selectedMembers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>

        {/* Clients */}
        {clients.length > 0 && (
          <div>
            <label style={labelStyle(theme)}>Clients</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
              {clients.map((client) => (
                <label
                  key={client.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    cursor: 'pointer',
                    fontSize: 12,
                    fontFamily: FONT_BODY,
                    color: theme.text,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedClientIds.includes(client.id)}
                    onChange={() => toggleClient(client.id)}
                    style={{ accentColor: PRIMARY_COLOR }}
                  />
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      background: client.color,
                      flexShrink: 0,
                      display: 'inline-block',
                    }}
                  />
                  {client.name}
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
          <button
            onClick={onClose}
            style={{ ...buttonStyle(theme.bgMuted), color: theme.textSecondary, background: theme.bgMuted }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim()}
            style={buttonStyle(PRIMARY_COLOR, !name.trim())}
          >
            {isEdit ? 'Save Changes' : 'Add Team'}
          </button>
        </div>

        {/* Delete section (edit mode only) */}
        {isEdit && onDelete && (
          <div style={{ borderTop: `1px solid ${theme.borderLight}`, paddingTop: 16 }}>
            {!showDeleteConfirm ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, fontFamily: FONT_BODY, color: theme.textMuted }}>
                  Delete this team
                </span>
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  style={buttonStyle(COLOR_DANGER)}
                >
                  Delete Team
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <p style={{ margin: 0, fontSize: 12, fontFamily: FONT_BODY, color: theme.textSecondary }}>
                  <strong style={{ color: COLOR_DANGER }}>Warning:</strong>{' '}
                  This will remove the team. Members will not be deleted.
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    style={{
                      ...buttonStyle(theme.bgMuted),
                      color: theme.textSecondary,
                      background: theme.bgMuted,
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDelete}
                    style={buttonStyle(COLOR_DANGER)}
                  >
                    Confirm Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
