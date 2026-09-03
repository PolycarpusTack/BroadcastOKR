import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../store';
import { activeGoals, periodsWithGoals } from '../../utils/goals';
import type { Goal } from '../../types';

// R6-5: archiving a period flips every goal of that period and nothing else;
// restoring brings them back. Active views read through activeGoals().

const goal = (id: string, period: string, archived?: boolean): Goal => ({
  id, title: id, status: 'behind', progress: 0, owner: 1, channel: 0, period, keyResults: [], archived,
});

describe('setPeriodArchived', () => {
  beforeEach(() => {
    useStore.setState({ goals: [goal('a', 'Q1 2026'), goal('b', 'Q1 2026'), goal('c', 'Q2 2026'), goal('d', 'Q4 2025', true)] });
  });

  it('archives the goals of one period only and reports which', () => {
    const ids = useStore.getState().setPeriodArchived('Q1 2026', true);
    expect(ids.sort()).toEqual(['a', 'b']);
    const byId = Object.fromEntries(useStore.getState().goals.map((g) => [g.id, !!g.archived]));
    expect(byId).toEqual({ a: true, b: true, c: false, d: true });
    expect(activeGoals(useStore.getState().goals).map((g) => g.id)).toEqual(['c']);
  });

  it('restores an archived period and is a no-op on goals already in the requested state', () => {
    expect(useStore.getState().setPeriodArchived('Q4 2025', false)).toEqual(['d']);
    expect(useStore.getState().setPeriodArchived('Q4 2025', false)).toEqual([]);
    expect(useStore.getState().goals.find((g) => g.id === 'd')?.archived).toBe(false);
  });

  it('lists periods with their goal counts, active and archived apart', () => {
    expect(periodsWithGoals(useStore.getState().goals, false)).toEqual([{ period: 'Q2 2026', count: 1 }, { period: 'Q1 2026', count: 2 }]);
    expect(periodsWithGoals(useStore.getState().goals, true)).toEqual([{ period: 'Q4 2025', count: 1 }]);
  });
});
