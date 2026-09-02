import { useState } from 'react';
import type { StepProps } from '../wizardTypes';
import { ConnectionFields } from '../../clients/ConnectionFields';
import { emptyConnectionDraft, draftToConnection, type ConnectionDraft } from '../../clients/connectionDraft';
import { inputStyle, labelStyle } from '../../../styles/formStyles';
import { FONT_BODY, COLOR_SUCCESS, COLOR_DANGER, PRIMARY_COLOR } from '../../../constants/config';

export function StepConnection({ data, patch, theme, bridge }: StepProps) {
  const [name, setName] = useState('WHATS’ON');
  const [draft, setDraft] = useState<ConnectionDraft>(emptyConnectionDraft);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const p = { fontSize: 13, fontFamily: FONT_BODY, color: theme.textSecondary, lineHeight: 1.6, margin: '0 0 12px 0' };
  const saved = !!data.connectionId;

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const connection = draftToConnection(draft, name.trim() || 'WHATS’ON', `conn_${Date.now()}`);
      const result = await bridge.saveConnection(connection);
      patch({
        connectionId: result.connection?.id ?? connection.id,
        connectionName: connection.name,
      });
    } catch (e) {
      // The bridge refuses to store a credential it cannot encrypt (cloud
      // deployments without BRIDGE_ENCRYPTION_KEY). That is a deployment
      // problem, not a typo, so say so instead of showing a bare failure.
      const message = (e as Error).message || 'Could not save the connection';
      setError(/BRIDGE_ENCRYPTION_KEY|encryption/i.test(message)
        ? 'This instance has no credential encryption key configured, so it will not store a '
          + 'database password. Ask whoever runs the server to set BRIDGE_ENCRYPTION_KEY, then try again.'
        : message);
    } finally {
      setSaving(false);
    }
  };

  if (saved) {
    return (
      <div>
        <div style={{
          padding: '12px 14px', borderRadius: 8, marginBottom: 14,
          background: `${COLOR_SUCCESS}12`, border: `1px solid ${COLOR_SUCCESS}44`,
        }}>
          <span style={{ fontSize: 13, fontWeight: 700, fontFamily: FONT_BODY, color: theme.text }}>
            ✓ Saved “{data.connectionName}”
          </span>
        </div>
        <p style={p}>
          The password is encrypted before it is written to disk, and the app only ever reads it
          back masked. Queries run through the bridge and are <b>read-only</b> — BrOKR cannot write
          to WHATS'ON even if a query tried to.
        </p>
      </div>
    );
  }

  return (
    <div>
      <p style={p}>
        Point BrOKR at the database you want numbers from. It is tested before it is saved, and
        every query the app ever runs against it is read-only.
      </p>

      <div style={{ marginBottom: 10 }}>
        <label style={{ ...labelStyle(theme), fontSize: 11 }} htmlFor="wizard-conn-name">
          Connection name
        </label>
        <input
          id="wizard-conn-name"
          style={{ ...inputStyle(theme), fontSize: 12 }}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="WHATS'ON Production"
        />
      </div>

      <ConnectionFields
        draft={draft}
        onChange={setDraft}
        theme={theme}
        connectionName={name}
        testConnection={bridge.testConnection}
      />

      <div style={{ marginTop: 14 }}>
        <button
          type="button"
          onClick={save}
          disabled={saving || !draft.host.trim()}
          style={{
            padding: '8px 16px', borderRadius: 6, border: 'none', background: PRIMARY_COLOR,
            color: '#fff', fontSize: 13, fontWeight: 600, fontFamily: FONT_BODY,
            cursor: saving || !draft.host.trim() ? 'not-allowed' : 'pointer',
            opacity: saving || !draft.host.trim() ? 0.5 : 1,
          }}
        >
          {saving ? 'Saving…' : 'Save connection'}
        </button>
        <span style={{ marginLeft: 10, fontSize: 12, color: theme.textFaint, fontFamily: FONT_BODY }}>
          Test it first — a saved connection that does not work is the slowest kind of mistake.
        </span>
      </div>

      {error && (
        <p style={{ ...p, marginTop: 12, color: COLOR_DANGER, fontSize: 12 }}>{error}</p>
      )}
    </div>
  );
}
