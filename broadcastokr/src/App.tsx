import { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import './styles/accessibility.css';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { ErrorBoundary } from './components/ErrorBoundary';
import { KPIConfigModal } from './components/kpi/KPIConfigModal';
const SetupWizard = lazy(() => import('./components/wizard/SetupWizard').then((m) => ({ default: m.SetupWizard })));

// Route pages are code-split so each becomes its own chunk, keeping the
// initial bundle small. Named exports are adapted to default for React.lazy.
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const GoalsPage = lazy(() => import('./pages/GoalsPage').then((m) => ({ default: m.GoalsPage })));
const TasksPage = lazy(() => import('./pages/TasksPage').then((m) => ({ default: m.TasksPage })));
const TeamPage = lazy(() => import('./pages/TeamPage').then((m) => ({ default: m.TeamPage })));
const ReportsPage = lazy(() => import('./pages/ReportsPage').then((m) => ({ default: m.ReportsPage })));
// Fleet pages are excluded from client-edition bundles at build time
// (FLEET_IN_BUILD folds to false), and gated at runtime everywhere else.
const ClientsPage = FLEET_IN_BUILD ? lazy(() => import('./pages/ClientsPage').then((m) => ({ default: m.ClientsPage }))) : null;
const ComparePage = FLEET_IN_BUILD ? lazy(() => import('./pages/ComparePage').then((m) => ({ default: m.ComparePage }))) : null;
// The client edition gets a slim single-tenant settings surface instead
const ClientSettingsPage = !FLEET_IN_BUILD ? lazy(() => import('./pages/ClientSettingsPage').then((m) => ({ default: m.ClientSettingsPage }))) : null;
import { useBridge } from './hooks/useBridge';
import { useAuth } from './context/AuthContext';
import { useTheme } from './context/ThemeContext';
import { useToast } from './context/ToastContext';
import { useStore } from './store/store';
import { COLOR_DANGER, COLOR_WARNING, PRIMARY_COLOR } from './constants/config';
import { performInitialSync, fetchChanges, bridgeFetch } from './store/bridgeSync';
import { useActivityLog } from './context/ActivityLogContext';
import { DeploymentProvider } from './context/DeploymentContext';
import { BUILD_EDITION, FLEET_IN_BUILD, setRuntimeMode, hasFeature, type TenancyMode } from './editions/entitlements';
import { logger } from './utils/logger';
import { useSetupWizard } from './components/wizard/useSetupWizard';

export default function App() {
  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  const [kpiConfigOpen, setKpiConfigOpen] = useState(false);
  const bridge = useBridge();
  const {
    connected,
    bridgeRunning,
    syncing,
    liveKPIs,
    drivers,
    health,
    startBridge,
    stopBridge,
    syncNow,
    testConnection,
    getConnections,
    getChannels,
    saveConnection,
    executeBatch,
    getTables,
    getColumns,
    previewQuery,
    getTemplates,
    saveKPI,
    deleteKPI,
    getKPIDefinitions,
    deleteConnection,
  } = bridge;
  const { theme } = useTheme();
  const { toast } = useToast();
  const { hydrateLog } = useActivityLog();
  const { authStatus, signIn, currentUser } = useAuth();

  // Tenancy: the bridge's health.mode wins over the build-time edition
  const mode: TenancyMode = useMemo(() => {
    const m = health?.mode;
    return m === 'desktop' || m === 'client' || m === 'cockpit' ? m : BUILD_EDITION;
  }, [health?.mode]);
  useEffect(() => { setRuntimeMode(mode); }, [mode]);
  const fleet = hasFeature('fleet', mode);

  // First-run detection for the setup wizard. `null` means "not known yet" —
  // the wizard must never auto-open on a guess, only on a positive zero.
  const [connectionCount, setConnectionCount] = useState<number | null>(null);
  useEffect(() => {
    if (!connected) return;
    let cancelled = false;
    getConnections()
      .then((list) => { if (!cancelled) setConnectionCount(list.length); })
      .catch(() => { if (!cancelled) setConnectionCount(null); });
    return () => { cancelled = true; };
  }, [connected, getConnections]);

  const {
    open: wizardOpen, openWizard, dismiss: dismissWizard, complete: completeWizard,
  } = useSetupWizard({
    connectionCount: connectionCount ?? 0,
    connectionCountKnown: connectionCount !== null,
  });

  // Fetch full state from bridge on connect, then poll for changes
  useEffect(() => {
    if (!connected) return;

    let lastSync = new Date().toISOString();
    const local = useStore.getState();
    performInitialSync({
      goals: local.goals,
      tasks: local.tasks,
      clients: local.clients,
      goalTemplates: local.goalTemplates,
      users: local.users,
      teams: local.teams,
    })
      .then((state) => {
        useStore.getState()._initFromBridge(state);
        lastSync = state.timestamp || lastSync;
        // Hydrate the activity log from its persisted history
        return bridgeFetch<Array<{ id: number; timestamp: string; actor: string; text: string; color: string | null }>>(
          '/api/activity', undefined, { retries: 0 },
        ).then(hydrateLog).catch(() => {});
      })
      .catch((err) => {
        // Local state is deliberately left untouched on failure.
        logger.error('Initial bridge sync failed', err);
        toast('Bridge sync failed — keeping local data', COLOR_WARNING, '⚠️');
      });

    const pollInterval = setInterval(() => {
      fetchChanges(lastSync)
        .then((changes) => {
          useStore.getState()._mergeChanges(changes);
          if (changes.timestamp) lastSync = changes.timestamp;
        })
        .catch(() => {}); // silent — bridge might be down
    }, 5000);

    return () => clearInterval(pollInterval);
  }, [connected, toast, hydrateLog]);

  // Global error handlers
  useEffect(() => {
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const msg = event.reason?.message || String(event.reason);
      logger.error('Unhandled promise rejection', event.reason);
      // Don't toast bridge fetch errors — they're expected when offline
      if (!msg.includes('Failed to fetch') && !msg.includes('AbortError')) {
        toast(`Error: ${msg}`, COLOR_DANGER, '⚠️');
      }
    };

    const handleError = (event: ErrorEvent) => {
      logger.error('Uncaught error', event.error);
      toast(`Error: ${event.message}`, COLOR_DANGER, '⚠️');
    };

    const handleStorageQuota = () => {
      toast('Storage is full. Export your data to free space.', COLOR_WARNING, '⚠️');
    };

    // Debounced so a burst of failed writes (bridge down) shows one toast
    let lastWriteFailToast = 0;
    const handleBridgeWriteFailed = () => {
      const now = Date.now();
      if (now - lastWriteFailToast < 5000) return;
      lastWriteFailToast = now;
      toast('Change not saved to server — kept locally', COLOR_WARNING, '⚠️');
    };

    // Startup crashes get a long, specific toast: the cause is not something a
    // user can guess, and the fix is usually a single documented action.
    const handleBridgeStartFailed = (e: Event) => {
      const reason = (e as CustomEvent<string>).detail;
      toast(reason || 'The bridge stopped unexpectedly.', COLOR_DANGER, '⚠️');
    };

    const handleWriteConflict = () => {
      toast('Updated elsewhere — refreshed with the latest version', COLOR_WARNING, '🔄');
    };

    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    window.addEventListener('error', handleError);
    window.addEventListener('storage-quota-exceeded', handleStorageQuota);
    window.addEventListener('bridge-write-failed', handleBridgeWriteFailed);
    window.addEventListener('bridge-write-conflict', handleWriteConflict);
    window.addEventListener('bridge-start-failed', handleBridgeStartFailed);

    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      window.removeEventListener('error', handleError);
      window.removeEventListener('storage-quota-exceeded', handleStorageQuota);
      window.removeEventListener('bridge-write-failed', handleBridgeWriteFailed);
      window.removeEventListener('bridge-write-conflict', handleWriteConflict);
      window.removeEventListener('bridge-start-failed', handleBridgeStartFailed);
    };
  }, [toast]);

  // Cloud editions gate on the server session; desktop is always 'ready'
  if (authStatus !== 'ready') {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: theme.bg, color: theme.text }}>
        <div style={{ textAlign: 'center', padding: 40, borderRadius: 14, border: `1px solid ${theme.border}`, background: theme.bgCard, maxWidth: 360 }}>
          <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>BroadcastOKR</div>
          {authStatus === 'loading' ? (
            <div role="status" style={{ color: theme.textMuted, fontSize: 14 }}>Checking your session…</div>
          ) : (
            <>
              <p style={{ color: theme.textMuted, fontSize: 14, margin: '0 0 20px' }}>
                Sign in with your organisation account to continue.
              </p>
              <button
                onClick={signIn}
                style={{ padding: '10px 24px', borderRadius: 8, border: 'none', background: PRIMARY_COLOR, color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
              >
                Sign in with SSO
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <DeploymentProvider mode={mode}>
    <AppShell
      onCreateTask={() => setCreateTaskOpen(true)}
      connected={connected}
      bridgeRunning={bridgeRunning}
      onRunSetupWizard={openWizard}
    >
      <ErrorBoundary>
        <Suspense fallback={
          <div role="status" aria-label="Loading" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 64, color: theme.textMuted, fontSize: 13 }}>
            Loading…
          </div>
        }>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={
            <DashboardPage
              onOpenKPIConfig={() => setKpiConfigOpen(true)}
              bridgeConnected={connected}
              bridgeRunning={bridgeRunning}
              bridgeSyncing={syncing}
              liveKPIs={liveKPIs}
              drivers={drivers}
              health={health}
              onStartBridge={startBridge}
              onStopBridge={stopBridge}
              onSyncNow={syncNow}
            />
          } />
          <Route path="/goals" element={
            <GoalsPage
              bridgeConnected={connected}
              getConnections={getConnections}
              getTables={getTables}
              getColumns={getColumns}
              previewQuery={previewQuery}
              executeBatch={executeBatch}
            />
          } />
          {FLEET_IN_BUILD && ClientsPage && (
            <Route path="/clients" element={
              fleet
                ? <ClientsPage bridgeConnected={connected} bridgeRunning={bridgeRunning} testConnection={testConnection} getConnections={getConnections} getChannels={getChannels} saveConnection={saveConnection} onStartBridge={startBridge} onStopBridge={stopBridge} />
                : <Navigate to="/dashboard" replace />
            } />
          )}
          {!FLEET_IN_BUILD && ClientSettingsPage && (
            <Route path="/clients" element={
              <ClientSettingsPage bridgeConnected={connected} testConnection={testConnection} getConnections={getConnections} getChannels={getChannels} />
            } />
          )}
          {FLEET_IN_BUILD && ComparePage && (
            <Route path="/compare" element={
              fleet
                ? <ComparePage bridgeConnected={connected} executeBatch={executeBatch} />
                : <Navigate to="/dashboard" replace />
            } />
          )}
          <Route path="/tasks" element={<TasksPage createOpen={createTaskOpen} setCreateOpen={setCreateTaskOpen} />} />
          <Route path="/team" element={<TeamPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
        </Suspense>
      </ErrorBoundary>
      {wizardOpen && (
        <Suspense fallback={null}>
          <SetupWizard
            open={wizardOpen}
            onDismiss={dismissWizard}
            onComplete={completeWizard}
            theme={theme}
            context={{ fleet, isOwner: currentUser.role === 'owner' }}
            bridge={{
              connected,
              bridgeRunning,
              startBridge,
              testConnection,
              saveConnection,
              getConnections,
              getChannels,
              getTables,
              getColumns,
              previewQuery,
              saveKPI,
              executeBatch,
            }}
          />
        </Suspense>
      )}
      <KPIConfigModal
        open={kpiConfigOpen}
        onClose={() => setKpiConfigOpen(false)}
        theme={theme}
        connected={connected}
        testConnection={testConnection}
        getTables={getTables}
        getColumns={getColumns}
        previewQuery={previewQuery}
        getTemplates={getTemplates}
        saveKPI={saveKPI}
        deleteKPI={deleteKPI}
        getKPIDefinitions={getKPIDefinitions}
        getConnections={getConnections}
        saveConnection={saveConnection}
        deleteConnection={deleteConnection}
      />
    </AppShell>
    </DeploymentProvider>
  );
}
