import type { Goal } from '../types';

/** Ensure all KeyResults have an `id` field (migration for pre-existing data) */
export function migrateKRIds(goals: Goal[]): Goal[] {
  let anyChanged = false;
  const result = goals.map((g) => {
    let goalChanged = false;
    const krs = g.keyResults.map((kr) => {
      if (kr.id) return kr;
      goalChanged = true;
      return { ...kr, id: crypto.randomUUID() };
    });
    if (goalChanged) anyChanged = true;
    return goalChanged ? { ...g, keyResults: krs } : g;
  });
  return anyChanged ? result : goals;
}
