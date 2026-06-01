import { useState, memo } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { PillBadge } from '../ui/PillBadge';
import { HealthDot } from './HealthDot';
import type { HealthStatus } from './HealthDot';
import {
  PRIMARY_COLOR,
  COLOR_DANGER,
  COLOR_WARNING,
  FONT_HEADING,
  FONT_BODY,
  FONT_MONO,
} from '../../constants/config';
import { buttonStyle } from '../../styles/formStyles';
import type { Client } from '../../types';
import type { DBConnection } from '../../hooks/useBridge';

const CHANNEL_PALETTE = [
  '#3805E3',
  '#2DD4BF',
  '#F59E0B',
  '#F87171',
  '#60A5FA',
  '#A78BFA',
  '#FB923C',
  '#34D399',
  '#F472B6',
  '#818CF8',
];

export function toConnectionInput({ id, ...connection }: DBConnection): Omit<DBConnection, 'id'> {
  void id;
  return connection;
}

export interface ClientRowProps {
  client: Client;
  health: HealthStatus;
  connections: DBConnection[];
  goalCount: number;
  bridgeConnected: boolean;
  canCheckIn: boolean;
  canDelete: boolean;
  setMonitor: (type: 'goal' | 'client', id: string, days: number | null) => void;
  testConnection?: (conn: Omit<DBConnection, 'id'>) => Promise<{ ok: boolean; message: string }>;
  getChannels?: (connectionId: string) => Promise<Array<{ id: string; name: string; internalValue?: string; channelKind?: string }>>;
  onEdit: (client: Client) => void;
  onDelete: (client: Client) => void;
  onUpdateClient: (id: string, patch: Partial<Client>) => void;
  onHealthUpdate: (clientId: string, status: HealthStatus) => void;
  theme: ReturnType<typeof useTheme>['theme'];
}

