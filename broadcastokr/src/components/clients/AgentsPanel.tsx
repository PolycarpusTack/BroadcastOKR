import { useCallback, useEffect, useState } from 'react';
import type { Theme } from '../../types';
import type { AgentsApi, AgentInfo } from '../../utils/cockpitApi';
import { formatTimeAgo } from '../../utils/dates';
import { buttonStyle } from '../../styles/formStyles';
import { PRIMARY_COLOR, COLOR_DANGER, COLOR_SUCCESS, COLOR_WARNING, FONT_MONO } from '../../constants/config';

export interface AgentsPanelProps {
  api: AgentsApi;
  /** Owners mint and revoke; everyone else reads. */
  canManage: boolean;
  /** Where the agent will push to — goes into the enrol command shown once. */
  instanceUrl?: string;
  theme: Theme;
}

/**
 * Connector agents of one instance: list with last-seen, a one-time enrolment
 * token with the exact command to run at the site, and revocation. Mounted on
 * the client edition's Settings page (its own agents) and inside the cockpit's
 * tenant modal (a tenant's agents, through the operator channel) — the `api`
 * prop is the only difference (R6-1).
 */
export function AgentsPanel({ api, canManage, instanceUrl, theme }: AgentsPanelProps) {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [minted, setMinted] = useState<{ token: string; expiresInMinutes: number } | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.list().then((list) => { setAgents(list); setError(null); })
      .catch((e: Error) => setError(e.message));
  }, [api]);

  useEffect(() => { load(); }, [load]);

  const mint = async () => {
    setBusy(true);
    try {
      setMinted(await api.mintEnrolToken());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    if (confirmId !== id) { setConfirmId(id); return; }
    setBusy(true);
    try {
      await api.revoke(id);
      setConfirmId(null);
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const label: React.CSSProperties = {
    fontSize: 10, fontFamily: FONT_MONO, fontWeight: 700, letterSpacing: 1,
    textTransform: 'uppercase', color: theme.textMuted,
  };
  const mono: React.CSSProperties = { fontFamily: FONT_MONO, fontSize: 12, color: theme.textSecondary };
  const site = instanceUrl || (typeof window !== 'undefined' ? window.location.origin : 'https://<instance>');

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <div style={label}>Connector agents ({agents.length})</div>
        {canManage && (
          <button onClick={mint} disabled={busy} style={{ ...buttonStyle(PRIMARY_COLOR, busy), marginLeft: 'auto', fontSize: 12, padding: '6px 12px' }}>
            New enrolment token
          </button>
        )}
      </div>

      {minted && (
        <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 8, border: `1px solid ${COLOR_WARNING}`, background: theme.bgMuted }}>
          <div style={{ fontSize: 12, color: theme.text, marginBottom: 6 }}>
            Enrolment token — shown once, valid {minted.expiresInMinutes} minutes, single use. Run at the site:
          </div>
          <code data-testid="enrol-command" style={{ ...mono, display: 'block', whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: theme.text }}>
            {`node bridge/agent.cjs enroll --instance ${site} --token ${minted.token} --name "<site name>" --dir /etc/brokr-agent`}
          </code>
          <button onClick={() => setMinted(null)} style={{ marginTop: 8, padding: '4px 10px', borderRadius: 6, border: `1px solid ${theme.border}`, background: 'transparent', color: theme.textSecondary, fontSize: 11, cursor: 'pointer' }}>
            Done, hide it
          </button>
        </div>
      )}

      {error && <div style={{ marginTop: 8, fontSize: 12.5, color: COLOR_DANGER }}>✕ {error}</div>}

      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {agents.length === 0 && <span style={{ color: theme.textMuted, fontSize: 13 }}>No agents enrolled yet.</span>}
        {agents.map((a) => (
          <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', borderRadius: 8, border: `1px solid ${theme.border}` }}>
            <span style={{ fontWeight: 700, color: a.revoked ? theme.textMuted : theme.text, fontSize: 13, textDecoration: a.revoked ? 'line-through' : 'none' }}>{a.name}</span>
            <span style={mono}>{a.id}</span>
            <span style={{ ...mono, color: a.revoked ? theme.textMuted : (a.lastSeenAt ? COLOR_SUCCESS : COLOR_WARNING) }}>
              {a.revoked ? 'revoked' : (a.lastSeenAt ? `seen ${formatTimeAgo(a.lastSeenAt)}` : 'never seen')}
            </span>
            {canManage && !a.revoked && (
              <button
                onClick={() => revoke(a.id)}
                disabled={busy}
                style={{ marginLeft: 'auto', padding: '4px 10px', borderRadius: 6, border: `1px solid ${confirmId === a.id ? COLOR_DANGER : theme.border}`, background: 'transparent', color: confirmId === a.id ? COLOR_DANGER : theme.textSecondary, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
              >
                {confirmId === a.id ? 'Confirm revoke' : 'Revoke'}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
