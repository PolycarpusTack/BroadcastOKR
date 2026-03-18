import { describe, it, expect } from 'vitest';
import { pruneHistory } from '../history';
import type { KRHistoryEntry } from '../../types';

function makeEntry(i: number): KRHistoryEntry {
  return { timestamp: `2026-03-${String(i + 1).padStart(2, '0')}T00:00:00Z`, value: i, actor: 'test', source: 'check-in' };
}

describe('pruneHistory', () => {
  it('returns input unchanged when under cap', () => {
    const entries = Array.from({ length: 50 }, (_, i) => makeEntry(i));
    expect(pruneHistory(entries)).toHaveLength(50);
  });

  it('returns input unchanged at exactly 100', () => {
    const entries = Array.from({ length: 100 }, (_, i) => makeEntry(i));
    expect(pruneHistory(entries)).toHaveLength(100);
  });

  it('prunes to 75 when over 100', () => {
    const entries = Array.from({ length: 110 }, (_, i) => makeEntry(i));
    const result = pruneHistory(entries);
    expect(result).toHaveLength(75);
    expect(result[0].value).toBe(35);
  });

  it('returns empty array for empty input', () => {
    expect(pruneHistory([])).toHaveLength(0);
  });
});
