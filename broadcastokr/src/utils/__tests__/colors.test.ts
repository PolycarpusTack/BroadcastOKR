import { describe, it, expect } from 'vitest';
import { progressColor, statusIcon, kpiStatus } from '../colors';
import type { KPI } from '../../types';

describe('progressColor', () => {
  it('returns teal for high progress', () => {
    expect(progressColor(0.8)).toBe('#2DD4BF');
  });

  it('returns amber for medium progress', () => {
    expect(progressColor(0.5)).toBe('#F59E0B');
  });

  it('returns red for low progress', () => {
    expect(progressColor(0.2)).toBe('#F87171');
  });

  it('handles boundary at 0.7', () => {
    expect(progressColor(0.7)).toBe('#2DD4BF');
    expect(progressColor(0.69)).toBe('#F59E0B');
  });

  it('handles boundary at 0.4', () => {
    expect(progressColor(0.4)).toBe('#F59E0B');
    expect(progressColor(0.39)).toBe('#F87171');
  });
});

describe('statusIcon', () => {
  it('returns correct icons for known statuses', () => {
    expect(statusIcon('on_track')).toBe('\u{1F7E2}');
    expect(statusIcon('at_risk')).toBe('\u{1F7E1}');
    expect(statusIcon('behind')).toBe('\u{1F534}');
    expect(statusIcon('done')).toBe('\u2705');
  });

  it('returns correct icon for done status', () => {
    expect(statusIcon('done')).toBe('\u2705');
  });
});

describe('kpiStatus', () => {
  const makeKpi = (current: number, target: number, direction: 'hi' | 'lo' = 'hi'): KPI => ({
    name: 'Test', unit: '%', direction, target, current, trend: [],
  });

  it('returns On Target when ratio >= 0.98', () => {
    expect(kpiStatus(makeKpi(99, 100)).label).toBe('On Target');
  });

  it('returns Near when ratio >= 0.9', () => {
    expect(kpiStatus(makeKpi(92, 100)).label).toBe('Near');
  });

  it('returns Off when ratio < 0.9', () => {
    expect(kpiStatus(makeKpi(50, 100)).label).toBe('Off');
  });

  it('handles lo direction (lower is better)', () => {
    expect(kpiStatus(makeKpi(100, 100, 'lo')).label).toBe('On Target');
    expect(kpiStatus(makeKpi(200, 100, 'lo')).label).toBe('Off');
  });

  it('handles zero target without crashing', () => {
    const result = kpiStatus(makeKpi(50, 0));
    expect(result.label).toBe('Off');
    expect(result.color).toBe('#F87171');
  });

  it('handles zero current for lo direction without crashing', () => {
    const result = kpiStatus(makeKpi(0, 48, 'lo'));
    expect(result.label).toBe('Off');
    expect(result.color).toBe('#F87171');
  });
});
