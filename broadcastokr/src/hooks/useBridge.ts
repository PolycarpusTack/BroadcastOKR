import { useState, useEffect, useCallback, useRef } from 'react';
import { BRIDGE_URL, BRIDGE_POLL_INTERVAL_MS } from '../constants/config';
import type { Goal, SyncStatus } from '../types';

// Electron API type (available when running in Electron)
interface ElectronAPI {
  isElectron: boolean;
  platform: string;
  bridgeStart: () => Promise<{ ok: boolean; message: string }>;
  bridgeStop: () => Promise<{ ok: boolean; message: string }>;
  bridgeStatus: () => Promise<{ running: boolean }>;
  onBridgeStatus: (callback: (data: { running: boolean; error?: string }) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export interface LiveKPI {
  id: string;
  name: string;
  unit: string;
  direction: 'hi' | 'lo';
  target: number;
  current: number;
  trend: number[];
  lastUpdated: string;
  error?: string;
}

export interface KPITemplate {
  name: string;
  description: string;
  sql: string;
  unit: string;
  direction: 'hi' | 'lo';
  target: number;
  timeframeDays?: number;
  dbType?: 'oracle' | 'postgres';
}

export interface KPIDefinition {
  id: string;
  name: string;
  connectionId: string;
  sql: string;
  unit: string;
  direction: 'hi' | 'lo';
  target: number;
  timeframeDays?: number;
  binds?: Record<string, unknown>;
}

export interface DBConnection {
  id: string;
  name: string;
  type: 'oracle' | 'postgres';
  host: string;
  port: number;
  service: string;
  schema: string;
  user: string;
  password: string;
  clientDir?: string;
}

export interface TableInfo {
  TABLE_NAME: string;
  NUM_ROWS: number | null;
}

export interface ColumnInfo {
  COLUMN_NAME: string;
  DATA_TYPE: string;
  DATA_LENGTH: number;
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BRIDGE_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || `HTTP ${res.status}`);
  }
  return res.json();
}

const isElectron = () => !!window.electronAPI?.isElectron;

export interface DriverStatus {
  oracle: boolean;
  postgres: boolean;
}

