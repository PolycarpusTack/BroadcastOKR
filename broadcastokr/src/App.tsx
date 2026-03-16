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
  const { theme } = useTheme();
  const syncLiveKRBatch = useStore((s) => s.syncLiveKRBatch);

  // Start periodic auto-sync for live KRs when bridge is connected
  useEffect(() => {
    if (bridge.connected) {
      bridge.startKRAutoSync(
        () => useStore.getState().goals,
        syncLiveKRBatch,
      );
    }
  }, [bridge.connected, bridge.startKRAutoSync, syncLiveKRBatch]);

  return (
    <AppShell onCreateTask={() => setCreateTaskOpen(true)}>
      <ErrorBoundary>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={
            <DashboardPage
              onOpenKPIConfig={() => setKpiConfigOpen(true)}
              bridgeConnected={bridge.connected}
              bridgeRunning={bridge.bridgeRunning}
              bridgeSyncing={bridge.syncing}
              liveKPIs={bridge.liveKPIs}
              drivers={bridge.drivers}
              onStartBridge={bridge.startBridge}
              onStopBridge={bridge.stopBridge}
              onSyncNow={bridge.syncNow}
            />
          } />
          <Route path="/goals" element={
            <GoalsPage
              bridgeConnected={bridge.connected}
              getConnections={bridge.getConnections}
              getTables={bridge.getTables}
              getColumns={bridge.getColumns}
              previewQuery={bridge.previewQuery}
              getChannels={bridge.getChannels}
              executeBatch={bridge.executeBatch}
            />
          } />
          <Route path="/clients" element={
            <ClientsPage bridgeConnected={bridge.connected} bridgeRunning={bridge.bridgeRunning} testConnection={bridge.testConnection} getConnections={bridge.getConnections} getChannels={bridge.getChannels} saveConnection={bridge.saveConnection} onStartBridge={bridge.startBridge} onStopBridge={bridge.stopBridge} />
          } />
          <Route path="/compare" element={
            <ComparePage bridgeConnected={bridge.connected} executeBatch={bridge.executeBatch} />
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
        connected={bridge.connected}
        testConnection={bridge.testConnection}
        getTables={bridge.getTables}
        getColumns={bridge.getColumns}
        previewQuery={bridge.previewQuery}
        getTemplates={bridge.getTemplates}
        saveKPI={bridge.saveKPI}
        deleteKPI={bridge.deleteKPI}
        getKPIDefinitions={bridge.getKPIDefinitions}
        getConnections={bridge.getConnections}
        saveConnection={bridge.saveConnection}
        deleteConnection={bridge.deleteConnection}
      />
    </AppShell>
  );
}
