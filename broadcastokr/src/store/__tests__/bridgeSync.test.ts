import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useStore } from '../store';
import { isBridgeEmpty, hasLocalData, performInitialSync } from '../bridgeSync';
import type { BridgeState } from '../bridgeSync';
import type { Goal, Task } from '../../types';

function resetStore() {
  useStore.setState({
    goals: [],
    tasks: [],
    kpis: [],
    clients: [],
    users: [{ id: 1, name: 'Alice', role: 'owner', av: 'A', color: '#3805E3', dept: 'Eng', title: 'Dev' }],
    teams: [],
    goalTemplates: [],
  });
}

describe('_initFromBridge', () => {
  beforeEach(resetStore);

  it('replaces all state slices', () => {
    const goals: Goal[] = [{
      id: 'g1', title: 'Goal 1', status: 'behind', progress: 0,
      owner: 1, channel: 0, period: 'Q1 2026', keyResults: [],
    }];
    const tasks: Task[] = [{
      id: 't1', title: 'Task 1', status: 'todo', priority: 'medium',
      assignee: 1, channel: 0, due: '2026-04-01', taskType: 'task', subtasks: [],
    }];

    useStore.getState()._initFromBridge({
      goals, tasks, clients: [], goalTemplates: [], users: [], teams: [], kpis: [],
    });

    expect(useStore.getState().goals).toEqual(goals);
    expect(useStore.getState().tasks).toEqual(tasks);
  });

  it('handles empty state', () => {
    useStore.getState()._initFromBridge({
      goals: [], tasks: [], clients: [], goalTemplates: [], users: [], teams: [], kpis: [],
    });
    expect(useStore.getState().goals).toEqual([]);
  });
});

describe('_mergeChanges', () => {
  beforeEach(() => {
    resetStore();
    useStore.setState({
      goals: [
        { id: 'g1', title: 'Original', status: 'behind', progress: 0, owner: 1, channel: 0, period: 'Q1', keyResults: [] },
        { id: 'g2', title: 'Untouched', status: 'on_track', progress: 0.8, owner: 1, channel: 0, period: 'Q1', keyResults: [] },
      ],
    });
  });

  it('updates existing entities by ID', () => {
    useStore.getState()._mergeChanges({
      goals: [{ id: 'g1', title: 'Updated', status: 'on_track', progress: 0.5, owner: 1, channel: 0, period: 'Q1', keyResults: [] }],
    });

    const goals = useStore.getState().goals;
    expect(goals.find(g => g.id === 'g1')?.title).toBe('Updated');
    expect(goals.find(g => g.id === 'g2')?.title).toBe('Untouched');
  });

  it('adds new entities not in current state', () => {
    useStore.getState()._mergeChanges({
      goals: [{ id: 'g3', title: 'New Goal', status: 'behind', progress: 0, owner: 1, channel: 0, period: 'Q2', keyResults: [] }],
    });

    const goals = useStore.getState().goals;
    expect(goals.length).toBe(3);
    expect(goals.find(g => g.id === 'g3')?.title).toBe('New Goal');
  });

  it('ignores empty changes', () => {
    const before = useStore.getState().goals;
    useStore.getState()._mergeChanges({});
    expect(useStore.getState().goals).toEqual(before);
  });
});

const emptyBridge: BridgeState = {
  goals: [], tasks: [], clients: [], goalTemplates: [], users: [], teams: [], kpis: [],
  timestamp: '2026-08-31T10:00:00Z',
};

const populatedBridge: BridgeState = {
  ...emptyBridge,
  users: [{ id: 1, name: 'Alice', role: 'owner', av: 'A', color: '#000', dept: 'Eng', title: 'Dev' }],
  goals: [{ id: 'g1', title: 'Bridge goal', status: 'behind', progress: 0, owner: 1, channel: 0, period: 'Q1', keyResults: [] }],
} as BridgeState;

const localWithData = {
  goals: [{ id: 'lg1', title: 'Local goal', status: 'behind', progress: 0, owner: 0, channel: 0, period: 'Q1', keyResults: [] }],
  tasks: [], clients: [], goalTemplates: [], users: [], teams: [],
} as unknown as Parameters<typeof performInitialSync>[0];

const localEmpty = {
  goals: [], tasks: [], clients: [], goalTemplates: [], users: [], teams: [],
} as unknown as Parameters<typeof performInitialSync>[0];

describe('isBridgeEmpty', () => {
  it('is true when bridge has no users, goals, or tasks', () => {
    expect(isBridgeEmpty(emptyBridge)).toBe(true);
  });

  it('is false when bridge has any data', () => {
    expect(isBridgeEmpty(populatedBridge)).toBe(false);
  });
});

describe('hasLocalData', () => {
  it('is true when local state has goals or tasks', () => {
    expect(hasLocalData(localWithData)).toBe(true);
  });

  it('is false when local state is empty', () => {
    expect(hasLocalData(localEmpty)).toBe(false);
  });
});

describe('performInitialSync', () => {
  it('migrates local data up when the bridge is empty, then adopts the re-fetched state', async () => {
    const afterMigration = { ...populatedBridge, timestamp: '2026-08-31T10:00:05Z' };
    const fetchState = vi.fn()
      .mockResolvedValueOnce(emptyBridge)
      .mockResolvedValueOnce(afterMigration);
    const migrateFromLocal = vi.fn().mockResolvedValue({ ok: true });

    const result = await performInitialSync(localWithData, { fetchState, migrateFromLocal });

    expect(migrateFromLocal).toHaveBeenCalledTimes(1);
    expect(migrateFromLocal).toHaveBeenCalledWith(expect.objectContaining({ goals: localWithData.goals }));
    expect(fetchState).toHaveBeenCalledTimes(2);
    expect(result).toBe(afterMigration);
  });

  it('adopts bridge state without migrating when the bridge has data', async () => {
    const fetchState = vi.fn().mockResolvedValue(populatedBridge);
    const migrateFromLocal = vi.fn();

    const result = await performInitialSync(localWithData, { fetchState, migrateFromLocal });

    expect(migrateFromLocal).not.toHaveBeenCalled();
    expect(result).toBe(populatedBridge);
  });

  it('does not migrate when local state is also empty', async () => {
    const fetchState = vi.fn().mockResolvedValue(emptyBridge);
    const migrateFromLocal = vi.fn();

    const result = await performInitialSync(localEmpty, { fetchState, migrateFromLocal });

    expect(migrateFromLocal).not.toHaveBeenCalled();
    expect(result).toBe(emptyBridge);
  });

  it('propagates migration failure without a second fetch', async () => {
    const fetchState = vi.fn().mockResolvedValue(emptyBridge);
    const migrateFromLocal = vi.fn().mockRejectedValue(new Error('migration refused'));

    await expect(performInitialSync(localWithData, { fetchState, migrateFromLocal }))
      .rejects.toThrow('migration refused');
    expect(fetchState).toHaveBeenCalledTimes(1);
  });
});
