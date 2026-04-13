import {
  COLOR_SUCCESS,
  COLOR_DANGER,
  COLOR_WARNING,
} from '../../constants/config';

export type HealthStatus = 'untested' | 'ok' | 'failed' | 'pending';

export function HealthDot({ status }: { status: HealthStatus }) {
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