export const ClientRow = memo(function ClientRow({
  client,
  health,
  connections,
  goalCount,
  bridgeConnected,
  canCheckIn,
  canDelete,
  setMonitor,
  testConnection,
  getChannels,
  onEdit,
  onDelete,
  onUpdateClient,
  onHealthUpdate,
  theme,
}: ClientRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [channelLoading, setChannelLoading] = useState(false);
  const [monitorOpen, setMonitorOpen] = useState(false);
  const { toast } = useToast();

  const connection = connections.find((c) => c.id === client.connectionId);
  const channels = client.channels ?? [];
  const channelCount = channels.length;

  async function handleRefreshChannels() {
    if (!getChannels || !client.connectionId) return;
    setChannelLoading(true);
    try {
      const raw = await getChannels(client.connectionId);
      const withColors = raw.map((ch, i) => ({
        ...ch,
        color: CHANNEL_PALETTE[i % CHANNEL_PALETTE.length],
      }));
      onUpdateClient(client.id, { channels: withColors });
    } catch (err) {
      const error = err as Error | null;
      toast('Failed to pull channels: ' + (error?.message || 'Unknown error'), COLOR_DANGER, '❌');
    } finally {
      setChannelLoading(false);
    }
  }

  async function handleTestConnection() {
    if (!testConnection || !connection) return;
    onHealthUpdate(client.id, 'pending');
    try {
      const result = await testConnection(toConnectionInput(connection));
      onHealthUpdate(client.id, result.ok ? 'ok' : 'failed');
    } catch {
      onHealthUpdate(client.id, 'failed');
    }
  }

  const rowBorderColor = expanded ? PRIMARY_COLOR + '60' : theme.border;

  return (
    <div
      style={{
        border: `1px solid ${rowBorderColor}`,
        borderRadius: 10,
        overflow: 'hidden',
        transition: 'border-color .15s',
      }}
    >
      {/* Collapsed row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '12px 16px',
          background: theme.bgCard,
        }}
      >
        {/* Color dot */}
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: client.color,
            flexShrink: 0,
          }}
        />
        {/* Health dot */}
        <HealthDot status={health} />
        {/* Name */}
        <span
          style={{
            fontFamily: FONT_HEADING,
            fontWeight: 700,
            fontSize: 14,
            color: theme.text,
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {client.name}
        </span>
        {/* Channel count */}
        <span
          style={{
            fontSize: 11,
            fontFamily: FONT_MONO,
            color: channelCount === 0 ? COLOR_WARNING : theme.textMuted,
            flexShrink: 0,
          }}
        >
          {channelCount === 0 ? 'No channels' : `${channelCount} channel${channelCount !== 1 ? 's' : ''}`}
        </span>
        {/* Edit button */}
        <button
          onClick={(e) => { e.stopPropagation(); onEdit(client); }}
          style={{
            padding: '4px 10px',
            borderRadius: 6,
            border: `1px solid ${theme.border}`,
            background: 'transparent',
            color: theme.textSecondary,
            fontSize: 11,
            fontFamily: FONT_BODY,
            fontWeight: 600,
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          Edit
        </button>
        {/* Expand/collapse arrow */}
        <button
          onClick={() => setExpanded((v) => !v)}
          aria-label={expanded ? 'Collapse' : 'Expand'}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: theme.textMuted,
            fontSize: 14,
            padding: '2px 4px',
            lineHeight: 1,
            flexShrink: 0,
          }}
        >
          {expanded ? '▲' : '▼'}
        </button>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div
          style={{
            background: theme.bg,
            borderTop: `1px solid ${theme.border}`,
            padding: '16px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
          }}
        >
          {/* Database Connection subsection */}
          <div>
            <div
              style={{
                fontSize: '9.5px',
                fontFamily: FONT_MONO,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '1px',
                color: theme.textMuted,
                marginBottom: 10,
              }}
            >
              Database Connection
            </div>
            {connection ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  flexWrap: 'wrap',
                }}
              >
                <HealthDot status={health} />
                <span
                  style={{
                    fontWeight: 700,
                    fontSize: 13,
                    color: theme.text,
                    fontFamily: FONT_HEADING,
                  }}
                >
                  {connection.name}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontFamily: FONT_MONO,
                    color: theme.textMuted,
                  }}
                >
                  {connection.type} · {connection.host}:{connection.port} · {connection.schema}
                </span>
                <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
                  {testConnection && (
                    <button
                      onClick={handleTestConnection}
                      style={{
                        padding: '4px 10px',
                        borderRadius: 6,
                        border: `1px solid ${theme.border}`,
                        background: 'transparent',
                        color: theme.textSecondary,
                        fontSize: 11,
                        fontFamily: FONT_BODY,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Test
                    </button>
                  )}
                  <button
                    onClick={() => onEdit(client)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 6,
                      border: `1px solid ${theme.border}`,
                      background: 'transparent',
                      color: theme.textSecondary,
                      fontSize: 11,
                      fontFamily: FONT_BODY,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Configure
                  </button>
                </div>
              </div>
            ) : (
              <div
                style={{
                  fontSize: 12,
                  color: COLOR_WARNING,
                  fontFamily: FONT_BODY,
                }}
              >
                No connection configured.{' '}
                <button
                  onClick={() => onEdit(client)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: PRIMARY_COLOR,
                    cursor: 'pointer',
                    fontSize: 12,
                    fontFamily: FONT_BODY,
                    fontWeight: 600,
                    padding: 0,
                  }}
                >
                  Configure now
                </button>
              </div>
            )}
          </div>

          {/* Monitoring subsection */}
          {canCheckIn && (() => {
            const monitorActive = !!client.monitorUntil && new Date(client.monitorUntil) > new Date();
            const fmtDate = (d: string) =>
              new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            return (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{
                  fontSize: '9.5px', fontFamily: FONT_MONO, fontWeight: 700,
                  textTransform: 'uppercase', letterSpacing: '1px', color: theme.textMuted,
                }}>
                  Monitoring
                </span>
                {monitorActive ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <PillBadge
                      label={`Monitoring all goals until ${fmtDate(client.monitorUntil!)}`}
                      color={COLOR_WARNING}
                    />
                    <button
                      onClick={() => setMonitor('client', client.id, null)}
                      style={{
                        padding: '1px 5px', borderRadius: 4, border: `1px solid ${COLOR_WARNING}`,
                        background: 'transparent', color: COLOR_WARNING, fontSize: 9,
                        fontWeight: 700, cursor: 'pointer', lineHeight: 1,
                      }}
                    >
                      ✕
                    </button>
                  </span>
                ) : monitorOpen ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {[1, 3, 7, 14].map((d) => (
                      <button
                        key={d}
                        onClick={() => { setMonitor('client', client.id, d); setMonitorOpen(false); }}
                        style={{
                          padding: '2px 7px', borderRadius: 4, border: `1px solid ${COLOR_WARNING}`,
                          background: 'transparent', color: COLOR_WARNING, fontSize: 10,
                          fontWeight: 700, cursor: 'pointer', fontFamily: FONT_MONO,
                        }}
                      >
                        {d}d
                      </button>
                    ))}
                    <button
                      onClick={() => setMonitorOpen(false)}
                      style={{
                        padding: '2px 6px', borderRadius: 4, border: `1px solid ${theme.border}`,
                        background: 'transparent', color: theme.textMuted, fontSize: 10,
                        fontWeight: 600, cursor: 'pointer',
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setMonitorOpen(true)}
                    style={{
                      padding: '2px 8px', borderRadius: 4, border: `1px solid ${theme.border}`,
                      background: 'transparent', color: theme.textMuted, fontSize: 10,
                      fontWeight: 600, cursor: 'pointer', fontFamily: FONT_BODY,
                    }}
                  >
                    Monitor
                  </button>
                )}
              </div>
            );
          })()}

          {/* Channels subsection */}
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 10,
              }}
            >
              <div
                style={{
                  fontSize: '9.5px',
                  fontFamily: FONT_MONO,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '1px',
                  color: theme.textMuted,
                }}
              >
                Channels {channelCount > 0 ? `(${channelCount})` : ''}
              </div>
            </div>

            {!connection ? (
              <p style={{ fontSize: 12, color: theme.textMuted, fontFamily: FONT_BODY, margin: 0 }}>
                Fix the database connection first to pull channels.
              </p>
            ) : health === 'failed' ? (
              <p style={{ fontSize: 12, color: COLOR_DANGER, fontFamily: FONT_BODY, margin: 0 }}>
                Connection failed — fix it before pulling channels.
              </p>
            ) : channelCount > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {channels.map((ch) => (
                    <PillBadge
                      key={ch.id}
                      label={ch.name}
                      color={ch.color ?? CHANNEL_PALETTE[0]}
                    />
                  ))}
                </div>
                {getChannels && (
                  <button
                    onClick={handleRefreshChannels}
                    disabled={channelLoading}
                    style={{
                      ...buttonStyle(theme.bgMuted as string, channelLoading),
                      color: theme.textSecondary,
                      background: theme.bgMuted,
                      alignSelf: 'flex-start',
                    }}
                  >
                    {channelLoading ? 'Refreshing…' : 'Refresh'}
                  </button>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 12, color: theme.textMuted, fontFamily: FONT_BODY }}>
                  No channels loaded.
                </span>
                {getChannels && (
                  <button
                    onClick={handleRefreshChannels}
                    disabled={channelLoading || !bridgeConnected}
                    style={buttonStyle(PRIMARY_COLOR, channelLoading || !bridgeConnected)}
                  >
                    {channelLoading ? 'Pulling…' : 'Pull Channels'}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Delete */}
          <div
            style={{
              borderTop: `1px solid ${theme.borderLight}`,
              paddingTop: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span style={{ fontSize: 11, color: theme.textMuted, fontFamily: FONT_BODY }}>
              {goalCount > 0
                ? `${goalCount} materialized goal${goalCount !== 1 ? 's' : ''}`
                : 'No goals yet'}
            </span>
            {canDelete && (
              <button
                onClick={() => onDelete(client)}
                style={{
                  padding: '5px 12px',
                  borderRadius: 6,
                  border: `1px solid ${COLOR_DANGER}40`,
                  background: `${COLOR_DANGER}12`,
                  color: COLOR_DANGER,
                  fontSize: 11,
                  fontFamily: FONT_BODY,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Delete Client
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
});
