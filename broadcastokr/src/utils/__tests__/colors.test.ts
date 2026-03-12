import { describe, it, expect } from 'vitest';
import { progressColor, statusIcon, kpiStatus } from '../colors';
import type { KPI } from '../../types';

describe('progressColor', () => {
  it('returns green for high progress', () => {
    expect(progressColor(0.8)).toBe('#10b981');
  });

  it('returns yellow for medium progress', () => {
    expect(progressColor(0.5)).toBe('#f59e0b');
  });

  it('returns red for low progress', () => {
    expect(progressColor(0.2)).toBe('#ef4444');
  });

  it('handles boundary at 0.7', () => {
    expect(progressColor(0.7)).toBe('#10b981');
    expect(progressColor(0.69)).toBe('#f59e0b');
  });

  it('handles boundary at 0.4', () => {
    expect(progressColor(0.4)).toBe('#f59e0b');
    expect(progressColor(0.39)).toBe('#ef4444');
  });
});

describe('statusIcon', () => {
  it('returns correct icons for known statuses', () => {
    expect(statusIcon('on_track')).toBe('\u{1F7E2}');
    expect(statusIcon('at_risk')).toBe('\u{1F7E1}');
    expect(statusIcon('behind')).toBe('\u{1F534}');
    expect(statusIcon('done')).toBe('\u2705');
  });

  it('returns fallback for unknown status', () => {
    expect(statusIcon('unknown')).toBe('\u26AA');
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
});
