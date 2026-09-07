import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../bridgeSync', () => ({
  bridgePost: vi.fn().mockResolvedValue({ ok: true }),
  bridgePut: vi.fn().mockResolvedValue({ ok: true }),
  bridgePutEntity: vi.fn().mockResolvedValue(undefined),
  bridgeDelete: vi.fn().mockResolvedValue({ ok: true }),
  bridgeWriteFailed: vi.fn(),
  bridgeCheckIn: vi.fn().mockResolvedValue(undefined),
  newOperationId: vi.fn(() => 'op-test-1'),
}));

import { useStore } from '../store';
import { bridgeCheckIn, bridgePutEntity, bridgePost } from '../bridgeSync';
import type { Goal } from '../../types';

const goal: Goal = {
  id: 'g1', title: 'Goal', status: 'at_risk', progress: 0.4, owner: 0, channel: 0, period: 'Q1', version: 3,
  keyResults: [
    { id: 'kr1', title: 'KR', start: 0, target: 100, current: 40, progress: 0.4, status: 'at_risk' },
  ],
};

describe('checkInKR bridge writes (ADR-B3: one command, no structural PUT)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useStore.setState({ goals: [structuredClone(goal)] });
  });

  it('sends one check-in command with a stable operation id and no goal PUT', () => {
    useStore.getState().checkInKR('g1', 'kr1', { value: 80, actor: 'alice', note: 'n' });

    expect(bridgeCheckIn).toHaveBeenCalledTimes(1);
    expect(bridgeCheckIn).toHaveBeenCalledWith('g1',
      expect.objectContaining({ krId: 'kr1', value: 80, actor: 'alice', note: 'n', operationId: 'op-test-1' }),
      expect.objectContaining({ onGoal: expect.any(Function) }));
    expect(bridgePutEntity).not.toHaveBeenCalled();
    expect(bridgePost).not.toHaveBeenCalled();

    // Optimistic local update keeps the UI responsive (progress is client-computed)
    const updated = useStore.getState().goals.find((g) => g.id === 'g1');
    expect(updated?.keyResults[0].current).toBe(80);
    expect(updated?.keyResults[0].progress).toBe(0.8);
  });

  it('adopts the authoritative goal from the response — version, value, history — and recomputes progress', () => {
    useStore.getState().checkInKR('g1', 'kr1', { value: 80, actor: 'alice' });
    const hooks = vi.mocked(bridgeCheckIn).mock.calls[0][2];

    hooks.onGoal({
      ...goal, version: 4,
      keyResults: [{ ...goal.keyResults[0], current: 80, history: [{ timestamp: '2026-09-07T10:00:00.000Z', value: 80, actor: 'Alice Session', source: 'check-in' }] }],
    });

    const merged = useStore.getState().goals.find((g) => g.id === 'g1');
    expect(merged?.version).toBe(4);
    expect(merged?.keyResults[0].current).toBe(80);
    expect(merged?.keyResults[0].progress).toBe(0.8);
    expect(merged?.keyResults[0].history?.[0].actor).toBe('Alice Session');
  });

  it('does not touch the bridge when the goal or KR is unknown', () => {
    useStore.getState().checkInKR('missing', 'kr1', { value: 80, actor: 'alice' });
    useStore.getState().checkInKR('g1', 'missing', { value: 80, actor: 'alice' });
    expect(bridgeCheckIn).not.toHaveBeenCalled();
    expect(bridgePutEntity).not.toHaveBeenCalled();
  });
});
