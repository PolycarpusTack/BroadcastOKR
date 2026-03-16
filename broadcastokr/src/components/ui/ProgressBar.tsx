import { memo } from 'react';
import type { Theme } from '../../types';
import { progressColor } from '../../utils';

interface ProgressBarProps {
  value: number;
  height?: number;
  color?: string;
  theme: Theme;
}

export const ProgressBar = memo(function ProgressBar({ value, height = 6, color, theme }: ProgressBarProps) {
  return (
    <div role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100} style={{ height, borderRadius: height / 2, background: theme.border, overflow: 'hidden', width: '100%' }}>
      <div
        style={{
          width: `${Math.min(value * 100, 100)}%`,
          height: '100%',
          borderRadius: height / 2,
          background: color || progressColor(value),
          transition: 'width .5s ease',
        }}
      />
    </div>
  );
});
