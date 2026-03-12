import { getUrgencyBadge } from '../../utils';

interface UrgencyBadgeProps {
  days: number;
  dark: boolean;
}

export function UrgencyBadge({ days, dark }: UrgencyBadgeProps) {
  const u = getUrgencyBadge(days, dark);
  return (
    <span
      style={{
        padding: '2px 8px',
        borderRadius: 6,
        fontSize: 11,
        fontWeight: 700,
        background: u.bg,
        color: u.fg,
        animation: u.pulse ? 'urgPulse 2s infinite' : 'none',
      }}
    >
      {u.text}
    </span>
  );
}
