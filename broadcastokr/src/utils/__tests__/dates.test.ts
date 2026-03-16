import { describe, it, expect } from 'vitest';
import { daysUntil, getUrgencyBadge, formatTime } from '../dates';

describe('daysUntil', () => {
  it('returns positive days for future dates', () => {
    const future = new Date();
    future.setDate(future.getDate() + 5);
    expect(daysUntil(future.toISOString().split('T')[0])).toBeGreaterThanOrEqual(4);
    expect(daysUntil(future.toISOString().split('T')[0])).toBeLessThanOrEqual(5);
  });

  it('returns negative days for past dates', () => {
    const past = new Date();
    past.setDate(past.getDate() - 3);
    expect(daysUntil(past.toISOString().split('T')[0])).toBeLessThanOrEqual(-2);
  });

  it('returns Infinity for invalid date strings', () => {
    expect(daysUntil('not-a-date')).toBe(Infinity);
    expect(daysUntil('')).toBe(Infinity);
  });
});

describe('getUrgencyBadge', () => {
  it('returns overdue badge for negative days', () => {
    const badge = getUrgencyBadge(-2, false);
    expect(badge.text).toBe('2d overdue');
    expect(badge.pulse).toBe(true);
  });

  it('returns TODAY badge for 0 days', () => {
    const badge = getUrgencyBadge(0, false);
    expect(badge.text).toBe('TODAY');
    expect(badge.pulse).toBe(true);
  });

  it('returns Tomorrow badge for 1 day', () => {
    const badge = getUrgencyBadge(1, false);
    expect(badge.text).toBe('Tomorrow');
    expect(badge.pulse).toBe(false);
  });

  it('returns day count for 2-3 days', () => {
    const badge = getUrgencyBadge(3, false);
    expect(badge.text).toBe('3d');
  });

  it('returns consistent colors regardless of dark param', () => {
    const a = getUrgencyBadge(7, false);
    const b = getUrgencyBadge(7, true);
    expect(a.bg).toBe(b.bg);
    expect(a.bg).toBe('#78490A');
  });
});

describe('formatTime', () => {
  it('returns a time string in HH:MM:SS format', () => {
    const time = formatTime();
    expect(time).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });
});
