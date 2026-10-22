import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../bridgeSync', async (importOriginal) => ({
  ...await importOriginal<typeof import('../bridgeSync')>(),
  bridgePost: vi.fn(),
  bridgePutEntity: vi.fn(),
}));
import { useStore } from '../store';
import { bridgePost, bridgePutEntity } from '../bridgeSync';
import type { Goal } from '../../types';

const goal: Goal = { id: 'g-save', title: 'Original', status: 'behind', progress: 0, owner: 0, channel: 0, period: 'Q4 2026', keyResults: [], version: 0 };
const other: Goal = { ...goal, id: 'g-other', keyResults: [{ id: 'kr-other', title: 'Live reading', start: 0, target: 100, current: 0, progress: 0, status: 'behind' }] };

describe('goal save outcomes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useStore.setState({ goals: [] });
  });
  it('returns failure and removes the optimistic creation after a refused write', async () => {
    vi.mocked(bridgePost).mockRejectedValue(new Error('Seat limit'));

    const result = await useStore.getState().addGoal(goal);

    expect(result).toEqual({ ok: false, error: 'Seat limit' });
    expect(useStore.getState().goals).toEqual([]);
  });
  it('returns success only after the bridge accepted the creation', async () => {
    vi.mocked(bridgePost).mockResolvedValue({ ok: true });

    const result = await useStore.getState().addGoal(goal);

    expect(result).toEqual({ ok: true });
    expect(useStore.getState().goals[0].title).toBe('Original');
  });
  it('restores the previous goal after a failed edit', async () => {
    useStore.setState({ goals: [goal] });
    vi.mocked(bridgePutEntity).mockResolvedValue({ ok: false, error: 'Not saved' });

    const result = await useStore.getState().updateGoal(goal.id, { title: 'Unsaved edit' });

    expect(result).toEqual({ ok: false, error: 'Not saved' });
    expect(useStore.getState().goals[0].title).toBe('Original');
  });
  it('restores a refused edit even after an earlier write bumped the version', async () => {
    useStore.setState({ goals: [goal] });
    vi.mocked(bridgePutEntity).mockImplementation(async (_kind, _body, hooks) => {
      hooks.onVersion(5);
      return { ok: false, error: 'Not saved' };
    });

    await useStore.getState().updateGoal(goal.id, { title: 'Unsaved edit' });

    expect(useStore.getState().goals[0].title).toBe('Original');
    expect(useStore.getState().goals[0].version).toBe(5);
  });
  it('preserves an authoritative conflict response instead of restoring stale local data', async () => {
    useStore.setState({ goals: [goal] });
    vi.mocked(bridgePutEntity).mockImplementation(async (_kind, _body, hooks) => {
      hooks.onConflict({ ...goal, title: 'Another person saved this', version: 2 });
      return { ok: false, error: 'Conflict' };
    });

    await useStore.getState().updateGoal(goal.id, { title: 'Unsaved edit' });

    expect(useStore.getState().goals[0].title).toBe('Another person saved this');
    expect(useStore.getState().goals[0].version).toBe(2);
  });
  it('removes a refused creation even when an unrelated sync cloned its cache entry', async () => {
    useStore.setState({ goals: [other] });
    let rejectWrite!: (error: Error) => void;
    vi.mocked(bridgePost).mockReturnValue(new Promise((_resolve, reject) => { rejectWrite = reject; }));
    const saving = useStore.getState().addGoal(goal);
    useStore.getState().syncLiveKRBatch([{ goalId: 'g-other', krId: 'kr-other', current: 50, status: 'ok' }]);

    rejectWrite(new Error('Refused'));
    await saving;

    expect(useStore.getState().goals).toHaveLength(1);
    expect(useStore.getState().goals[0].id).toBe('g-other');
    expect(useStore.getState().goals[0].keyResults[0].current).toBe(50);
  });
  it('restores a refused edit without discarding an unrelated live measurement', async () => {
    useStore.setState({ goals: [goal, other] });
    let finishWrite!: (result: { ok: false; error: string }) => void;
    vi.mocked(bridgePutEntity).mockReturnValue(new Promise((resolve) => { finishWrite = resolve; }));
    const saving = useStore.getState().updateGoal(goal.id, { title: 'Unsaved' });
    useStore.getState().syncLiveKRBatch([{ goalId: 'g-other', krId: 'kr-other', current: 50, status: 'ok' }]);

    finishWrite({ ok: false, error: 'Refused' });
    await saving;

    expect(useStore.getState().goals[0].title).toBe('Original');
    expect(useStore.getState().goals[1].keyResults[0].current).toBe(50);
  });
});
