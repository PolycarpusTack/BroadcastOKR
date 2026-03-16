import { memo } from 'react';

interface SparkLineProps {
  data: number[];
  color: string;
  w?: number;
  h?: number;
}

export const SparkLine = memo(function SparkLine({ data, color, w = 80, h = 28 }: SparkLineProps) {
  if (data.length === 0) return <svg width={w} height={h} />;
  if (data.length === 1) {
    const cy = h / 2;
    return (
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block' }}>
        <circle cx={w / 2} cy={cy} r="3" fill={color} />
      </svg>
    );
  }

  const mn = Math.min(...data);
  const mx = Math.max(...data);
  const rn = mx - mn || 1;
  const pts = data
    .map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - mn) / rn) * (h - 4) - 2}`)
    .join(' ');
  const lastY = h - ((data[data.length - 1] - mn) / rn) * (h - 4) - 2;

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={w} cy={lastY} r="3" fill={color} />
    </svg>
  );
});
