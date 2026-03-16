import { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { PillBadge } from '../ui/PillBadge';
import { inputStyle, labelStyle, buttonStyle } from '../../styles/formStyles';
import {
  PRIMARY_COLOR,
  COLOR_SUCCESS,
  COLOR_DANGER,
  FONT_BODY,
  FONT_HEADING,
  FONT_MONO,
} from '../../constants/config';
import type { Client, GoalTemplate, Theme } from '../../types';
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
}

function emptyOverrides(templates: GoalTemplate[]): Record<string, Record<string, string>> {
  const overrides: Record<string, Record<string, string>> = {};
  for (const t of templates) {
    overrides[t.id] = {};
  }
  return overrides;
}

export function ClientModal({ open, onClose, theme, client, connections, templates, onSave, saveConnection, testConnection }: ClientModalProps) {
  const isEdit = !!client;

  const [name, setName] = useState('');
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [connectionId, setConnectionId] = useState('');
  const [connMode, setConnMode] = useState<'existing' | 'new'>('existing');
  const [dbType, setDbType] = useState<'oracle' | 'postgres'>('oracle');
  const [dbHost, setDbHost] = useState('');
  const [dbPort, setDbPort] = useState('1521');
  const [dbService, setDbService] = useState('');
  const [dbSchema, setDbSchema] = useState('PSI');
  const [dbUser, setDbUser] = useState('');
  const [dbPassword, setDbPassword] = useState('');
  const [dbClientDir, setDbClientDir] = useState('');
  const [tagsRaw, setTagsRaw] = useState('');
  const [overrides, setOverrides] = useState<Record<string, Record<string, string>>>({});
  const [overrideEnabled, setOverrideEnabled] = useState<Record<string, Record<string, boolean>>>({});

  useEffect(() => {
    setConnTestResult(null);
    if (!open) return;
    if (client) {
      setName(client.name);
      setColor(client.color);
      setConnectionId(client.connectionId);
      // Try to find matching connection to populate DB fields
      const conn = connections.find(c => c.id === client.connectionId);
      if (conn) {
        setConnMode('existing');
        setDbType(conn.type as 'oracle' | 'postgres');
        setDbHost(conn.host);
        setDbPort(String(conn.port));
        setDbService(conn.service || '');
        setDbSchema(conn.schema || 'PSI');
        setDbUser(conn.user);
        setDbPassword('');
        setDbClientDir(conn.clientDir || '');
      } else {
        setConnMode('new');
      }
      setTagsRaw((client.tags ?? []).join(', '));
      // Reconstruct override state from existing sqlOverrides
      const initialOverrides: Record<string, Record<string, string>> = emptyOverrides(templates);
      const initialEnabled: Record<string, Record<string, boolean>> = {};
      for (const t of templates) {
        initialEnabled[t.id] = {};
        for (const krt of t.krTemplates) {
          const existing = client.sqlOverrides?.[t.id]?.[krt.id];
          initialOverrides[t.id][krt.id] = existing ?? '';
          initialEnabled[t.id][krt.id] = !!existing;
        }
      }
      setOverrides(initialOverrides);
      setOverrideEnabled(initialEnabled);
    } else {
      setName('');
      setColor(PRESET_COLORS[0]);
      setConnectionId('');
      setConnMode(connections.length > 0 ? 'existing' : 'new');
      setDbType('oracle');
      setDbHost('');
      setDbPort('1521');
      setDbService('');
      setDbSchema('PSI');
      setDbUser('');
      setDbPassword('');
      setDbClientDir('');
      setTagsRaw('');
      const initialOverrides: Record<string, Record<string, string>> = emptyOverrides(templates);
      const initialEnabled: Record<string, Record<string, boolean>> = {};
      for (const t of templates) {
        initialEnabled[t.id] = {};
        for (const krt of t.krTemplates) {
          initialOverrides[t.id][krt.id] = '';
          initialEnabled[t.id][krt.id] = false;
        }
      }
      setOverrides(initialOverrides);
      setOverrideEnabled(initialEnabled);
    }
  }, [open, client, connections, templates]);

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

  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [connTestResult, setConnTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) return;

    setSaving(true);
    try {
      let finalConnectionId = connectionId;

      // If creating a new connection, save it to the bridge first
      if (connMode === 'new' && dbHost.trim() && saveConnection) {
        const connId = `conn_${Date.now()}`;
        const newConn: DBConnection = {
          id: connId,
          name: `${trimmed} DB`,
          type: dbType as 'oracle' | 'postgres',
          host: dbHost.trim(),
          port: Number(dbPort) || (dbType === 'oracle' ? 1521 : 5432),
          service: dbService.trim(),
          schema: dbSchema.trim() || 'PSI',
          user: dbUser.trim(),
          password: dbPassword,
          clientDir: dbType === 'oracle' && dbClientDir.trim() ? dbClientDir.trim() : undefined,
        };
        await saveConnection(newConn);
        finalConnectionId = connId;
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 12, borderRadius: 8, border: `1px solid ${theme.borderLight}`, background: theme.bgMuted }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ ...labelStyle(theme), fontSize: 11 }}>Type</label>
                  <select
                    style={{ ...inputStyle(theme), cursor: 'pointer', fontSize: 12 }}
                    value={dbType}
                    onChange={(e) => { setDbType(e.target.value as 'oracle' | 'postgres'); setDbPort(e.target.value === 'oracle' ? '1521' : '5432'); }}
                  >
                    <option value="oracle">Oracle</option>
                    <option value="postgres">PostgreSQL</option>
                  </select>
                </div>
                <div>
                  <label style={{ ...labelStyle(theme), fontSize: 11 }}>Schema</label>
                  <input style={{ ...inputStyle(theme), fontSize: 12 }} value={dbSchema} onChange={(e) => setDbSchema(e.target.value)} placeholder="PSI" />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ ...labelStyle(theme), fontSize: 11 }}>Host</label>
                  <input style={{ ...inputStyle(theme), fontSize: 12 }} value={dbHost} onChange={(e) => setDbHost(e.target.value)} placeholder="db-server.example.com" />
                </div>
                <div>
                  <label style={{ ...labelStyle(theme), fontSize: 11 }}>Port</label>
                  <input style={{ ...inputStyle(theme), fontSize: 12 }} value={dbPort} onChange={(e) => setDbPort(e.target.value)} placeholder={dbType === 'oracle' ? '1521' : '5432'} />
                </div>
              </div>
              {dbType === 'oracle' && (
                <div>
                  <label style={{ ...labelStyle(theme), fontSize: 11 }}>Service Name</label>
                  <input style={{ ...inputStyle(theme), fontSize: 12 }} value={dbService} onChange={(e) => setDbService(e.target.value)} placeholder="ORCL" />
                </div>
              )}
              {dbType === 'postgres' && (
                <div>
                  <label style={{ ...labelStyle(theme), fontSize: 11 }}>Database</label>
                  <input style={{ ...inputStyle(theme), fontSize: 12 }} value={dbService} onChange={(e) => setDbService(e.target.value)} placeholder="whatson" />
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ ...labelStyle(theme), fontSize: 11 }}>Username</label>
                  <input style={{ ...inputStyle(theme), fontSize: 12 }} value={dbUser} onChange={(e) => setDbUser(e.target.value)} placeholder="psi" />
                </div>
                <div>
                  <label style={{ ...labelStyle(theme), fontSize: 11 }}>Password</label>
                  <input type="password" style={{ ...inputStyle(theme), fontSize: 12 }} value={dbPassword} onChange={(e) => setDbPassword(e.target.value)} placeholder="********" />
                </div>
              </div>
              {dbType === 'oracle' && (
                <div>
                  <label style={{ ...labelStyle(theme), fontSize: 11 }}>Oracle Client Directory <span style={{ fontWeight: 400, color: theme.textFaint }}>(optional)</span></label>
                  <input style={{ ...inputStyle(theme), fontSize: 12, fontFamily: FONT_MONO }} value={dbClientDir} onChange={(e) => setDbClientDir(e.target.value)} placeholder="C:\Oracle\19c\db_home\bin" />
                </div>
              )}
            </div>
            {testConnection && dbHost.trim() && (
              <div>
                <button
                  type="button"
                  disabled={testing}
                  onClick={async () => {
                    setTesting(true);
                    setConnTestResult(null);
                    try {
                      const result = await testConnection({
                        name: `${name.trim() || 'New'} DB`,
                        type: dbType,
                        host: dbHost.trim(),
                        port: Number(dbPort) || (dbType === 'oracle' ? 1521 : 5432),
                        service: dbService.trim(),
                        schema: dbSchema.trim() || 'PSI',
                        user: dbUser.trim(),
                        password: dbPassword,
                        clientDir: dbType === 'oracle' && dbClientDir.trim() ? dbClientDir.trim() : undefined,
                      });
                      setConnTestResult(result);
                    } catch (e) {
                      setConnTestResult({ ok: false, message: (e as Error).message || 'Unknown error' });
                    } finally {
                      setTesting(false);
                    }
                  }}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 6,
                    border: `1px solid ${theme.border}`,
                    background: 'transparent',
                    color: theme.textSecondary,
                    fontSize: 12,
                    fontFamily: FONT_BODY,
                    fontWeight: 600,
                    cursor: testing ? 'not-allowed' : 'pointer',
                    opacity: testing ? 0.7 : 1,
                  }}
                >
                  {testing ? 'Testing…' : 'Test Connection'}
                </button>
                {connTestResult && (
                  <span style={{
                    marginLeft: 10,
                    fontSize: 12,
                    fontFamily: FONT_BODY,
                    fontWeight: 600,
                    color: connTestResult.ok ? COLOR_SUCCESS : COLOR_DANGER,
                  }}>
                    {connTestResult.ok ? '✓ Connected' : `✗ ${connTestResult.message}`}
                  </span>
                )}
              </div>
            )}
            </div>
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
