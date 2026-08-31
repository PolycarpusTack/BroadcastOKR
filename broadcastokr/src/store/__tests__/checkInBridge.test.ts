import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../bridgeSync', () => ({
  bridgePost: vi.fn().mockResolvedValue({ ok: true }),
  bridgePut: vi.fn().mockResolvedValue({ ok: true }),
  bridgeDelete: vi.fn().mockResolvedValue({ ok: true }),
}));

import { useStore } from '../store';
import { bridgePost, bridgePut } from '../bridgeSync';
import type { Goal } from '../../types';

const goal: Goal = {
  id: 'g1', title: 'Goal', status: 'at_risk', progress: 0.4, owner: 0, channel: 0, period: 'Q1',
  keyResults: [
    { id: 'kr1', title: 'KR', start: 0, target: 100, current: 40, progress: 0.4, status: 'at_risk' },
  ],
};

describe('checkInKR bridge writes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useStore.setState({ goals: [structuredClone(goal)] });
  });

  it('POSTs the check-in and PUTs the recalculated goal (client-authoritative progress)', () => {
    useStore.getState().checkInKR('g1', 'kr1', { value: 80, actor: 'alice' });

    expect(bridgePost).toHaveBeenCalledWith('/api/goals/g1/check-in',
      expect.objectContaining({ krId: 'kr1', value: 80 }));

    const updated = useStore.getState().goals.find((g) => g.id === 'g1');
    expect(updated?.keyResults[0].progress).toBe(0.8);
    expect(bridgePut).toHaveBeenCalledWith('/api/goals/g1',
      expect.objectContaining({ id: 'g1', progress: updated?.progress }));
  });

  it('does not touch the bridge when the goal or KR is unknown', () => {
    useStore.getState().checkInKR('missing', 'kr1', { value: 80, actor: 'alice' });
    expect(bridgePut).not.toHaveBeenCalled();
  });
});
