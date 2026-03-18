import type { KRHistoryEntry, KeyResult } from '../types';

/** Compute trend direction from history entries */
export function computeTrend(
  history: KRHistoryEntry[],
  target: number,
  start: number,
): 'up' | 'flat' | 'down' | null {
  if (history.length < 2) return null;
  const entries = history.slice(-5); // last 5 max
  const n = entries.length;
  // Linear regression slope
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += entries[i].value;
    sumXY += i * entries[i].value;
    sumX2 += i * i;
  }
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const range = Math.abs(target - start);
  const threshold = range * 0.02; // 2% of range
  if (Math.abs(slope) < threshold) return 'flat';
  return slope > 0 ? 'up' : 'down';
}

/** Compute period-over-period delta (last N days vs prior N days) */
export function computePeriodDelta(
  history: KRHistoryEntry[],
  windowDays: number = 7,
): number | null {
  const now = Date.now();
  const msPerDay = 86400000;
  const recentWindow = history.filter(e => {
    const t = new Date(e.timestamp).getTime();
    return t >= now - windowDays * msPerDay;
  });
  const priorWindow = history.filter(e => {
    const t = new Date(e.timestamp).getTime();
    return t >= now - 2 * windowDays * msPerDay && t < now - windowDays * msPerDay;
  });
  if (recentWindow.length === 0 || priorWindow.length === 0) return null;
  const avgRecent = recentWindow.reduce((s, e) => s + e.value, 0) / recentWindow.length;
  const avgPrior = priorWindow.reduce((s, e) => s + e.value, 0) / priorWindow.length;
  return avgRecent - avgPrior;
}

/** Compute goal-level progress timeline from KR histories */
export function computeGoalProgressTimeline(
  keyResults: KeyResult[],
): Array<{ timestamp: string; progress: number }> {
  // Collect all unique timestamps
  const timestamps = new Set<string>();
  for (const kr of keyResults) {
    for (const entry of kr.history ?? []) {
      timestamps.add(entry.timestamp);
    }
  }
  if (timestamps.size === 0) return [];

  const sorted = Array.from(timestamps).sort();
  const timeline: Array<{ timestamp: string; progress: number }> = [];

  for (const ts of sorted) {
    let totalProgress = 0;
    for (const kr of keyResults) {
      // Find last known value at or before this timestamp
      const entries = (kr.history ?? []).filter(e => e.timestamp <= ts);
      const value = entries.length > 0 ? entries[entries.length - 1].value : kr.start;
      const range = Math.abs(kr.target - kr.start);
      const progress = range === 0 ? (value === kr.target ? 1 : 0) : Math.min(Math.abs(value - kr.start) / range, 1);
      totalProgress += progress;
    }
    timeline.push({
      timestamp: ts,
      progress: keyResults.length > 0 ? totalProgress / keyResults.length : 0,
    });
  }

  return timeline;
}
