import type { Theme } from '../../types';
import type { BridgeHealth } from '../../hooks/useBridge';
import { formatUptime } from '../../utils/dates';
import {
  FONT_HEADING, FONT_MONO, COLOR_SUCCESS, COLOR_DANGER,
  COLOR_DB_ORACLE, COLOR_DB_POSTGRES,
} from '../../constants/config';

interface SystemHealthPanelProps {
  theme: Theme;
  connected: boolean;
  health: BridgeHealth | null;
}

function Stat({ theme, label, value, color }: { theme: Theme; label: string; value: string; color?: string }) {
  return (
    <div style={{ padding: '10px 12px', borderRadius: 10, background: theme.bgMuted, border: `1px solid ${theme.borderLight}` }}>
      <div style={{ fontSize: 10, color: theme.textMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: color ?? theme.text, fontFamily: FONT_MONO, marginTop: 4 }}>{value}</div>
    </div>
  );
}

function DriverDot({ theme, label, up, color }: { theme: Theme; label: string; up: boolean; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: up ? color : theme.borderLight, boxShadow: up ? `0 0 6px ${color}` : 'none' }} />
      <span style={{ fontSize: 11, color: up ? theme.text : theme.textFaint, fontWeight: 500 }}>{label}</span>
    </div>
  );
}

export function SystemHealthPanel({ theme, connected, health }: SystemHealthPanelProps) {
  const cardStyle = {
    background: theme.bgCard,
    border: `1px solid ${theme.border}`,
    borderRadius: 14,
    padding: 20,
  };

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h3 style={{ fontFamily: FONT_HEADING, fontSize: 15, fontWeight: 700, color: theme.text, margin: 0 }}>{'\u{1FAC0}'} System Health</h3>
        <span
          role="status"
          aria-label={connected ? 'Bridge online' : 'Bridge offline'}
          style={{
            fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 20,
            color: connected ? COLOR_SUCCESS : COLOR_DANGER,
            background: (connected ? COLOR_SUCCESS : COLOR_DANGER) + '1A',
            border: `1px solid ${(connected ? COLOR_SUCCESS : COLOR_DANGER)}55`,
          }}
        >
          {connected ? 'ONLINE' : 'OFFLINE'}
        </span>
      </div>

      {!connected || !health ? (
        <div style={{ textAlign: 'center', padding: 24, color: theme.textFaint, fontSize: 12 }}>
          Bridge not connected — health stats unavailable.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <Stat theme={theme} label="Uptime" value={formatUptime(health.uptime)} color={COLOR_SUCCESS} />
            <Stat theme={theme} label="DB Size" value={health.database?.size ?? '--'} />
            <Stat theme={theme} label="Tables" value={health.database ? String(health.database.tables) : '--'} />
          </div>
          <div>
            <div style={{ fontSize: 10, color: theme.textMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Database Drivers</div>
            <div style={{ display: 'flex', gap: 16 }}>
              <DriverDot theme={theme} label="Oracle" up={health.drivers.oracle} color={COLOR_DB_ORACLE} />
              <DriverDot theme={theme} label="PostgreSQL" up={health.drivers.postgres} color={COLOR_DB_POSTGRES} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
