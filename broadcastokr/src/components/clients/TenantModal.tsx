import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal } from '../ui/Modal';
import { ConnectionFields } from './ConnectionFields';
import { AgentsPanel } from './AgentsPanel';
import { emptyConnectionDraft, draftToConnection, type ConnectionDraft } from './connectionDraft';
import { cockpitApi as defaultApi, type CockpitApi, type TenantStatus, type TenantSummary } from '../../utils/cockpitApi';
import { formatTimeAgo } from '../../utils/dates';
import { inputStyle, labelStyle, buttonStyle } from '../../styles/formStyles';
import { PRIMARY_COLOR, COLOR_SUCCESS, COLOR_DANGER, COLOR_WARNING, FONT_MONO } from '../../constants/config';
import type { Client, DBConnection, Theme } from '../../types';

export interface TenantModalProps {
  open: boolean;
  onClose: () => void;
  client: Client | null;
  theme: Theme;
  /** Injected in tests; the real one talks to the cockpit bridge. */
  api?: CockpitApi;
}

/**
 * The cockpit's per-tenant operations (R6-1): register the instance (URL +
 * operator token), see whether it answers and accepts the token, mint or
 * re-mint the share token, bind the tenant's WHATS'ON connection (add one
 * with a test through the tenant, pick one, refresh channels), and manage its
 * connector agents. Every action goes through the operator channel; nothing
 * here needs curl any more.
 */
