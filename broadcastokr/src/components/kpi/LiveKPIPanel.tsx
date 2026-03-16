import { memo, useState } from 'react';
import type { Theme } from '../../types';
import type { LiveKPI, DriverStatus } from '../../hooks/useBridge';
import { SparkLine } from '../ui/SparkLine';
import { PillBadge } from '../ui/PillBadge';
import { PRIMARY_COLOR, COLOR_SUCCESS, COLOR_DANGER, COLOR_INFO, COLOR_WARNING, FONT_BODY, FONT_HEADING, FONT_MONO } from '../../constants/config';

interface LiveKPIPanelProps {
  kpis: LiveKPI[];
  connected: boolean;
  bridgeRunning: boolean;
  syncing: boolean;
  drivers?: DriverStatus;
  theme: Theme;
  onConfigure: () => void;
  onStartBridge: () => Promise<{ ok: boolean; message: string }>;
  onStopBridge: () => Promise<{ ok: boolean; message: string }>;
  onSyncNow: () => Promise<void>;
}

function liveKpiStatus(kpi: LiveKPI): { label: string; color: string } {
  if (kpi.error) return { label: 'Error', color: COLOR_DANGER };
  const ratio = kpi.direction === 'hi'
    ? kpi.current / kpi.target
    : kpi.target / kpi.current;
  if (ratio >= 0.9) return { label: 'On Track', color: COLOR_SUCCESS };
  if (ratio >= 0.7) return { label: 'At Risk', color: COLOR_WARNING };
  return { label: 'Behind', color: COLOR_DANGER };
}

function formatValue(value: number, unit: string): string {
  if (unit === '%') return `${value}%`;
  if (unit === 's') {
    const m = Math.floor(value / 60);
    const s = Math.round(value % 60);
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  }
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return `${value}`;
}

const smallBtn = (bg: string, disabled = false) => ({
  background: disabled ? '#555' : bg,
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  padding: '4px 10px',
  fontSize: 11,
  fontWeight: 600 as const,
  cursor: disabled ? 'not-allowed' as const : 'pointer' as const,
  fontFamily: FONT_BODY,
  opacity: disabled ? 0.6 : 1,
});

export const LiveKPIPanel = memo(function LiveKPIPanel({
  kpis, connected, bridgeRunning, syncing, drivers, theme,
  onConfigure, onStartBridge, onStopBridge, onSyncNow,
}: LiveKPIPanelProps) {
  const [actionMsg, setActionMsg] = useState('');

  const handleStart = async () => {
    setActionMsg('Starting bridge...');
    const result = await onStartBridge();
    setActionMsg(result.message);
    setTimeout(() => setActionMsg(''), 3000);
  };

  const handleStop = async () => {
    setActionMsg('Stopping bridge...');
    const result = await onStopBridge();
    setActionMsg(result.message);
    setTimeout(() => setActionMsg(''), 3000);
  };

  const handleSync = async () => {
    setActionMsg('Syncing...');
    await onSyncNow();
    setActionMsg('Synced!');
    setTimeout(() => setActionMsg(''), 2000);
  };

  const isElectron = !!(window as { electronAPI?: { isElectron: boolean } }).electronAPI?.isElectron;

  return (
    <div style={{
      background: theme.bgCard,
      border: `1px solid ${theme.border}`,
      borderRadius: 10,
      padding: 20,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h3 style={{
          fontFamily: FONT_HEADING,
          fontSize: 15,
          fontWeight: 700,
          color: theme.text,
          margin: 0,
        }}>
          {'\u{1F4E1}'} Live KPIs
        </h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {/* Status indicator */}
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: connected ? COLOR_SUCCESS : COLOR_DANGER,
            boxShadow: connected ? `0 0 6px ${COLOR_SUCCESS}` : 'none',
          }} />
          <span style={{ fontSize: 10, color: theme.textMuted }}>
            {connected ? 'Connected' : bridgeRunning ? 'Starting...' : 'Offline'}
          </span>
          {connected && drivers && (
            <span style={{ fontSize: 9, fontFamily: FONT_MONO, color: theme.textFaint }}>
              {drivers.oracle && drivers.postgres ? 'Oracle + PG' :
               drivers.oracle ? 'Oracle' :
               drivers.postgres ? 'PostgreSQL' :
               ''}
              {!drivers.oracle && !drivers.postgres && (
                <span style={{ color: COLOR_WARNING }}>No DB drivers</span>
              )}
            </span>
          )}

          {/* Start / Stop buttons */}
          {isElectron ? (
            connected || bridgeRunning ? (
              <button onClick={handleStop} style={smallBtn(COLOR_DANGER)}>Stop Bridge</button>
            ) : (
              <button onClick={handleStart} style={smallBtn(COLOR_SUCCESS)}>Start Bridge</button>
            )
          ) : (
            !connected && (
              <button onClick={handleStart} style={smallBtn(COLOR_SUCCESS)}>Connect</button>
            )
          )}

          {/* Sync button */}
          {connected && (
            <button onClick={handleSync} disabled={syncing} style={smallBtn(COLOR_INFO, syncing)}>
              {syncing ? 'Syncing...' : '\u{1F504} Sync Now'}
            </button>
          )}

          {/* Configure button */}
          <button onClick={onConfigure} style={smallBtn(PRIMARY_COLOR)}>Configure</button>
        </div>
      </div>

      {/* Action message */}
      {actionMsg && (
        <div style={{ fontSize: 11, color: theme.textMuted, marginBottom: 10, padding: '4px 8px', borderRadius: 4, background: theme.bgMuted }}>
          {actionMsg}
        </div>
      )}

      {kpis.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '24px 16px',
          color: theme.textFaint,
          fontSize: 13,
        }}>
          {connected
            ? 'No KPIs configured. Click Configure to add live database KPIs.'
            : isElectron
              ? 'Click "Start Bridge" to connect to your database.'
              : 'Start the bridge service (npm run bridge) or click Connect.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 10 }}>
          {kpis.map((kpi) => {
            const st = liveKpiStatus(kpi);
            return (
              <div key={kpi.id} style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 12px',
                borderRadius: 10,
                background: theme.bgMuted,
                border: `1px solid ${theme.borderLight}`,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: theme.text }}>{kpi.name}</div>
                  {kpi.error ? (
                    <div style={{ fontSize: 11, color: COLOR_DANGER, marginTop: 2 }}>{kpi.error}</div>
                  ) : (
                    <div style={{ fontSize: 11, color: theme.textFaint, marginTop: 2 }}>
                      {formatValue(kpi.current, kpi.unit)} / {formatValue(kpi.target, kpi.unit)} target
                    </div>
                  )}
                </div>
                {kpi.trend && kpi.trend.length > 1 && (
                  <SparkLine data={kpi.trend} color={st.color} w={70} h={24} />
                )}
                <PillBadge label={st.label} color={st.color} bold />
              </div>
            );
          })}
        </div>
      )}

      {kpis.length > 0 && kpis[0].lastUpdated && (
        <div style={{ fontSize: 10, color: theme.textFaint, marginTop: 10, textAlign: 'right' }}>
          Last updated: {new Date(kpis[0].lastUpdated).toLocaleTimeString()}
        </div>
      )}
    </div>
  );
});
