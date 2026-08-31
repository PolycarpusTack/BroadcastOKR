import type { Goal, SyncStatus } from '../types';

/** One /api/kpi/execute-batch query for a live KR. krIndex is the KR's true
 *  position in goal.keyResults (results also carry it back for logging). */
export interface LiveKRQuery {
  goalId: string;
  krIndex: number;
  krId: string;
  connectionId: string;
  sql: string;
  binds?: Record<string, unknown>;
  timeframeDays?: number;
}

export interface LiveKRBatchResult {
  goalId: string;
  krIndex: number;
  status: 'ok' | 'error' | 'timeout' | 'no_data';
  current?: number;
  error?: string;
}

/** Collect one execute-batch query per live KR (single source of the batch
 *  contract — previously copied at four call sites, with a drifting krIndex). */
export function buildLiveKRQueries(goals: Array<Pick<Goal, 'id' | 'keyResults'>>): LiveKRQuery[] {
  const queries: LiveKRQuery[] = [];
  for (const goal of goals) {
    goal.keyResults.forEach((kr, krIndex) => {
      if (!kr.liveConfig) return;
      queries.push({
        goalId: goal.id,
        krIndex,
        krId: kr.id,
        connectionId: kr.liveConfig.connectionId,
        sql: kr.liveConfig.sql,
        timeframeDays: kr.liveConfig.timeframeDays,
      });
    });
  }
  return queries;
}

/** The bridge returns results in query order; re-attach each query's krId so
 *  the store can match KRs by identity rather than position. */
export function mapResultsToKrIds<T extends LiveKRBatchResult>(
  results: T[],
  queries: LiveKRQuery[],
): Array<T & { krId: string; status: SyncStatus }> {
  return results.map((r, i) => ({
    ...r,
    krId: queries[i]?.krId ?? '',
    status: r.status as SyncStatus,
  }));
}
