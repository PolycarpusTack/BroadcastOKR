import { useState } from 'react';
import { Modal } from '../ui/Modal';
import { PillBadge } from '../ui/PillBadge';
import { inputStyle, labelStyle, buttonStyle } from '../../styles/formStyles';
import {
  PRIMARY_COLOR,
  COLOR_SUCCESS,
  FONT_BODY,
  FONT_HEADING,
  FONT_MONO,
} from '../../constants/config';
import type { Client, GoalTemplate, Theme } from '../../types';
import { ConnectionFields } from './ConnectionFields';
import { emptyConnectionDraft, draftToConnection, type ConnectionDraft } from './connectionDraft';
import type { DBConnection } from '../../hooks/useBridge';

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

interface ClientModalProps {
  open: boolean;
  onClose: () => void;
  theme: Theme;
  client?: Client;
  connections: DBConnection[];
  templates: GoalTemplate[];
  onSave: (client: Client) => void;
  saveConnection?: (conn: DBConnection) => Promise<{ ok: boolean; connection: DBConnection }>;
  testConnection?: (conn: Omit<DBConnection, 'id'>) => Promise<{ ok: boolean; message: string }>;
  onConnectionCreated?: () => void;
}

function emptyOverrides(templates: GoalTemplate[]): Record<string, Record<string, string>> {
  const overrides: Record<string, Record<string, string>> = {};
  for (const t of templates) {
    overrides[t.id] = {};
  }
  return overrides;
}

/**
 * The form's starting point, computed once per mount. The parent remounts the
 * modal by key when it opens or the client changes (TD-2), so there is no
 * prop→state reset effect and a connection list refreshing mid-edit no longer
 * wipes what the operator typed.
 */
function initialClientForm(client: Client | undefined, connections: DBConnection[], templates: GoalTemplate[]) {
  const overrides = emptyOverrides(templates);
  const overrideEnabled: Record<string, Record<string, boolean>> = {};
  for (const t of templates) {
    overrideEnabled[t.id] = {};
    for (const krt of t.krTemplates) {
      const existing = client?.sqlOverrides?.[t.id]?.[krt.id];
      overrides[t.id][krt.id] = existing ?? '';
      overrideEnabled[t.id][krt.id] = !!existing;
    }
  }
  const conn = client ? connections.find((c) => c.id === client.connectionId) : undefined;
  return {
    name: client?.name ?? '',
    color: client?.color ?? PRESET_COLORS[0],
    connectionId: client?.connectionId ?? '',
    connMode: (client ? (conn ? 'existing' : 'new') : (connections.length > 0 ? 'existing' : 'new')) as 'existing' | 'new',
    connDraft: conn
      ? {
        type: conn.type as ConnectionDraft['type'],
        host: conn.host,
        port: String(conn.port),
        service: conn.service || '',
        schema: conn.schema || 'PSI',
        user: conn.user,
        // Never echo a stored password back into the form.
        password: '',
        clientDir: conn.clientDir || '',
      }
      : emptyConnectionDraft(),
    tagsRaw: (client?.tags ?? []).join(', '),
    overrides,
    overrideEnabled,
  };
}

