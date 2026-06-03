import { describe, it, expect } from 'vitest';
import { krProgress } from '../progress';

describe('krProgress', () => {
  describe('higher-is-better (target > start)', () => {
    it('computes fractional progress', () => {
      expect(krProgress(0, 100, 50)).toBe(0.5);
      expect(krProgress(20, 120, 45)).toBe(0.25);
    });

    it('clamps at 1 when target is exceeded', () => {
      expect(krProgress(0, 100, 150)).toBe(1);
    });

    it('is 0 at start', () => {
      expect(krProgress(0, 100, 0)).toBe(0);
    });

    it('clamps to 0 when moving the wrong way (below start)', () => {
      expect(krProgress(10, 20, 5)).toBe(0);
    });
  });

  describe('lower-is-better (target < start)', () => {
    it('computes fractional progress toward the lower target', () => {
      expect(krProgress(10, 5, 7)).toBeCloseTo(0.6);
    });

    it('clamps at 1 when below target', () => {
      expect(krProgress(10, 5, 3)).toBe(1);
    });

    it('clamps to 0 when moving the wrong way (above start)', () => {
      // Math.abs formula would report 1 here — regression guard
      expect(krProgress(10, 5, 15)).toBe(0);
    });
  });

  describe('hold-the-line (start === target)', () => {
    it('is 1 while current holds the target ("zero lapsed rights" KR)', () => {
      expect(krProgress(0, 0, 0)).toBe(1);
    });

    it('is 0 when current deviates from the target', () => {
      expect(krProgress(0, 0, 2)).toBe(0);
      expect(krProgress(5, 5, 4)).toBe(0);
    });
  });
});
