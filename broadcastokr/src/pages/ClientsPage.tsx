import { useState, useEffect, useCallback } from 'react';
import { useTheme } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';
import { useActivityLog } from '../context/ActivityLogContext';
import { useAuth } from '../context/AuthContext';
import { useStore } from '../store/store';
import { ClientModal } from '../components/clients/ClientModal';
import { Modal } from '../components/ui/Modal';
import { PillBadge } from '../components/ui/PillBadge';
import {
  PRIMARY_COLOR,
  COLOR_SUCCESS,
  COLOR_DANGER,
  COLOR_WARNING,
  FONT_HEADING,
  FONT_BODY,
  FONT_MONO,
} from '../constants/config';
import { buttonStyle } from '../styles/formStyles';
import type { Client } from '../types';
import type { DBConnection } from '../hooks/useBridge';

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

interface ClientsPageProps {
  bridgeConnected?: boolean;
  bridgeRunning?: boolean;
  testConnection?: (conn: Omit<DBConnection, 'id'>) => Promise<{ ok: boolean; message: string }>;
  getConnections?: () => Promise<DBConnection[]>;
  getChannels?: (connectionId: string) => Promise<Array<{ id: string; name: string; internalValue?: string; channelKind?: string }>>;
  saveConnection?: (conn: DBConnection) => Promise<{ ok: boolean; connection: DBConnection }>;
  onStartBridge?: () => Promise<{ ok: boolean; message: string }>;
  onStopBridge?: () => Promise<{ ok: boolean; message: string }>;
}

type HealthStatus = 'untested' | 'ok' | 'failed' | 'pending';

function toConnectionInput({ id, ...connection }: DBConnection): Omit<DBConnection, 'id'> {
  void id;
  return connection;
}

function HealthDot({ status }: { status: HealthStatus }) {
  const color =
    status === 'ok'
      ? COLOR_SUCCESS
      : status === 'failed'
      ? COLOR_DANGER
      : status === 'pending'
      ? COLOR_WARNING
      : '#888';
  const title =
    status === 'ok'
      ? 'Connection OK'
      : status === 'failed'
      ? 'Connection failed'
      : status === 'pending'
      ? 'Testing…'
      : 'Not tested';
  return (
    <span
      title={title}
      style={{
        display: 'inline-block',
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: color,
        flexShrink: 0,
      }}
    />
  );
}

interface DeleteConfirmModalProps {
  open: boolean;
  client: Client | null;
  goalCount: number;
  onClose: () => void;
  onConfirm: (cascade: boolean) => void;
  theme: ReturnType<typeof useTheme>['theme'];
}

