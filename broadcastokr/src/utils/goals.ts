import type { Goal } from '../types';

/** Active = not archived. Every operational view (Dashboard, Goals, Team,
 *  Clients, Compare, sync-all) reads through this; Reports keep seeing everything. */
export function isActiveGoal(goal: Pick<Goal, 'archived'>): boolean {
  return !goal.archived;
}

export function activeGoals<T extends Pick<Goal, 'archived'>>(goals: T[]): T[] {
  return goals.filter(isActiveGoal);
}

/** Periods that still hold active goals, most recent label first (labels sort as text). */
export function periodsWithGoals(goals: Goal[], archived: boolean): Array<{ period: string; count: number }> {
  const counts = new Map<string, number>();
  for (const g of goals) {
    if (!!g.archived !== archived) continue;
    counts.set(g.period, (counts.get(g.period) ?? 0) + 1);
  }
  return [...counts.entries()].map(([period, count]) => ({ period, count })).sort((a, b) => b.period.localeCompare(a.period));
}
