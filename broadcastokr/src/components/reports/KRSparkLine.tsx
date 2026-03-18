import { SparkLine } from '../ui/SparkLine';
import type { KRHistoryEntry } from '../../types';

interface KRSparkLineProps {
  history: KRHistoryEntry[];
  color: string;
  w?: number;
  h?: number;
}

export function KRSparkLine({ history, color, w, h }: KRSparkLineProps) {
  if (history.length === 0) {
    return <span style={{ color: '#888', fontSize: 12 }}>—</span>;
  }
  return <SparkLine data={history.map(e => e.value)} color={color} w={w} h={h} />;
}
