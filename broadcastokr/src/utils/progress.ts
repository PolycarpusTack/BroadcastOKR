/**
 * Single source of truth for KR progress (start → target → current).
 *
 * Direction-aware: the signed ratio means movement AWAY from the target
 * clamps to 0 instead of being inflated by Math.abs (a lower-is-better KR
 * that worsens must not register progress). Works for both directions:
 *   higher-better  start=0,  target=100, current=50  → 0.5
 *   lower-better   start=10, target=5,   current=7   → 0.6
 *   wrong way      start=10, target=5,   current=15  → 0
 *
 * "Hold the line" KRs (start === target, e.g. "Zero lapsed rights in active
 * schedule") are 1 while current holds the target, else 0.
 */
export function krProgress(start: number, target: number, current: number): number {
  if (target === start) return current === target ? 1 : 0;
  const raw = (current - start) / (target - start);
  return Math.min(Math.max(raw, 0), 1);
}
