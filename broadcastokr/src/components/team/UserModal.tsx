import { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { inputStyle, labelStyle, buttonStyle } from '../../styles/formStyles';
import {
  PRIMARY_COLOR,
  COLOR_DANGER,
  FONT_BODY,
} from '../../constants/config';
import type { User, Client, Theme } from '../../types';

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

function deriveInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase())
    .join('')
    .slice(0, 3);
}

export interface UserModalProps {
  open: boolean;
  onClose: () => void;
  theme: Theme;
  user?: User;
  clients: Client[];
  onSave: (user: User) => void;
  onDelete?: (id: number, reassignTo: number | null) => void;
  users: User[];
  taskCount: number;
  goalCount: number;
  teamLeadCount: number;
}

export function UserModal({
  open,
  onClose,
  theme,
  user,
  clients,
  onSave,
  onDelete,
  users,
  taskCount,
  goalCount,
  teamLeadCount,
}: UserModalProps) {
  const isEdit = !!user;

  const [name, setName] = useState('');
  const [initials, setInitials] = useState('');
  const [initialsManual, setInitialsManual] = useState(false);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<User['role']>('member');
  const [dept, setDept] = useState('');
  const [title, setTitle] = useState('');
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [avatarUrl, setAvatarUrl] = useState('');
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([]);
  const [skillsRaw, setSkillsRaw] = useState('');

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [reassignTo, setReassignTo] = useState<string>('');

  useEffect(() => {
    if (!open) return;
    setShowDeleteConfirm(false);
    setReassignTo('');
    if (user) {
      setName(user.name);
      setInitials(user.av);
      setInitialsManual(true);
      setEmail(user.email ?? '');
      setPhone(user.phone ?? '');
      setRole(user.role);
      setDept(user.dept);
      setTitle(user.title);
      setColor(user.color);
      setAvatarUrl(user.avatarUrl ?? '');
      setSelectedClientIds(user.clientIds ?? []);
      setSkillsRaw((user.skills ?? []).join(', '));
    } else {
      setName('');
      setInitials('');
      setInitialsManual(false);
      setEmail('');
      setPhone('');
      setRole('member');
      setDept('');
      setTitle('');
      setColor(PRESET_COLORS[0]);
      setAvatarUrl('');
      setSelectedClientIds([]);
      setSkillsRaw('');
    }
  }, [open, user]);

  function handleNameChange(value: string) {
    setName(value);
    if (!initialsManual) {
      setInitials(deriveInitials(value));
    }
  }

  function handleInitialsChange(value: string) {
    setInitials(value.toUpperCase().slice(0, 3));
    setInitialsManual(true);
  }

  function toggleClient(clientId: string) {
    setSelectedClientIds((prev) =>
      prev.includes(clientId) ? prev.filter((id) => id !== clientId) : [...prev, clientId],
    );
  }

  function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) return;

    const skills = skillsRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const saved: User = {
      id: user?.id ?? 0,
      name: trimmed,
      av: initials || deriveInitials(trimmed),
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      role,
      dept: dept.trim(),
      title: title.trim(),
      color,
      avatarUrl: avatarUrl.trim() || undefined,
      clientIds: selectedClientIds.length > 0 ? selectedClientIds : undefined,
      skills: skills.length > 0 ? skills : undefined,
    };

    onSave(saved);
    onClose();
  }

  function handleDelete() {
    if (!user || !onDelete) return;
    const reassignId = reassignTo ? Number(reassignTo) : null;
    onDelete(user.id, reassignId);
    onClose();
  }

  const otherUsers = users.filter((u) => u.id !== user?.id);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit Member' : 'Add Member'}
      theme={theme}
      width={560}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Name */}
        <div>
          <label style={labelStyle(theme)}>Name</label>
          <input
            style={inputStyle(theme)}
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="e.g. Jane Smith"
            autoFocus
          />
        </div>

        {/* Initials */}
        <div>
          <label style={labelStyle(theme)}>Initials</label>
          <input
            style={{ ...inputStyle(theme), maxWidth: 80 }}
            value={initials}
            onChange={(e) => handleInitialsChange(e.target.value)}
            placeholder="JS"
            maxLength={3}
          />
        </div>

        {/* Email */}
        <div>
          <label style={labelStyle(theme)}>Email</label>
          <input
            style={inputStyle(theme)}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="jane.smith@example.com"
            type="email"
          />
        </div>

        {/* Phone */}
        <div>
          <label style={labelStyle(theme)}>Phone</label>
          <input
            style={inputStyle(theme)}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+32 xxx xx xx xx"
            type="tel"
          />
        </div>

        {/* Role */}
        <div>
          <label style={labelStyle(theme)}>Role</label>
          <select
            style={{ ...inputStyle(theme), cursor: 'pointer' }}
            value={role}
            onChange={(e) => setRole(e.target.value as User['role'])}
          >
            <option value="owner">Owner</option>
            <option value="manager">Manager</option>
            <option value="member">Member</option>
          </select>
        </div>

        {/* Department */}
        <div>
          <label style={labelStyle(theme)}>Department</label>
          <input
            style={inputStyle(theme)}
            value={dept}
            onChange={(e) => setDept(e.target.value)}
            placeholder="e.g. Engineering"
          />
        </div>

        {/* Title */}
        <div>
          <label style={labelStyle(theme)}>Title</label>
          <input
            style={inputStyle(theme)}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Senior Engineer"
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

        {/* Avatar URL */}
        <div>
          <label style={labelStyle(theme)}>Avatar URL</label>
          <input
            style={inputStyle(theme)}
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
            placeholder="https://example.com/avatar.png"
            type="url"
          />
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

        {/* Skills */}
        <div>
          <label style={labelStyle(theme)}>Skills (comma-separated)</label>
          <input
            style={inputStyle(theme)}
            value={skillsRaw}
            onChange={(e) => setSkillsRaw(e.target.value)}
            placeholder="e.g. React, TypeScript, SQL"
          />
        </div>

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
            {isEdit ? 'Save Changes' : 'Add Member'}
          </button>
        </div>

        {/* Delete section (edit mode only) */}
        {isEdit && onDelete && (
          <div style={{ borderTop: `1px solid ${theme.borderLight}`, paddingTop: 16 }}>
            {!showDeleteConfirm ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, fontFamily: FONT_BODY, color: theme.textMuted }}>
                  Delete this member
                </span>
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  style={buttonStyle(COLOR_DANGER)}
                >
                  Delete
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <p style={{ margin: 0, fontSize: 12, fontFamily: FONT_BODY, color: theme.textSecondary }}>
                  <strong style={{ color: COLOR_DANGER }}>Warning:</strong>{' '}
                  {taskCount} task{taskCount !== 1 ? 's' : ''},{' '}
                  {goalCount} goal{goalCount !== 1 ? 's' : ''},{' '}
                  {teamLeadCount} team lead role{teamLeadCount !== 1 ? 's' : ''} will be affected.
                </p>
                <div>
                  <label style={labelStyle(theme)}>Reassign work to</label>
                  <select
                    style={{ ...inputStyle(theme), cursor: 'pointer' }}
                    value={reassignTo}
                    onChange={(e) => setReassignTo(e.target.value)}
                  >
                    <option value="">Leave unassigned</option>
                    {otherUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </div>
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