function DeleteConfirmModal({ open, client, goalCount, onClose, onConfirm, theme }: DeleteConfirmModalProps) {
  if (!client) return null;
  return (
    <Modal open={open} onClose={onClose} title="Delete Client" theme={theme} width={440}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <p style={{ fontSize: 13, color: theme.text, margin: 0 }}>
          Delete <strong style={{ fontFamily: FONT_HEADING }}>{client.name}</strong>?
          {goalCount > 0 && (
            <> This client has <strong>{goalCount}</strong> materialized goal{goalCount !== 1 ? 's' : ''}.</>
          )}
        </p>
        {goalCount > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              onClick={() => onConfirm(true)}
              style={{
                ...buttonStyle(COLOR_DANGER),
                textAlign: 'left',
                padding: '10px 14px',
              }}
            >
              <span style={{ display: 'block', fontWeight: 700, marginBottom: 2 }}>Delete with goals</span>
              <span style={{ fontSize: 11, opacity: 0.85, fontWeight: 400 }}>
                Permanently removes the client and all {goalCount} associated goal{goalCount !== 1 ? 's' : ''}.
              </span>
            </button>
            <button
              onClick={() => onConfirm(false)}
              style={{
                ...buttonStyle(COLOR_WARNING),
                textAlign: 'left',
                padding: '10px 14px',
                color: '#fff',
              }}
            >
              <span style={{ display: 'block', fontWeight: 700, marginBottom: 2 }}>Keep goals as standalone</span>
              <span style={{ fontSize: 11, opacity: 0.85, fontWeight: 400 }}>
                Removes the client but keeps goals (unlinked from any client or template).
              </span>
            </button>
          </div>
        )}
        {goalCount === 0 && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button
              onClick={onClose}
              style={{ ...buttonStyle(theme.bgMuted as string), color: theme.textSecondary, background: theme.bgMuted }}
            >
              Cancel
            </button>
            <button onClick={() => onConfirm(true)} style={buttonStyle(COLOR_DANGER)}>
              Delete
            </button>
          </div>
        )}
        {goalCount > 0 && (
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={onClose}
              style={{ ...buttonStyle(theme.bgMuted as string), color: theme.textSecondary, background: theme.bgMuted }}
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ---- Client Row (expandable) ----

interface ClientRowProps {
  client: Client;
  health: HealthStatus;
  connections: DBConnection[];
  goalCount: number;
  bridgeConnected: boolean;
  canCheckIn: boolean;
  setMonitor: (type: 'goal' | 'client', id: string, days: number | null) => void;
  testConnection?: (conn: Omit<DBConnection, 'id'>) => Promise<{ ok: boolean; message: string }>;
  getChannels?: (connectionId: string) => Promise<Array<{ id: string; name: string; internalValue?: string; channelKind?: string }>>;
  onEdit: (client: Client) => void;
  onDelete: (client: Client) => void;
  onUpdateClient: (id: string, patch: Partial<Client>) => void;
  onHealthUpdate: (clientId: string, status: HealthStatus) => void;
  theme: ReturnType<typeof useTheme>['theme'];
}

function ClientRow({
  client,
  health,
  connections,
  goalCount,
  bridgeConnected,
  canCheckIn,
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
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Main Settings Page ----

export function ClientsPage({
  bridgeConnected = false,
  bridgeRunning = false,
  testConnection,
  getConnections,
  getChannels,
  saveConnection,
  onStartBridge,
  onStopBridge,
}: ClientsPageProps) {
  const [bridgeAction, setBridgeAction] = useState('');
  const { theme } = useTheme();
  const { toast } = useToast();
  const { logAction } = useActivityLog();
  const { currentUser, permissions } = useAuth();
  const clients = useStore((s) => s.clients);
  const goalTemplates = useStore((s) => s.goalTemplates);
  const goals = useStore((s) => s.goals);
  const addClient = useStore((s) => s.addClient);
  const updateClient = useStore((s) => s.updateClient);
  const deleteClient = useStore((s) => s.deleteClient);
  const setMonitor = useStore((s) => s.setMonitor);

  const [connections, setConnections] = useState<DBConnection[]>([]);
  const [health, setHealth] = useState<Record<string, HealthStatus>>({});
  const [modalOpen, setModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<Client | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  // Fetch connections on mount
  useEffect(() => {
    if (!getConnections) return;
    getConnections()
      .then(setConnections)
      .catch(() => {/* bridge not running */});
  }, [getConnections]);

  // Test each client's connection health when bridge is connected
  const testClientHealth = useCallback(async () => {
    if (!bridgeConnected || !testConnection || clients.length === 0) return;
    const connectionMap = new Map(connections.map((c) => [c.id, c]));

    // Mark all as pending first
    setHealth((prev) => {
      const next = { ...prev };
      clients.forEach((client) => { next[client.id] = 'pending'; });
      return next;
    });

    const results: Record<string, HealthStatus> = {};
    await Promise.all(
      clients.map(async (client) => {
        const conn = connectionMap.get(client.connectionId);
        if (!conn) {
          results[client.id] = 'untested';
          return;
        }
        try {
          const result = await testConnection(toConnectionInput(conn));
          results[client.id] = result.ok ? 'ok' : 'failed';
        } catch {
          results[client.id] = 'failed';
        }
      }),
    );
    setHealth(results);
  }, [bridgeConnected, testConnection, clients, connections]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void testClientHealth();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [testClientHealth]);

  function goalCountFor(clientId: string) {
    return goals.filter((g) => g.clientIds?.includes(clientId)).length;
  }

  function handleAddClient() {
    setEditingClient(undefined);
    setModalOpen(true);
  }

  function handleEditClient(client: Client) {
    setEditingClient(client);
    setModalOpen(true);
  }

  function handleSaveClient(client: Client) {
    if (editingClient) {
      const connectionChanged = editingClient.connectionId !== client.connectionId;
      updateClient(client.id, {
        name: client.name,
        color: client.color,
        connectionId: client.connectionId,
        tags: client.tags,
        channels: connectionChanged ? [] : client.channels,
        sqlOverrides: client.sqlOverrides,
      });
      toast(`Client "${client.name}" updated`);
    } else {
      addClient(client);
      toast(`Client "${client.name}" added`);
      logAction(`Created client: ${client.name}`, currentUser.name, PRIMARY_COLOR);
    }
  }

  function handleDeleteClick(client: Client) {
    setDeleteTarget(client);
    setDeleteModalOpen(true);
  }

  function handleDeleteConfirm(cascade: boolean) {
    if (!deleteTarget) return;
    const deletedName = deleteTarget.name;
    deleteClient(deleteTarget.id, cascade);
    toast(
      cascade
        ? `Client "${deletedName}" and its goals deleted`
        : `Client "${deletedName}" deleted (goals kept)`,
      cascade ? COLOR_DANGER : COLOR_WARNING,
    );
    logAction(`Deleted client: ${deletedName}`, currentUser.name, COLOR_DANGER);
    setDeleteModalOpen(false);
    setDeleteTarget(null);
  }

  return (
    <div style={{ padding: 0, maxWidth: 900 }}>
      {/* Bridge Status */}
      <div
        style={{
          background: theme.bgCard,
          border: `1px solid ${theme.border}`,
          borderRadius: 12,
          padding: '14px 20px',
          marginBottom: 20,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div
          style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: bridgeConnected ? COLOR_SUCCESS : COLOR_DANGER,
            boxShadow: bridgeConnected ? `0 0 6px ${COLOR_SUCCESS}` : 'none',
            flexShrink: 0,
          }}
        />
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>
            Bridge Service
          </span>
          <span style={{ fontSize: 12, color: theme.textMuted, marginLeft: 8 }}>
            {bridgeConnected ? 'Connected' : bridgeRunning ? 'Starting...' : 'Offline'}
          </span>
        </div>
        {bridgeAction && (
          <span style={{ fontSize: 11, color: theme.textMuted, fontFamily: FONT_MONO }}>{bridgeAction}</span>
        )}
        {bridgeConnected || bridgeRunning ? (
          <button
            onClick={async () => {
              if (!onStopBridge) return;
              setBridgeAction('Stopping...');
              const r = await onStopBridge();
              setBridgeAction(r.message);
              setTimeout(() => setBridgeAction(''), 3000);
            }}
            style={{
              padding: '5px 14px',
              borderRadius: 6,
              border: `1px solid ${COLOR_DANGER}4D`,
              background: `${COLOR_DANGER}18`,
              color: COLOR_DANGER,
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: FONT_BODY,
            }}
          >
            Stop Bridge
          </button>
        ) : (
          <button
            onClick={async () => {
              if (!onStartBridge) return;
              setBridgeAction('Starting...');
              const r = await onStartBridge();
              setBridgeAction(r.message);
              setTimeout(() => setBridgeAction(''), 3000);
              if (r.ok && getConnections) {
                getConnections().then(setConnections).catch(() => {});
              }
            }}
            style={{
              padding: '5px 14px',
              borderRadius: 6,
              border: 'none',
              background: COLOR_SUCCESS,
              color: '#fff',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: FONT_BODY,
            }}
          >
            {onStartBridge ? 'Start Bridge' : 'Run: npm run bridge'}
          </button>
        )}
      </div>

      {/* Clients section */}
      <div
        style={{
          background: theme.bgCard,
          border: `1px solid ${theme.border}`,
          borderRadius: 12,
          padding: 20,
        }}
      >
        {/* Section header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 16,
          }}
        >
          <div>
            <h2
              style={{
                fontFamily: FONT_HEADING,
                fontSize: 16,
                fontWeight: 700,
                color: theme.text,
                margin: 0,
              }}
            >
              Clients
            </h2>
            <p style={{ fontSize: 12, color: theme.textMuted, margin: '3px 0 0 0', fontFamily: FONT_BODY }}>
              {clients.length} client{clients.length !== 1 ? 's' : ''} configured
            </p>
          </div>
          <button onClick={handleAddClient} style={buttonStyle(PRIMARY_COLOR)}>
            + Add Client
          </button>
        </div>

        {/* Empty state */}
        {clients.length === 0 && (
          <div
            style={{
              textAlign: 'center',
              padding: '48px 24px',
              border: `1px dashed ${theme.border}`,
              borderRadius: 10,
              color: theme.textMuted,
            }}
          >
            <div style={{ fontSize: 28, marginBottom: 10 }}>&#127970;</div>
            <p style={{ fontSize: 13, margin: 0, fontFamily: FONT_BODY }}>
              No clients configured. Add a client to manage database connections and channels.
            </p>
            <button onClick={handleAddClient} style={{ ...buttonStyle(PRIMARY_COLOR), marginTop: 16 }}>
              + Add Client
            </button>
          </div>
        )}

        {/* Client rows */}
        {clients.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {clients.map((client) => (
              <ClientRow
                key={client.id}
                client={client}
                health={health[client.id] ?? 'untested'}
                connections={connections}
                goalCount={goalCountFor(client.id)}
                bridgeConnected={bridgeConnected}
                canCheckIn={permissions.canCheckIn}
                setMonitor={setMonitor}
                testConnection={testConnection}
                getChannels={getChannels}
                onEdit={handleEditClient}
                onDelete={handleDeleteClick}
                onUpdateClient={updateClient}
                onHealthUpdate={(clientId, status) => setHealth((prev) => ({ ...prev, [clientId]: status }))}
                theme={theme}
              />
            ))}
          </div>
        )}
      </div>

      {/* Client modal (add / edit) */}
      <ClientModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        theme={theme}
        client={editingClient}
        connections={connections}
        templates={goalTemplates}
        onSave={handleSaveClient}
        saveConnection={saveConnection}
        testConnection={testConnection}
        onConnectionCreated={() => {
          if (getConnections) {
            getConnections().then(setConnections).catch(() => {});
          }
        }}
      />

      {/* Delete confirmation modal */}
      <DeleteConfirmModal
        open={deleteModalOpen}
        client={deleteTarget}
        goalCount={deleteTarget ? goalCountFor(deleteTarget.id) : 0}
        onClose={() => { setDeleteModalOpen(false); setDeleteTarget(null); }}
        onConfirm={handleDeleteConfirm}
        theme={theme}
      />
    </div>
  );
}
