import { memo, type CSSProperties } from 'react';
import { FONT_MONO } from '../../constants/config';

interface PillBadgeProps {
  label: string;
  color: string;
  icon?: string;
  bold?: boolean;
  pulse?: boolean;
  bg?: string;
  fg?: string;
  style?: CSSProperties;
}

/**
 * Unified pill badge following the Mediagenix AIR design system.
 * Derives bg/border from `color` automatically unless `bg`/`fg` overrides are provided.
 */
export const PillBadge = memo(function PillBadge({ label, color, icon, bold, pulse, bg, fg, style }: PillBadgeProps) {
  const resolvedBg = bg ?? color + '20';
  const resolvedFg = fg ?? color;

  return (
    <span
      style={{
        padding: '2px 8px',
        borderRadius: 12,
        fontSize: '10.5px',
        fontWeight: bold ? 700 : 600,
        fontFamily: FONT_MONO,
        background: resolvedBg,
        color: resolvedFg,
        border: `1px solid ${resolvedFg}4D`,
        animation: pulse ? 'urgPulse 2s infinite' : 'none',
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {icon ? `${icon} ${label}` : label}
    </span>
  );
});