export function useBridge() {
  const [connected, setConnected] = useState(false);
  const [bridgeRunning, setBridgeRunning] = useState(false);
  const [liveKPIs, setLiveKPIs] = useState<LiveKPI[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [drivers, setDrivers] = useState<DriverStatus>({ oracle: false, postgres: false });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const krSyncRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Check bridge health via HTTP
  const checkHealth = useCallback(async () => {
    try {
      const health = await apiFetch<{ drivers: DriverStatus }>('/api/health');
      setConnected(true);
      setBridgeRunning(true);
      if (health.drivers) setDrivers(health.drivers);
      return true;
    } catch {
      setConnected(false);
      if (!isElectron()) setBridgeRunning(false);
      return false;
    }
  }, []);

  // Poll all KPIs
  const pollKPIs = useCallback(async () => {
    try {
      const data = await apiFetch<LiveKPI[]>('/api/kpi/poll');
      setLiveKPIs(prev => {
        if (JSON.stringify(prev) === JSON.stringify(data)) return prev;
        return data;
      });
    } catch {
      // Bridge might be down
    }
  }, []);

  // Start polling interval
  const startPolling = useCallback((intervalMs = BRIDGE_POLL_INTERVAL_MS) => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    pollKPIs();
    intervalRef.current = setInterval(pollKPIs, intervalMs);
  }, [pollKPIs]);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (krSyncRef.current) {
      clearInterval(krSyncRef.current);
      krSyncRef.current = null;
    }
  }, []);

  /** Auto-sync all live KRs by reading goals from the store and calling execute-batch */
  const autoSyncLiveKRs = useCallback(async (
    getGoals: () => Goal[],
    onResults: (results: Array<{ goalId: string; krIndex: number; current?: number; error?: string; status: SyncStatus }>) => void,
  ) => {
    const goals = getGoals();
    const queries: Array<{ goalId: string; krIndex: number; connectionId: string; sql: string; timeframeDays?: number }> = [];
    for (const goal of goals) {
      goal.keyResults.forEach((kr, krIndex) => {
        if (kr.liveConfig) {
          queries.push({
            goalId: goal.id,
            krIndex,
            connectionId: kr.liveConfig.connectionId,
            sql: kr.liveConfig.sql,
            timeframeDays: kr.liveConfig.timeframeDays,
          });
        }
      });
    }
    if (queries.length === 0) return;
    try {
      const { results } = await apiFetch<{
        results: Array<{ goalId: string; krIndex: number; status: 'ok' | 'error' | 'timeout' | 'no_data'; current?: number; error?: string }>;
      }>('/api/kpi/execute-batch', {
        method: 'POST',
        body: JSON.stringify({ queries }),
      });
      onResults(results.map((r) => ({ ...r, status: r.status as SyncStatus })));
    } catch {
      // Bridge might be down — skip this cycle
    }
  }, []);

  /** Start periodic auto-sync for live KRs */
  const startKRAutoSync = useCallback((
    getGoals: () => Goal[],
    onResults: (results: Array<{ goalId: string; krIndex: number; current?: number; error?: string; status: SyncStatus }>) => void,
    intervalMs = BRIDGE_POLL_INTERVAL_MS,
  ) => {
    if (krSyncRef.current) clearInterval(krSyncRef.current);
    // Initial sync
    autoSyncLiveKRs(getGoals, onResults);
    // Periodic sync
    krSyncRef.current = setInterval(() => autoSyncLiveKRs(getGoals, onResults), intervalMs);
  }, [autoSyncLiveKRs]);

  // Start bridge service (Electron: via IPC, Web: just check health)
  const startBridge = useCallback(async (): Promise<{ ok: boolean; message: string }> => {
    if (isElectron()) {
      const result = await window.electronAPI!.bridgeStart();
      if (result.ok) {
        // Retry health check up to 3 times with increasing delay
        let ok = false;
        for (const delay of [1500, 2000, 3000]) {
          await new Promise((r) => setTimeout(r, delay));
          ok = await checkHealth();
          if (ok) break;
        }
        if (ok) startPolling();
      }
      return result;
    }
    // In web mode, just try to connect (user must start bridge manually)
    const ok = await checkHealth();
    if (ok) {
      startPolling();
      return { ok: true, message: 'Connected to bridge' };
    }
    return { ok: false, message: 'Bridge not reachable. Start it with: npm run bridge' };
  }, [checkHealth, startPolling]);

  // Stop bridge service (Electron only)
  const stopBridge = useCallback(async (): Promise<{ ok: boolean; message: string }> => {
    stopPolling();
    if (isElectron()) {
      const result = await window.electronAPI!.bridgeStop();
      setConnected(false);
      setBridgeRunning(false);
      setLiveKPIs([]);
      return result;
    }
    return { ok: false, message: 'Can only stop bridge from Electron app' };
  }, [stopPolling]);

  // Manual sync — poll all KPIs immediately
  const syncNow = useCallback(async () => {
    setSyncing(true);
    try {
      await pollKPIs();
    } finally {
      setSyncing(false);
    }
  }, [pollKPIs]);

  // Listen for bridge status changes from Electron main process
  useEffect(() => {
    if (isElectron()) {
      const cleanup = window.electronAPI!.onBridgeStatus((data) => {
        setBridgeRunning(data.running);
        if (!data.running) {
          setConnected(false);
          setLiveKPIs([]);
          stopPolling();
        }
      });
      // Check initial status
      window.electronAPI!.bridgeStatus().then((s) => setBridgeRunning(s.running));
      return cleanup;
    }
  }, [stopPolling]);

  // On mount, check health and start polling if bridge is reachable
  useEffect(() => {
    checkHealth().then((ok) => {
      if (ok) startPolling();
    });
    return () => stopPolling();
  }, [checkHealth, startPolling, stopPolling]);

  // API methods
  const testConnection = useCallback(async (conn: Omit<DBConnection, 'id'>) => {
    return apiFetch<{ ok: boolean; message: string }>('/api/test-connection', {
      method: 'POST',
      body: JSON.stringify(conn),
    });
  }, []);

  const getTables = useCallback(async (connectionId: string) => {
    return apiFetch<TableInfo[]>('/api/tables', {
      method: 'POST',
      body: JSON.stringify({ connectionId }),
    });
  }, []);

  const getColumns = useCallback(async (connectionId: string, tableName: string) => {
    return apiFetch<ColumnInfo[]>('/api/columns', {
      method: 'POST',
      body: JSON.stringify({ connectionId, tableName }),
    });
  }, []);

  const previewQuery = useCallback(async (connectionId: string, sql: string) => {
    return apiFetch<Record<string, unknown>[]>('/api/preview-query', {
      method: 'POST',
      body: JSON.stringify({ connectionId, sql }),
    });
  }, []);

  const getTemplates = useCallback(async () => {
    return apiFetch<KPITemplate[]>('/api/kpi/templates');
  }, []);

  const saveKPI = useCallback(async (kpi: KPIDefinition) => {
    const result = await apiFetch<{ ok: boolean; kpi: KPIDefinition }>('/api/kpis', {
      method: 'POST',
      body: JSON.stringify(kpi),
    });
    await pollKPIs();
    return result;
  }, [pollKPIs]);

  const deleteKPI = useCallback(async (id: string) => {
    await apiFetch(`/api/kpis/${id}`, { method: 'DELETE' });
    setLiveKPIs((prev) => prev.filter((k) => k.id !== id));
  }, []);

  const getKPIDefinitions = useCallback(async () => {
    return apiFetch<KPIDefinition[]>('/api/kpis');
  }, []);

  const getChannels = useCallback(async (connectionId: string) => {
    return apiFetch<Array<{ id: string; name: string; internalValue?: string; channelKind?: string }>>('/api/channels', {
      method: 'POST',
      body: JSON.stringify({ connectionId }),
    });
  }, []);

  const getConnections = useCallback(async () => {
    return apiFetch<DBConnection[]>('/api/connections');
  }, []);

  const saveConnection = useCallback(async (conn: DBConnection) => {
    return apiFetch<{ ok: boolean; connection: DBConnection }>('/api/connections', {
      method: 'POST',
      body: JSON.stringify(conn),
    });
  }, []);

  const deleteConnection = useCallback(async (id: string) => {
    await apiFetch(`/api/connections/${id}`, { method: 'DELETE' });
  }, []);

  /** Execute batch of KR queries for live goal syncing */
  const executeBatch = useCallback(async (queries: Array<{
    goalId: string;
    krIndex: number;
    connectionId: string;
    sql: string;
    binds?: Record<string, unknown>;
    timeframeDays?: number;
  }>) => {
    return apiFetch<{
      results: Array<{
        goalId: string;
        krIndex: number;
        status: 'ok' | 'error' | 'timeout' | 'no_data';
        current?: number;
        error?: string;
      }>;
    }>('/api/kpi/execute-batch', {
      method: 'POST',
      body: JSON.stringify({ queries }),
    });
  }, []);

  return {
    connected,
    bridgeRunning,
    liveKPIs,
    syncing,
    drivers,
    checkHealth,
    pollKPIs,
    startPolling,
    stopPolling,
    startBridge,
    stopBridge,
    syncNow,
    startKRAutoSync,
    testConnection,
    getTables,
    getColumns,
    previewQuery,
    getChannels,
    getTemplates,
    saveKPI,
    deleteKPI,
    getKPIDefinitions,
    getConnections,
    saveConnection,
    deleteConnection,
    executeBatch,
  };
}
