import { useState, useEffect, useCallback } from 'react';
import { useTheme } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';
import { useActivityLog } from '../context/ActivityLogContext';
import { useAuth } from '../context/AuthContext';
import { useStore } from '../store/store';
import { useShallow } from 'zustand/react/shallow';
import { ClientModal } from '../components/clients/ClientModal';
import { ClientRow } from '../components/clients/ClientRow';
import { toConnectionInput } from '../components/clients/ClientRow';
import { DeleteConfirmModal } from '../components/clients/DeleteConfirmModal';
import type { HealthStatus } from '../components/clients/HealthDot';
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
  const {
    clients, goalTemplates, goals,
    addClient, updateClient, deleteClient, setMonitor,
  } = useStore(
    useShallow((s) => ({
      clients: s.clients,
      goalTemplates: s.goalTemplates,
      goals: s.goals,
      addClient: s.addClient,
      updateClient: s.updateClient,
      deleteClient: s.deleteClient,
      setMonitor: s.setMonitor,
    })),
  );

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
          {permissions.canCreate && (
            <button onClick={handleAddClient} style={buttonStyle(PRIMARY_COLOR)}>
              + Add Client
            </button>
          )}
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
            {permissions.canCreate && (
              <button onClick={handleAddClient} style={{ ...buttonStyle(PRIMARY_COLOR), marginTop: 16 }}>
                + Add Client
              </button>
            )}
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
                canDelete={permissions.canDelete}
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
