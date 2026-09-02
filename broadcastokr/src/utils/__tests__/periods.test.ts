import { describe, it, expect } from 'vitest';
import { periodOptions, currentPeriod, periodOptionsIncluding } from '../periods';

// Local-time constructors, not UTC strings: currentPeriod() reads the local
// month (a user's quarter is their own quarter), so a UTC instant near a
// boundary would make these tests pass or fail depending on the machine's zone.
const at = (y: number, month1: number, day = 15) => new Date(y, month1 - 1, day, 12);

describe('period options', () => {
  it('follows the clock instead of a hardcoded year', () => {
    // The old literal list said 2026 forever; on this date it would be wrong.
    const options = periodOptions(at(2027, 3, 4));
    expect(options).toContain('Q1 2027');
    expect(options).toContain('Annual 2027');
    expect(options.some((o) => o.endsWith('2028'))).toBe(true);
  });

  it('keeps last year selectable so a just-closed quarter can still be set', () => {
    const options = periodOptions(at(2027, 1, 8));
    expect(options).toContain('Q4 2026');
  });

  it('offers halves for goals that do not fit a quarter', () => {
    // "September to December" spans Q3/Q4; H2 is the closest honest label.
    expect(periodOptions(at(2026, 9, 1))).toContain('H2 2026');
  });

  it('lists a year in calendar order', () => {
    const options = periodOptions(at(2026, 6, 1));
    const thisYear = options.filter((o) => o.endsWith('2026'));
    expect(thisYear).toEqual([
      'Q1 2026', 'Q2 2026', 'H1 2026', 'Q3 2026', 'Q4 2026', 'H2 2026', 'Annual 2026',
    ]);
  });
});

describe('currentPeriod', () => {
  it.each([
    [2026, 1, 1, 'Q1 2026'],
    [2026, 3, 31, 'Q1 2026'],   // last day of Q1
    [2026, 4, 1, 'Q2 2026'],    // first day of Q2
    [2026, 9, 15, 'Q3 2026'],
    [2026, 12, 31, 'Q4 2026'],
  ])('maps %s-%s-%s to %s', (y, m, d, expected) => {
    expect(currentPeriod(at(y, m, d))).toBe(expected);
  });
});

describe('periodOptionsIncluding', () => {
  it('keeps an unknown stored period selectable', () => {
    // A goal imported with "FY26/27" must not be silently re-pointed at some
    // other period just because the dropdown does not recognise its label.
    const options = periodOptionsIncluding('FY26/27', at(2026, 6, 1));
    expect(options[0]).toBe('FY26/27');
  });

  it('does not duplicate a stored period that is already offered', () => {
    const options = periodOptionsIncluding('Q2 2026', at(2026, 6, 1));
    expect(options.filter((o) => o === 'Q2 2026')).toHaveLength(1);
  });

  it('handles a goal with no period set', () => {
    expect(periodOptionsIncluding(undefined, at(2026, 6, 1)))
      .toEqual(periodOptions(at(2026, 6, 1)));
  });
});
