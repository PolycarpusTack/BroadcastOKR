import { describe, it, expect } from 'vitest';
import { computeTrend, computePeriodDelta, computeGoalProgressTimeline } from '../reportHelpers';
import type { KRHistoryEntry, KeyResult } from '../../types';

function entry(value: number, timestamp = '2026-03-10T12:00:00Z', extra?: Partial<KRHistoryEntry>): KRHistoryEntry {
  return { timestamp, value, actor: 'test', source: 'check-in', ...extra };
}

describe('computeTrend', () => {
  it('returns null for 0 entries', () => {
    expect(computeTrend([], 100, 0)).toBeNull();
  });

  it('returns null for 1 entry', () => {
    expect(computeTrend([entry(50)], 100, 0)).toBeNull();
  });

  it('returns "up" for ascending values', () => {
    const history = [entry(10), entry(20), entry(30), entry(40), entry(50)];
    expect(computeTrend(history, 100, 0)).toBe('up');
  });

  it('returns "down" for descending values', () => {
    const history = [entry(50), entry(40), entry(30), entry(20), entry(10)];
    expect(computeTrend(history, 100, 0)).toBe('down');
  });

  it('returns "flat" for stable values', () => {
    const history = [entry(50), entry(50), entry(50.1), entry(50), entry(49.9)];
    expect(computeTrend(history, 100, 0)).toBe('flat');
  });

  it('uses only last 5 entries', () => {
    // First entries go down, last 5 go up — should report up
    const history = [
      entry(100), entry(90), entry(80),
      entry(10), entry(20), entry(30), entry(40), entry(50),
    ];
    expect(computeTrend(history, 100, 0)).toBe('up');
  });
});

describe('computePeriodDelta', () => {
  it('returns null when no recent entries', () => {
    const old = entry(50, '2020-01-01T00:00:00Z');
    expect(computePeriodDelta([old], 7)).toBeNull();
  });

  it('returns null when no prior entries', () => {
    const recent = entry(50, new Date().toISOString());
    expect(computePeriodDelta([recent], 7)).toBeNull();
  });

  it('returns positive delta when recent > prior', () => {
    const now = Date.now();
    const msPerDay = 86400000;
    const history: KRHistoryEntry[] = [
      entry(30, new Date(now - 10 * msPerDay).toISOString()), // prior window
      entry(50, new Date(now - 2 * msPerDay).toISOString()),  // recent window
    ];
    const delta = computePeriodDelta(history, 7);
    expect(delta).not.toBeNull();
    expect(delta!).toBeGreaterThan(0);
    expect(delta!).toBeCloseTo(20);
  });

  it('returns negative delta when recent < prior', () => {
    const now = Date.now();
    const msPerDay = 86400000;
    const history: KRHistoryEntry[] = [
      entry(80, new Date(now - 10 * msPerDay).toISOString()),
      entry(40, new Date(now - 2 * msPerDay).toISOString()),
    ];
    const delta = computePeriodDelta(history, 7);
    expect(delta).not.toBeNull();
    expect(delta!).toBeLessThan(0);
    expect(delta!).toBeCloseTo(-40);
  });
});

describe('computeGoalProgressTimeline', () => {
  const makeKR = (overrides: Partial<KeyResult>): KeyResult => ({
    id: 'kr1',
    title: 'Test KR',
    start: 0,
    target: 100,
    current: 50,
    progress: 50,
    status: 'on_track',
    ...overrides,
  });

  it('returns empty array for KRs with no history', () => {
    const result = computeGoalProgressTimeline([makeKR({ history: [] })]);
    expect(result).toEqual([]);
  });

  it('produces correct timeline for single KR', () => {
    const kr = makeKR({
      start: 0,
      target: 100,
      history: [
        entry(25, '2026-03-01T00:00:00Z'),
        entry(50, '2026-03-02T00:00:00Z'),
        entry(75, '2026-03-03T00:00:00Z'),
      ],
    });
    const timeline = computeGoalProgressTimeline([kr]);
    expect(timeline).toHaveLength(3);
    expect(timeline[0].progress).toBeCloseTo(0.25);
    expect(timeline[1].progress).toBeCloseTo(0.5);
    expect(timeline[2].progress).toBeCloseTo(0.75);
  });

  it('averages progress across multiple KRs', () => {
    const kr1 = makeKR({
      id: 'kr1', start: 0, target: 100,
      history: [entry(100, '2026-03-01T00:00:00Z')],
    });
    const kr2 = makeKR({
      id: 'kr2', start: 0, target: 100,
      history: [entry(0, '2026-03-01T00:00:00Z')],
    });
    const timeline = computeGoalProgressTimeline([kr1, kr2]);
    expect(timeline).toHaveLength(1);
    expect(timeline[0].progress).toBeCloseTo(0.5); // (1.0 + 0.0) / 2
  });

  it('carries forward last known value for KRs without entry at timestamp', () => {
    const kr1 = makeKR({
      id: 'kr1', start: 0, target: 100,
      history: [
        entry(50, '2026-03-01T00:00:00Z'),
        entry(75, '2026-03-02T00:00:00Z'),
      ],
    });
    const kr2 = makeKR({
      id: 'kr2', start: 0, target: 100,
      history: [entry(40, '2026-03-01T00:00:00Z')],
    });
    const timeline = computeGoalProgressTimeline([kr1, kr2]);
    expect(timeline).toHaveLength(2);
    // At 03-02: kr1=75/100=0.75, kr2 carries forward 40/100=0.4 → avg 0.575
    expect(timeline[1].progress).toBeCloseTo(0.575);
  });
});