export function TenantModal({ open, onClose, client, theme, api = defaultApi }: TenantModalProps) {
  const clientId = client?.id ?? '';

  const [summary, setSummary] = useState<TenantSummary | null>(null);
  const [status, setStatus] = useState<TenantStatus | null>(null);
  const [instanceUrl, setInstanceUrl] = useState('');
  const [operatorToken, setOperatorToken] = useState('');
  const [connections, setConnections] = useState<DBConnection[]>([]);
  const [selected, setSelected] = useState('');
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [draft, setDraft] = useState<ConnectionDraft>(emptyConnectionDraft);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const agentsApi = useMemo(() => (clientId ? api.tenantAgents(clientId) : null), [api, clientId]);

  const fail = (e: unknown) => setMessage({ ok: false, text: (e as Error).message || 'Request failed' });

  const refresh = useCallback(async () => {
    if (!clientId) return;
    try {
      const tenants = await api.listTenants();
      const mine = tenants.find((t) => t.clientId === clientId) ?? null;
      setSummary(mine);
      setInstanceUrl(mine?.instanceUrl ?? '');
      if (mine?.instanceUrl && mine.operatorTokenSet) {
        const s = await api.tenantStatus(clientId);
        setStatus(s);
        if (s.operatorAccepted) {
          const list = await api.tenantConnections(clientId);
          setConnections(list);
          setSelected(s.client?.connectionId ?? '');
        }
      } else {
        setStatus(null);
      }
    } catch (e) {
      fail(e);
    }
  }, [api, clientId]);

  // Fresh state per opening comes from the parent keying the modal by client
  // (ClientsPage); the effect only kicks off the load.
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => { void refresh(); }, 0);
    return () => clearTimeout(timer);
  }, [open, refresh]);

  const run = async (work: () => Promise<string>) => {
    setBusy(true);
    try {
      const text = await work();
      setMessage({ ok: true, text });
      await refresh();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const register = () => run(async () => {
    await api.registerTenant(clientId, { instanceUrl, ...(operatorToken ? { operatorToken } : {}) });
    setOperatorToken('');
    return 'Instance registered.';
  });

  const mintShare = () => run(async () => {
    const { token } = await api.mintShareToken(clientId);
    setShareToken(token);
    return 'Share token minted — copy it now, it is not shown again.';
  });

  const bind = () => run(async () => {
    await api.bindTenantConnection(clientId, selected);
    return selected ? 'Connection bound on the tenant.' : 'Connection unbound.';
  });

  const refreshChannels = () => run(async () => {
    const { channels } = await api.refreshTenantChannels(clientId);
    return `Pulled ${channels.length} channel${channels.length === 1 ? '' : 's'} into the tenant.`;
  });

  const saveNew = () => run(async () => {
    const conn = draftToConnection(draft, newName.trim(), `conn_${Date.now()}`);
    await api.saveTenantConnection(clientId, conn);
    await api.bindTenantConnection(clientId, conn.id);
    setAdding(false); setNewName(''); setDraft(emptyConnectionDraft());
    return `Connection "${conn.name}" saved on the tenant and bound.`;
  });

  const remove = (id: string) => run(async () => {
    await api.deleteTenantConnection(clientId, id);
    return 'Connection deleted on the tenant.';
  });

  const testViaTenant = useCallback(
    (conn: Omit<DBConnection, 'id'>) => api.testTenantConnection(clientId, conn),
    [api, clientId],
  );

  if (!client) return null;

  const card: React.CSSProperties = { border: `1px solid ${theme.border}`, borderRadius: 10, padding: '14px 16px', marginBottom: 14 };
  const mono: React.CSSProperties = { fontFamily: FONT_MONO, fontSize: 12, color: theme.textSecondary };
  const ghost: React.CSSProperties = { padding: '6px 12px', borderRadius: 6, border: `1px solid ${theme.border}`, background: 'transparent', color: theme.textSecondary, fontSize: 12, fontWeight: 600, cursor: 'pointer' };
  const boundName = connections.find((c) => c.id === status?.client?.connectionId)?.name;
  const cockpitOrigin = typeof window !== 'undefined' ? window.location.origin : '';

  return (
    <Modal open={open} onClose={onClose} title={`Tenant instance — ${client.name}`} width={720} theme={theme}>
      {message && (
        <div role="status" style={{ marginBottom: 12, fontSize: 12.5, color: message.ok ? COLOR_SUCCESS : COLOR_DANGER }}>
          {message.ok ? '✓' : '✕'} {message.text}
        </div>
      )}

      {/* Instance registration */}
      <div style={card}>
        <div style={labelStyle(theme)}>Instance</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 6 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: theme.textSecondary }}>
            Instance URL
            <input value={instanceUrl} onChange={(e) => setInstanceUrl(e.target.value)} placeholder="https://tenant.example" style={inputStyle(theme)} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: theme.textSecondary }}>
            Operator token
            <input type="password" value={operatorToken} onChange={(e) => setOperatorToken(e.target.value)}
              placeholder={summary?.operatorTokenSet ? 'stored — leave blank to keep' : 'BRIDGE_OPERATOR_TOKEN from the instance .env'} style={inputStyle(theme)} />
          </label>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10 }}>
          <button onClick={register} disabled={busy || !instanceUrl.trim()} style={{ ...buttonStyle(PRIMARY_COLOR, busy || !instanceUrl.trim()), fontSize: 12, padding: '6px 14px' }}>
            {summary?.operatorTokenSet ? 'Update' : 'Register'}
          </button>
          <span style={{ fontSize: 12.5 }}>
            {!summary?.instanceUrl && <span style={{ color: theme.textMuted }}>Not registered yet.</span>}
            {summary?.instanceUrl && !status && <span style={{ color: theme.textMuted }}>Checking…</span>}
            {status && !status.reachable && <span style={{ color: COLOR_DANGER }}>✕ Unreachable{status.detail ? ` — ${status.detail}` : ''}</span>}
            {status?.reachable && !status.operatorAccepted && <span style={{ color: COLOR_WARNING }}>⚠ Reachable (v{status.version}), operator token refused{status.detail ? ` — ${status.detail}` : ''}</span>}
            {status?.reachable && status.operatorAccepted && <span style={{ color: COLOR_SUCCESS }}>✓ Reachable · v{status.version} · operator token accepted</span>}
          </span>
        </div>
      </div>

      {/* Share channel */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <div style={labelStyle(theme)}>Share channel</div>
          <span style={{ fontSize: 12, color: theme.textMuted }}>
            {summary?.shareTokenMintedAt ? `token minted ${formatTimeAgo(summary.shareTokenMintedAt)}` : 'no share token yet'}
          </span>
          <button onClick={mintShare} disabled={busy} style={{ ...ghost, marginLeft: 'auto' }}>
            {summary?.shareTokenMintedAt ? 'Re-mint share token' : 'Mint share token'}
          </button>
        </div>
        {shareToken && (
          <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 8, border: `1px solid ${COLOR_WARNING}`, background: theme.bgMuted }}>
            <div style={{ fontSize: 12, color: theme.text, marginBottom: 6 }}>Put these in the tenant instance's .env and restart it — the token is shown once:</div>
            <code data-testid="share-env" style={{ ...mono, display: 'block', whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: theme.text }}>
              {`BRIDGE_COCKPIT_URL=${cockpitOrigin}\nBRIDGE_SHARE_TOKEN=${shareToken}`}
            </code>
          </div>
        )}
      </div>

      {/* WHATS'ON connection — only once the channel works */}
      {status?.operatorAccepted && (
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <div style={labelStyle(theme)}>WHATS'ON connection</div>
            <span style={{ fontSize: 12, color: boundName ? theme.textSecondary : COLOR_WARNING }}>
              {boundName ? `bound: ${boundName}` : 'no connection bound'}
              {status.client ? ` · ${status.client.channels?.length ?? 0} channels` : ''}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <select aria-label="Tenant connection" value={selected} onChange={(e) => setSelected(e.target.value)} style={{ ...inputStyle(theme), width: 'auto', minWidth: 220 }}>
              <option value="">— none —</option>
              {connections.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.type} · {c.host}:{c.port}/{c.service})</option>)}
            </select>
            <button onClick={bind} disabled={busy || selected === (status.client?.connectionId ?? '')} style={{ ...buttonStyle(PRIMARY_COLOR, busy || selected === (status.client?.connectionId ?? '')), fontSize: 12, padding: '6px 14px' }}>
              Bind
            </button>
            <button onClick={refreshChannels} disabled={busy || !status.client?.connectionId} style={ghost}>Refresh channels</button>
            {selected && selected !== status.client?.connectionId && (
              <button onClick={() => remove(selected)} disabled={busy} style={{ ...ghost, color: COLOR_DANGER }}>Delete selected</button>
            )}
            <button onClick={() => setAdding((v) => !v)} style={{ ...ghost, marginLeft: 'auto' }}>{adding ? 'Cancel' : '+ Add connection'}</button>
          </div>
          {adding && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px dashed ${theme.border}` }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: theme.textSecondary, marginBottom: 10 }}>
                Connection name
                <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. WHATS'ON production" style={inputStyle(theme)} />
              </label>
              <ConnectionFields draft={draft} onChange={setDraft} theme={theme} connectionName={newName || 'New'} testConnection={testViaTenant} />
              <button onClick={saveNew} disabled={busy || !newName.trim() || !draft.host.trim() || !draft.user.trim()}
                style={{ ...buttonStyle(PRIMARY_COLOR, busy || !newName.trim()), fontSize: 12, padding: '6px 14px', marginTop: 10 }}>
                Save on the tenant and bind
              </button>
            </div>
          )}
        </div>
      )}

      {/* Agents — same gate */}
      {status?.operatorAccepted && agentsApi && (
        <div style={card}>
          <AgentsPanel api={agentsApi} canManage instanceUrl={summary?.instanceUrl} theme={theme} />
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={onClose} style={ghost}>Close</button>
      </div>
    </Modal>
  );
}
