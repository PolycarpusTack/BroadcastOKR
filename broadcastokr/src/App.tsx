import { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { ErrorBoundary } from './components/ErrorBoundary';
import { DashboardPage } from './pages/DashboardPage';
import { GoalsPage } from './pages/GoalsPage';
import { TasksPage } from './pages/TasksPage';
import { TeamPage } from './pages/TeamPage';
import { ReportsPage } from './pages/ReportsPage';
import { ClientsPage } from './pages/ClientsPage';
import { ComparePage } from './pages/ComparePage';
import { KPIConfigModal } from './components/kpi/KPIConfigModal';
import { useBridge } from './hooks/useBridge';
import { useTheme } from './context/ThemeContext';
import { useStore } from './store/store';

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
    startBridge,
    stopBridge,
    syncNow,
    startKRAutoSync,
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
  const syncLiveKRBatch = useStore((s) => s.syncLiveKRBatch);

  // Start periodic auto-sync for live KRs when bridge is connected
  useEffect(() => {
    if (connected) {
      startKRAutoSync(
        () => useStore.getState().goals,
        syncLiveKRBatch,
      );
    }
  }, [connected, startKRAutoSync, syncLiveKRBatch]);

  return (
    <AppShell onCreateTask={() => setCreateTaskOpen(true)}>
      <ErrorBoundary>
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
          <Route path="/clients" element={
            <ClientsPage bridgeConnected={connected} bridgeRunning={bridgeRunning} testConnection={testConnection} getConnections={getConnections} getChannels={getChannels} saveConnection={saveConnection} onStartBridge={startBridge} onStopBridge={stopBridge} />
          } />
          <Route path="/compare" element={
            <ComparePage bridgeConnected={connected} executeBatch={executeBatch} />
          } />
          <Route path="/tasks" element={<TasksPage createOpen={createTaskOpen} setCreateOpen={setCreateTaskOpen} />} />
          <Route path="/team" element={<TeamPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </ErrorBoundary>
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
  );
}
