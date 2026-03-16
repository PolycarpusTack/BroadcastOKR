import { describe, it, expect } from 'vitest';
import { migrateKRIds } from '../migration';
import type { Goal } from '../../types';

describe('migrateKRIds', () => {
  it('adds id to KeyResults that lack one', () => {
    const goals = [{
      id: 'g1', title: 'Test', status: 'on_track' as const, progress: 0.5,
      owner: 0, channel: 0, period: 'Q1 2026',
      keyResults: [{ id: '', title: 'KR1', start: 0, target: 100, current: 50, progress: 0.5, status: 'on_track' as const }],
    }];
    // Empty string id should be treated as needing migration
    const goals2 = [{
      id: 'g1', title: 'Test', status: 'on_track' as const, progress: 0.5,
      owner: 0, channel: 0, period: 'Q1 2026',
      keyResults: [{ title: 'KR1', start: 0, target: 100, current: 50, progress: 0.5, status: 'on_track' as const } as any],
    }];
    const result = migrateKRIds(goals2 as Goal[]);
    expect(result[0].keyResults[0].id).toBeDefined();
    expect(typeof result[0].keyResults[0].id).toBe('string');
    expect(result[0].keyResults[0].id.length).toBeGreaterThan(0);
  });

  it('preserves existing KR ids', () => {
    const goals: Goal[] = [{
      id: 'g1', title: 'Test', status: 'on_track', progress: 0.5,
      owner: 0, channel: 0, period: 'Q1 2026',
      keyResults: [{ id: 'existing-id', title: 'KR1', start: 0, target: 100, current: 50, progress: 0.5, status: 'on_track' }],
    }];
    const result = migrateKRIds(goals);
    expect(result[0].keyResults[0].id).toBe('existing-id');
  });

  it('does not modify goals without keyResults', () => {
    const goals: Goal[] = [{
      id: 'g1', title: 'Test', status: 'on_track', progress: 0,
      owner: 0, channel: 0, period: 'Q1 2026', keyResults: [],
    }];
    const result = migrateKRIds(goals);
    expect(result[0].keyResults).toEqual([]);
  });
});
