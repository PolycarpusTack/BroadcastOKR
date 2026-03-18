import type { KRHistoryEntry } from '../types';

const HISTORY_CAP = 100;
const HISTORY_PRUNE_TO = 75;

export function pruneHistory(history: KRHistoryEntry[]): KRHistoryEntry[] {
  if (history.length <= HISTORY_CAP) return history;
  return history.slice(-HISTORY_PRUNE_TO);
}
