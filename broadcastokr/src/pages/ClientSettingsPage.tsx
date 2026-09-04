import { useState, useEffect } from 'react';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useStore } from '../store/store';
import { toConnectionInput } from '../utils/connections';
import { AgentsPanel } from '../components/clients/AgentsPanel';
import { ownAgentsApi } from '../utils/cockpitApi';
import { useDeployment } from '../context/DeploymentContext';
import { COLOR_SUCCESS, COLOR_DANGER, FONT_HEADING, FONT_MONO } from '../constants/config';
import type { DBConnection } from '../types';

interface ClientSettingsPageProps {
  bridgeConnected?: boolean;
  testConnection?: (conn: Omit<DBConnection, 'id'>) => Promise<{ ok: boolean; message: string }>;
  getConnections?: () => Promise<DBConnection[]>;
  getChannels?: (connectionId: string) => Promise<Array<{ id: string; name: string; internalValue?: string; channelKind?: string }>>;
}

/**
 * Client Edition settings: the instance is pinned to one client — this page
 * shows its WHATS'ON connection and channels. The fleet surfaces
 * (ClientsPage/Compare) are excluded from client builds entirely.
 */
export function ClientSettingsPage({ bridgeConnected = false, testConnection, getConnections, getChannels }: ClientSettingsPageProps) {
  const { theme } = useTheme();
  const { permissions } = useAuth();
  const { entitled } = useDeployment();
  const { toast } = useToast();
  const client = useStore((s) => s.clients[0]);
  const updateClient = useStore((s) => s.updateClient);

  const [connections, setConnections] = useState<DBConnection[]>([]);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    if (bridgeConnected && getConnections) {
      getConnections().then(setConnections).catch(() => setConnections([]));
    }
  }, [bridgeConnected, getConnections]);

  const connection = connections.find((c) => c.id === client?.connectionId);

  const handleTest = async () => {
    if (!testConnection || !connection) return;
    setTesting(true);
    try {
      const result = await testConnection(toConnectionInput(connection));
      setTestResult(result);
    } catch {
      setTestResult({ ok: false, message: 'Connection test failed' });
    } finally {
      setTesting(false);
    }
  };

  const handleRefreshChannels = async () => {
    if (!getChannels || !client?.connectionId) return;
    try {
      const channels = await getChannels(client.connectionId);
      updateClient(client.id, { channels });
      toast(`Pulled ${channels.length} channels`, COLOR_SUCCESS, '\u{1F4E1}');
    } catch {
      toast('Failed to pull channels', COLOR_DANGER, '⚠️');
    }
  };

  if (!client) {
    return (
      <div style={{ color: theme.textMuted, padding: 24 }}>
        This instance has no client configured yet — provisioning seeds it.
      </div>
    );
  }

  const card: React.CSSProperties = {
    background: theme.bgCard, border: `1px solid ${theme.border}`,
    borderRadius: 12, padding: '18px 22px', marginBottom: 16,
  };
  const label: React.CSSProperties = {
    fontSize: 10, fontFamily: FONT_MONO, fontWeight: 700, letterSpacing: 1,
    textTransform: 'uppercase', color: theme.textMuted, marginBottom: 8,
  };

  return (
    <div style={{ maxWidth: 680 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <span style={{ width: 14, height: 14, borderRadius: '50%', background: client.color }} />
        <h2 style={{ fontFamily: FONT_HEADING, fontSize: 22, margin: 0, color: theme.text }}>{client.name}</h2>
      </div>

      <div style={card}>
        <div style={label}>WHATS'ON connection</div>
        {connection ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, color: theme.text }}>{connection.name}</span>
            <span style={{ fontFamily: FONT_MONO, fontSize: 12, color: theme.textMuted }}>
              {connection.type} · {connection.host}:{connection.port}/{connection.service}
            </span>
            {permissions.canDelete && (
              <button
                onClick={handleTest}
                disabled={testing || !bridgeConnected}
                style={{ marginLeft: 'auto', padding: '6px 14px', borderRadius: 6, border: `1px solid ${theme.border}`, background: 'transparent', color: theme.textSecondary, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
              >
                {testing ? 'Testing…' : 'Test connection'}
              </button>
            )}
          </div>
        ) : (
          <div style={{ color: theme.textMuted, fontSize: 13 }}>
            {bridgeConnected ? 'No connection bound — contact your Mediagenix operator.' : 'Connect to the bridge to see connection details.'}
          </div>
        )}
        {testResult && (
          <div style={{ marginTop: 10, fontSize: 12.5, color: testResult.ok ? COLOR_SUCCESS : COLOR_DANGER }}>
            {testResult.ok ? '✓' : '✕'} {testResult.message}
          </div>
        )}
      </div>

      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'baseline' }}>
          <div style={label}>Channels ({client.channels.length})</div>
          {permissions.canDelete && (
            <button
              onClick={handleRefreshChannels}
              disabled={!bridgeConnected || !client.connectionId}
              style={{ marginLeft: 'auto', padding: '6px 14px', borderRadius: 6, border: `1px solid ${theme.border}`, background: 'transparent', color: theme.textSecondary, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
            >
              Refresh from database
            </button>
          )}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
          {client.channels.length === 0
            ? <span style={{ color: theme.textMuted, fontSize: 13 }}>No channels pulled yet.</span>
            : client.channels.map((ch) => (
              <span key={ch.id} style={{ padding: '4px 12px', borderRadius: 999, border: `1px solid ${theme.border}`, fontSize: 12, color: theme.textSecondary }}>
                {ch.name}
              </span>
            ))}
        </div>
      </div>

      {bridgeConnected && (
        <div style={card}>
          <AgentsPanel api={ownAgentsApi} canManage={permissions.canDelete} canEnrol={entitled('agents')} theme={theme} />
        </div>
      )}
    </div>
  );
}
