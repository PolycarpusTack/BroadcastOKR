/**
 * OKR period options, generated from the clock rather than hardcoded.
 *
 * The list used to be a literal `['Q1 2026' … 'Annual 2026']`, which is wrong
 * from the first of January and offers nothing to a goal that does not fit a
 * quarter. Generating it keeps the app correct as the year turns, and adding
 * halves covers the common "September to December" shape that spans Q3/Q4.
 *
 * Periods are labels, not date ranges — a live KR's SQL carries the real
 * window. Keep them human-readable and stable, because they are stored on the
 * goal as free text and existing goals must keep displaying correctly.
 */

export type PeriodKind = 'quarter' | 'half' | 'annual';

/** Options for one year, in calendar order. */
function yearOptions(year: number): string[] {
  return [
    `Q1 ${year}`, `Q2 ${year}`,
    `H1 ${year}`,
    `Q3 ${year}`, `Q4 ${year}`,
    `H2 ${year}`,
    `Annual ${year}`,
  ];
}

/**
 * The selectable periods: last year (so a just-closed quarter stays pickable),
 * this year, and next year (so planning ahead works in December).
 * `now` is injectable for tests.
 */
export function periodOptions(now: Date = new Date()): string[] {
  const year = now.getFullYear();
  return [...yearOptions(year - 1), ...yearOptions(year), ...yearOptions(year + 1)];
}

/** The sensible default: the quarter we are currently in. */
export function currentPeriod(now: Date = new Date()): string {
  return `Q${Math.floor(now.getMonth() / 3) + 1} ${now.getFullYear()}`;
}

/**
 * A stored period may be anything — an old literal, an import, a hand-typed
 * value. Callers building a <select> must include it or the control would
 * silently re-point the goal at a different period on the next save.
 */
export function periodOptionsIncluding(stored: string | undefined, now: Date = new Date()): string[] {
  const options = periodOptions(now);
  return stored && !options.includes(stored) ? [stored, ...options] : options;
}
