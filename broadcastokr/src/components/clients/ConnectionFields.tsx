import { useState } from 'react';
import type { Theme } from '../../types';
import type { DBConnection } from '../../hooks/useBridge';
import { inputStyle, labelStyle } from '../../styles/formStyles';
import { COLOR_SUCCESS, COLOR_DANGER, FONT_BODY, FONT_MONO } from '../../constants/config';
import { DEFAULT_PORT, DEFAULT_SCHEMA, draftToConnectionInput, type ConnectionDraft } from './connectionDraft';

export interface ConnectionFieldsProps {
  draft: ConnectionDraft;
  onChange: (draft: ConnectionDraft) => void;
  theme: Theme;
  /** Name used when testing; the connection is not named until it is saved. */
  connectionName?: string;
  testConnection?: (conn: Omit<DBConnection, 'id'>) => Promise<{ ok: boolean; message: string }>;
}

export function ConnectionFields({
  draft, onChange, theme, connectionName = 'New', testConnection,
}: ConnectionFieldsProps) {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const set = (patch: Partial<ConnectionDraft>) => {
    setResult(null); // any edit invalidates the previous verdict
    onChange({ ...draft, ...patch });
  };

  const changeType = (type: ConnectionDraft['type']) => {
    // Only follow the dialect while the port is still a default, so an
    // operator's custom port survives a type change.
    const portIsDefault = Object.values(DEFAULT_PORT).includes(draft.port);
    const schemaIsDefault = Object.values(DEFAULT_SCHEMA).includes(draft.schema);
    set({
      type,
      port: portIsDefault ? DEFAULT_PORT[type] : draft.port,
      schema: schemaIsDefault ? DEFAULT_SCHEMA[type] : draft.schema,
    });
  };

  const small = { ...inputStyle(theme), fontSize: 12 };
  const smallLabel = { ...labelStyle(theme), fontSize: 11 };

  const runTest = async () => {
    if (!testConnection) return;
    setTesting(true);
    setResult(null);
    try {
      setResult(await testConnection(draftToConnectionInput(draft, `${connectionName} DB`)));
    } catch (e) {
      setResult({ ok: false, message: (e as Error).message || 'Unknown error' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 12, borderRadius: 8, border: `1px solid ${theme.borderLight}`, background: theme.bgMuted }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={smallLabel} htmlFor="conn-type">Type</label>
            <select
              id="conn-type"
              style={{ ...small, cursor: 'pointer' }}
              value={draft.type}
              onChange={(e) => changeType(e.target.value as ConnectionDraft['type'])}
            >
              <option value="oracle">Oracle</option>
              <option value="postgres">PostgreSQL</option>
            </select>
          </div>
          <div>
            <label style={smallLabel} htmlFor="conn-schema">Schema</label>
            <input id="conn-schema" style={small} value={draft.schema} onChange={(e) => set({ schema: e.target.value })} placeholder={DEFAULT_SCHEMA[draft.type]} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
          <div>
            <label style={smallLabel} htmlFor="conn-host">Host</label>
            <input id="conn-host" style={small} value={draft.host} onChange={(e) => set({ host: e.target.value })} placeholder="db-server.example.com" />
          </div>
          <div>
            <label style={smallLabel} htmlFor="conn-port">Port</label>
            <input id="conn-port" style={small} value={draft.port} onChange={(e) => set({ port: e.target.value })} placeholder={DEFAULT_PORT[draft.type]} />
          </div>
        </div>

        <div>
          <label style={smallLabel} htmlFor="conn-service">
            {draft.type === 'oracle' ? 'Service Name' : 'Database'}
          </label>
          <input
            id="conn-service"
            style={small}
            value={draft.service}
            onChange={(e) => set({ service: e.target.value })}
            placeholder={draft.type === 'oracle' ? 'ORCL' : 'whatson'}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={smallLabel} htmlFor="conn-user">Username</label>
            <input id="conn-user" style={small} value={draft.user} onChange={(e) => set({ user: e.target.value })} placeholder="psi" />
          </div>
          <div>
            <label style={smallLabel} htmlFor="conn-password">Password</label>
            <input id="conn-password" type="password" style={small} value={draft.password} onChange={(e) => set({ password: e.target.value })} placeholder="********" />
          </div>
        </div>

        {draft.type === 'oracle' && (
          <div>
            <label style={smallLabel} htmlFor="conn-clientdir">
              Oracle Client Directory <span style={{ fontWeight: 400, color: theme.textFaint }}>(optional)</span>
            </label>
            <input
              id="conn-clientdir"
              style={{ ...small, fontFamily: FONT_MONO }}
              value={draft.clientDir}
              onChange={(e) => set({ clientDir: e.target.value })}
              placeholder="C:\\Oracle\\19c\\db_home\\bin"
            />
          </div>
        )}
      </div>

      {testConnection && draft.host.trim() && (
        <div>
          <button
            type="button"
            disabled={testing}
            onClick={runTest}
            style={{
              padding: '6px 14px', borderRadius: 6, border: `1px solid ${theme.border}`,
              background: 'transparent', color: theme.textSecondary, fontSize: 12,
              fontFamily: FONT_BODY, fontWeight: 600,
              cursor: testing ? 'not-allowed' : 'pointer', opacity: testing ? 0.7 : 1,
            }}
          >
            {testing ? 'Testing\u2026' : 'Test Connection'}
          </button>
          {result && (
            <span style={{
              marginLeft: 10, fontSize: 12, fontFamily: FONT_BODY, fontWeight: 600,
              color: result.ok ? COLOR_SUCCESS : COLOR_DANGER,
            }}>
              {result.ok ? '\u2713 Connected' : `\u2717 ${result.message}`}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
