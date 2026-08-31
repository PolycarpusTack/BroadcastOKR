import { describe, it, expect } from 'vitest';
import { buildLiveKRQueries, mapResultsToKrIds } from '../liveSync';
import type { Goal, KeyResult } from '../../types';

function kr(id: string, live: boolean): KeyResult {
  return {
    id, title: id, start: 0, target: 100, current: 0, progress: 0, status: 'behind',
    ...(live ? { liveConfig: { connectionId: 'conn1', sql: `SELECT ${id}`, unit: '#', direction: 'hi' as const, timeframeDays: 7 } } : {}),
  };
}

function goal(id: string, keyResults: KeyResult[]): Goal {
  return { id, title: id, status: 'behind', progress: 0, owner: 0, channel: 0, period: 'Q1', keyResults };
}

describe('buildLiveKRQueries', () => {
  it('builds queries only for live KRs, preserving the TRUE index in keyResults', () => {
    const g = goal('g1', [kr('a', false), kr('b', true), kr('c', false), kr('d', true)]);

    const queries = buildLiveKRQueries([g]);

    expect(queries).toHaveLength(2);
    expect(queries[0]).toMatchObject({ goalId: 'g1', krIndex: 1, krId: 'b', connectionId: 'conn1', sql: 'SELECT b', timeframeDays: 7 });
    expect(queries[1]).toMatchObject({ goalId: 'g1', krIndex: 3, krId: 'd' });
  });

  it('walks multiple goals in order and skips goals with no live KRs', () => {
    const queries = buildLiveKRQueries([
      goal('g1', [kr('a', true)]),
      goal('g2', [kr('b', false)]),
      goal('g3', [kr('c', true)]),
    ]);

    expect(queries.map((q) => q.goalId)).toEqual(['g1', 'g3']);
  });

  it('returns [] when nothing is live', () => {
    expect(buildLiveKRQueries([goal('g1', [kr('a', false)])])).toEqual([]);
  });
});

describe('mapResultsToKrIds', () => {
  it('attaches krId positionally from the query list', () => {
    const g = goal('g1', [kr('a', true), kr('b', true)]);
    const queries = buildLiveKRQueries([g]);
    const results = [
      { goalId: 'g1', krIndex: 0, status: 'ok' as const, current: 5 },
      { goalId: 'g1', krIndex: 1, status: 'error' as const, error: 'boom' },
    ];

    const mapped = mapResultsToKrIds(results, queries);

    expect(mapped[0]).toMatchObject({ krId: 'a', status: 'ok', current: 5 });
    expect(mapped[1]).toMatchObject({ krId: 'b', status: 'error', error: 'boom' });
  });

  it('falls back to an empty krId when the result has no matching query', () => {
    const mapped = mapResultsToKrIds([{ goalId: 'g1', krIndex: 0, status: 'ok' as const }], []);
    expect(mapped[0].krId).toBe('');
  });
});