export function ClientModal({ open, onClose, theme, client, connections, templates, onSave, saveConnection, testConnection, onConnectionCreated }: ClientModalProps) {
  const isEdit = !!client;

  const [initial] = useState(() => initialClientForm(client, connections, templates));
  const [name, setName] = useState(initial.name);
  const [color, setColor] = useState(initial.color);
  const [connectionId, setConnectionId] = useState(initial.connectionId);
  const [connMode, setConnMode] = useState<'existing' | 'new'>(initial.connMode);
  const [connDraft, setConnDraft] = useState<ConnectionDraft>(initial.connDraft);
  const [tagsRaw, setTagsRaw] = useState(initial.tagsRaw);
  const [overrides, setOverrides] = useState<Record<string, Record<string, string>>>(initial.overrides);
  const [overrideEnabled, setOverrideEnabled] = useState<Record<string, Record<string, boolean>>>(initial.overrideEnabled);
  const [saving, setSaving] = useState(false);


  function handleToggleOverride(templateId: string, krTemplateId: string, enabled: boolean) {
    setOverrideEnabled((prev) => ({
      ...prev,
      [templateId]: { ...prev[templateId], [krTemplateId]: enabled },
    }));
  }

  function handleOverrideSQL(templateId: string, krTemplateId: string, sql: string) {
    setOverrides((prev) => ({
      ...prev,
      [templateId]: { ...prev[templateId], [krTemplateId]: sql },
    }));
  }

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) return;

    setSaving(true);
    try {
      let finalConnectionId = connectionId;

      // If creating a new connection, save it to the bridge first
      if (connMode === 'new' && connDraft.host.trim() && saveConnection) {
        const connId = `conn_${Date.now()}`;
        await saveConnection(draftToConnection(connDraft, `${trimmed} DB`, connId));
        finalConnectionId = connId;
        onConnectionCreated?.();
      }

      const tags = tagsRaw
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      // Build sqlOverrides — only include enabled overrides that have non-empty SQL
      const sqlOverrides: Record<string, Record<string, string>> = {};
      for (const t of templates) {
        const krMap: Record<string, string> = {};
        for (const krt of t.krTemplates) {
          if (overrideEnabled[t.id]?.[krt.id] && overrides[t.id]?.[krt.id]?.trim()) {
            krMap[krt.id] = overrides[t.id][krt.id].trim();
          }
        }
        if (Object.keys(krMap).length > 0) {
          sqlOverrides[t.id] = krMap;
        }
      }

      const saved: Client = {
        id: client?.id ?? crypto.randomUUID(),
        name: trimmed,
        color,
        connectionId: finalConnectionId,
        tags: tags.length > 0 ? tags : undefined,
        channels: client?.channels ?? [],
        sqlOverrides: Object.keys(sqlOverrides).length > 0 ? sqlOverrides : undefined,
      };
      onSave(saved);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const parsedTags = tagsRaw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  const sep = { borderTop: `1px solid ${theme.borderLight}`, margin: '16px 0' };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit Client' : 'Add Client'}
      theme={theme}
      width={620}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Name */}
        <div>
          <label style={labelStyle(theme)}>Client Name</label>
          <input
            style={inputStyle(theme)}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. VRT, Mediagenix"
            autoFocus
          />
        </div>

        {/* Color */}
        <div>
          <label style={labelStyle(theme)}>Brand Color</label>
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

        {/* Database Connection */}
        <div>
          <label style={labelStyle(theme)}>Database Connection</label>

          {connections.length > 0 && (
            <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
              <button
                onClick={() => setConnMode('existing')}
                style={{
                  padding: '4px 12px', borderRadius: 6, border: `1px solid ${theme.border}`,
                  background: connMode === 'existing' ? PRIMARY_COLOR : 'transparent',
                  color: connMode === 'existing' ? '#fff' : theme.textMuted,
                  fontSize: 11, fontWeight: 600, fontFamily: FONT_BODY, cursor: 'pointer',
                }}
              >
                Existing
              </button>
              <button
                onClick={() => setConnMode('new')}
                style={{
                  padding: '4px 12px', borderRadius: 6, border: `1px solid ${theme.border}`,
                  background: connMode === 'new' ? PRIMARY_COLOR : 'transparent',
                  color: connMode === 'new' ? '#fff' : theme.textMuted,
                  fontSize: 11, fontWeight: 600, fontFamily: FONT_BODY, cursor: 'pointer',
                }}
              >
                New Connection
              </button>
            </div>
          )}

          {connMode === 'existing' && connections.length > 0 ? (
            <select
              style={{ ...inputStyle(theme), cursor: 'pointer' }}
              value={connectionId}
              onChange={(e) => setConnectionId(e.target.value)}
            >
              <option value="">— Select connection —</option>
              {connections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.type})
                </option>
              ))}
            </select>
          ) : (
            <ConnectionFields
              draft={connDraft}
              onChange={setConnDraft}
              theme={theme}
              connectionName={name.trim() || 'New'}
              testConnection={testConnection}
            />
          )}
        </div>

        {/* Tags */}
        <div>
          <label style={labelStyle(theme)}>Tags (comma-separated)</label>
          <input
            style={inputStyle(theme)}
            value={tagsRaw}
            onChange={(e) => setTagsRaw(e.target.value)}
            placeholder="e.g. broadcast, belgium, live"
          />
          {parsedTags.length > 0 && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
              {parsedTags.map((tag) => (
                <PillBadge key={tag} label={tag} color={color} />
              ))}
            </div>
          )}
        </div>

        {/* SQL Overrides */}
        {templates.length > 0 && (
          <div>
            <div style={sep} />
            <p style={{ fontSize: 12, fontWeight: 700, fontFamily: FONT_HEADING, color: theme.textSecondary, margin: '0 0 12px 0' }}>
              SQL Overrides (per Goal Template)
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {templates.map((tmpl) => (
                <div key={tmpl.id} style={{ borderRadius: 8, border: `1px solid ${theme.borderLight}`, overflow: 'hidden' }}>
                  <div style={{ padding: '8px 12px', background: theme.bgMuted, borderBottom: `1px solid ${theme.borderLight}` }}>
                    <span style={{ fontFamily: FONT_HEADING, fontSize: 12, fontWeight: 700, color: theme.text }}>
                      {tmpl.title}
                    </span>
                    <span style={{ marginLeft: 8, fontFamily: FONT_MONO, fontSize: 10, color: theme.textMuted }}>
                      {tmpl.category} · {tmpl.period}
                    </span>
                  </div>
                  {tmpl.krTemplates.length === 0 ? (
                    <p style={{ margin: 0, padding: '8px 12px', fontSize: 11, color: theme.textFaint }}>No KR templates defined.</p>
                  ) : (
                    <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {tmpl.krTemplates.map((krt) => {
                        const enabled = overrideEnabled[tmpl.id]?.[krt.id] ?? false;
                        return (
                          <div key={krt.id}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                                <input
                                  type="checkbox"
                                  checked={enabled}
                                  onChange={(e) => handleToggleOverride(tmpl.id, krt.id, e.target.checked)}
                                  style={{ accentColor: PRIMARY_COLOR }}
                                />
                                <span style={{ fontSize: 11, fontWeight: 600, color: theme.textSecondary, fontFamily: FONT_BODY }}>
                                  {krt.title}
                                </span>
                              </label>
                              {enabled && (
                                <span style={{ fontSize: 10, color: COLOR_SUCCESS, fontFamily: FONT_MONO }}>override active</span>
                              )}
                            </div>
                            {enabled && (
                              <textarea
                                value={overrides[tmpl.id]?.[krt.id] ?? ''}
                                onChange={(e) => handleOverrideSQL(tmpl.id, krt.id, e.target.value)}
                                placeholder={krt.sql}
                                rows={3}
                                style={{
                                  ...inputStyle(theme),
                                  fontFamily: FONT_MONO,
                                  fontSize: 11,
                                  resize: 'vertical',
                                  lineHeight: 1.5,
                                }}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
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
            disabled={!name.trim() || saving}
            style={buttonStyle(PRIMARY_COLOR, !name.trim() || saving)}
          >
            {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Add Client'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
