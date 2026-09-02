import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSetupWizard } from '../useSetupWizard';

const KEY = 'brokr.setupWizard.v1';

describe('useSetupWizard', () => {
  beforeEach(() => localStorage.clear());

  it('opens itself on a fresh install with no connections', () => {
    const { result } = renderHook(() => useSetupWizard({ connectionCount: 0, connectionCountKnown: true }));
    expect(result.current.open).toBe(true);
  });

  it('stays shut while the connection count is still unknown', () => {
    // Auto-opening on a guess would pop a wizard over a configured install.
    const { result } = renderHook(() => useSetupWizard({ connectionCount: 0, connectionCountKnown: false }));
    expect(result.current.open).toBe(false);
  });

  it('stays shut when connections already exist', () => {
    const { result } = renderHook(() => useSetupWizard({ connectionCount: 2, connectionCountKnown: true }));
    expect(result.current.open).toBe(false);
  });

  it('does not offer itself again after being dismissed', () => {
    const { result, unmount } = renderHook(() => useSetupWizard({ connectionCount: 0, connectionCountKnown: true }));
    act(() => result.current.dismiss());
    expect(result.current.open).toBe(false);
    unmount();

    const second = renderHook(() => useSetupWizard({ connectionCount: 0, connectionCountKnown: true }));
    expect(second.result.current.open).toBe(false);
    expect(JSON.parse(localStorage.getItem(KEY)!).dismissedAt).toBeTruthy();
  });

  it('remembers completion separately from dismissal', () => {
    const { result } = renderHook(() => useSetupWizard({ connectionCount: 0, connectionCountKnown: true }));
    act(() => result.current.complete());
    const stored = JSON.parse(localStorage.getItem(KEY)!);
    expect(stored.completedAt).toBeTruthy();
    expect(stored.dismissedAt).toBeUndefined();
  });

  it('can always be relaunched by hand, even after completion', () => {
    localStorage.setItem(KEY, JSON.stringify({ completedAt: new Date().toISOString() }));
    const { result } = renderHook(() => useSetupWizard({ connectionCount: 0, connectionCountKnown: true }));
    expect(result.current.open).toBe(false);

    act(() => result.current.openWizard());
    expect(result.current.open).toBe(true);
  });

  it('a later dismissal does not overwrite the original completion record', () => {
    localStorage.setItem(KEY, JSON.stringify({ completedAt: '2026-01-01T00:00:00.000Z' }));
    const { result } = renderHook(() => useSetupWizard({ connectionCount: 0, connectionCountKnown: true }));
    act(() => result.current.openWizard());
    act(() => result.current.dismiss());

    const stored = JSON.parse(localStorage.getItem(KEY)!);
    expect(stored.completedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(stored.dismissedAt).toBeUndefined();
  });

  it('survives storage being unavailable', () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new Error('QuotaExceededError'); };
    try {
      const { result } = renderHook(() => useSetupWizard({ connectionCount: 0, connectionCountKnown: true }));
      expect(() => act(() => result.current.complete())).not.toThrow();
      expect(result.current.open).toBe(false);
    } finally {
      Storage.prototype.setItem = original;
    }
  });
});
