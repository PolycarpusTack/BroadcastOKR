import { FONT_MONO, COLOR_SUCCESS, COLOR_WARNING, COLOR_DANGER } from '../../constants/config';

interface ConnectionIndicatorProps {
  connected: boolean;
  bridgeRunning: boolean;
}

export function ConnectionIndicator({ connected, bridgeRunning }: ConnectionIndicatorProps) {
  const status = connected ? 'connected' : bridgeRunning ? 'reconnecting' : 'offline';
  const color = status === 'connected' ? COLOR_SUCCESS : status === 'reconnecting' ? COLOR_WARNING : COLOR_DANGER;
  const label = status === 'connected' ? 'Bridge connected' : status === 'reconnecting' ? 'Reconnecting...' : 'Bridge offline';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px',
        borderRadius: 20,
        background: `${color}15`,
        border: `1px solid ${color}30`,
      }}
      title={label}
      role="status"
      aria-label={label}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: color,
          boxShadow: status === 'connected' ? `0 0 6px ${color}` : 'none',
          animation: status === 'reconnecting' ? 'pulseDot 1.5s infinite' : 'none',
        }}
      />
      <span style={{ fontSize: 10, fontFamily: FONT_MONO, color, fontWeight: 600 }}>
        {status === 'connected' ? 'Bridge' : status === 'reconnecting' ? 'Reconnecting' : 'Offline'}
      </span>
    </div>
  );
}
