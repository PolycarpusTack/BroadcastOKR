import { getUrgencyBadge } from '../../utils';
import { FONT_MONO } from '../../constants/config';

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
        borderRadius: 12,
        fontSize: '10.5px',
        fontWeight: 700,
        fontFamily: FONT_MONO,
        background: u.bg,
        color: u.fg,
        border: `1px solid ${u.fg}4D`,
        animation: u.pulse ? 'urgPulse 2s infinite' : 'none',
      }}
    >
      {u.text}
    </span>
  );
}
