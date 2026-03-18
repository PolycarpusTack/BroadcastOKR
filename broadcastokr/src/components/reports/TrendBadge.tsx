import { computeTrend } from '../../utils/reportHelpers';
import { COLOR_SUCCESS, COLOR_DANGER } from '../../constants/config';
import { FONT_MONO } from '../../constants/config';
import type { KRHistoryEntry } from '../../types';

interface TrendBadgeProps {
  history: KRHistoryEntry[];
  target: number;
  start: number;
}

const TREND_CONFIG = {
  up: { arrow: '\u2191', color: COLOR_SUCCESS, label: 'Trending up' },
  flat: { arrow: '\u2192', color: '#888', label: 'Flat' },
  down: { arrow: '\u2193', color: COLOR_DANGER, label: 'Trending down' },
} as const;

export function TrendBadge({ history, target, start }: TrendBadgeProps) {
  const trend = computeTrend(history, target, start);
  if (trend === null) return null;

  const { arrow, color, label } = TREND_CONFIG[trend];

  return (
    <span
      title={label}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        padding: '2px 7px',
        borderRadius: 10,
        fontSize: 11,
        fontWeight: 600,
        fontFamily: FONT_MONO,
        color,
        background: color + '18',
        border: `1px solid ${color}40`,
      }}
    >
      {arrow}
    </span>
  );
}
