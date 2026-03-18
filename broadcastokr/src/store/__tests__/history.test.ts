import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useStore } from '../store';
import type { Goal, Client } from '../../types';

function makeGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: 'g1',
    title: 'Test Goal',
    status: 'behind',
    progress: 0,
    owner: 0,
    channel: 0,
    period: 'Q1 2026',
    keyResults: [
      {
        id: 'kr1',
        title: 'Manual KR',
        start: 0,
        target: 100,
        current: 0,
        progress: 0,
        status: 'behind',
      },
    ],
    ...overrides,
  };
}

function makeClient(overrides: Partial<Client> = {}): Client {
  return {
    id: 'c1',
    name: 'Test Client',
    connectionId: 'conn1',
    color: '#fff',
    channels: [],
    ...overrides,
  };
}

function resetStore(goals: Goal[] = [], clients: Client[] = []) {
  useStore.setState({
    goals,
    tasks: [],
    kpis: [],
    clients,
    goalTemplates: [],
  });
}

describe('checkInKR', () => {
  beforeEach(() => {
    resetStore([makeGoal()]);
  });

  it('writes history entry with correct fields', () => {
    useStore.getState().checkInKR('g1', 0, {
      value: 42,
      confidence: 'on_track',
      note: 'Looking good',
      actor: 'alice',
    });
    const kr = useStore.getState().goals[0].keyResults[0];
    expect(kr.history).toBeDefined();
    expect(kr.history!.length).toBe(1);
    const entry = kr.history![0];
    expect(entry.value).toBe(42);
    expect(entry.confidence).toBe('on_track');
    expect(entry.note).toBe('Looking good');
    expect(entry.actor).toBe('alice');
    expect(entry.source).toBe('check-in');
    expect(entry.timestamp).toBeTruthy();
  });

  it('updates kr.current and recalculates progress for manual KR', () => {
    useStore.getState().checkInKR('g1', 0, { value: 50, actor: 'alice' });
    const kr = useStore.getState().goals[0].keyResults[0];
    expect(kr.current).toBe(50);
    expect(kr.progress).toBeCloseTo(0.5);
  });

  it('does NOT update kr.current for live KR', () => {
    resetStore([
      makeGoal({
        keyResults: [
          {
            id: 'kr-live',
            title: 'Live KR',
            start: 0,
            target: 100,
            current: 25,
            progress: 0.25,
            status: 'behind',
            liveConfig: {
              connectionId: 'conn1',
              sql: 'SELECT 1',
              unit: 'count',
              direction: 'hi',
            },
          },
        ],
      }),
    ]);
    useStore.getState().checkInKR('g1', 0, { value: 99, actor: 'bob' });
    const kr = useStore.getState().goals[0].keyResults[0];
    // current should stay at 25 (unchanged)
    expect(kr.current).toBe(25);
    // history should still be recorded
    expect(kr.history!.length).toBe(1);
    expect(kr.history![0].value).toBe(99);
  });

  it('prunes history when over 100 entries', () => {
    const goal = makeGoal();
    goal.keyResults[0].history = Array.from({ length: 100 }, (_, i) => ({
      timestamp: new Date(Date.now() - i * 1000).toISOString(),
      value: i,
      actor: 'system',
      source: 'sync' as const,
    }));
    resetStore([goal]);

    useStore.getState().checkInKR('g1', 0, { value: 999, actor: 'alice' });
    const kr = useStore.getState().goals[0].keyResults[0];
    // 101 entries => pruned to 75
    expect(kr.history!.length).toBe(75);
  });
});

describe('setMonitor', () => {
  it('sets monitorUntil on a goal', () => {
    resetStore([makeGoal()]);
    useStore.getState().setMonitor('goal', 'g1', 7);
    const goal = useStore.getState().goals[0];
    expect(goal.monitorUntil).toBeDefined();
    const until = new Date(goal.monitorUntil!).getTime();
    const expected = Date.now() + 7 * 86400000;
    expect(Math.abs(until - expected)).toBeLessThan(2000);
  });

  it('clears monitorUntil with null', () => {
    resetStore([makeGoal({ monitorUntil: new Date().toISOString() })]);
    useStore.getState().setMonitor('goal', 'g1', null);
    const goal = useStore.getState().goals[0];
    expect(goal.monitorUntil).toBeUndefined();
  });

  it('sets monitorUntil on a client', () => {
    resetStore([], [makeClient()]);
    useStore.getState().setMonitor('client', 'c1', 14);
    const client = useStore.getState().clients[0];
    expect(client.monitorUntil).toBeDefined();
    const until = new Date(client.monitorUntil!).getTime();
    const expected = Date.now() + 14 * 86400000;
    expect(Math.abs(until - expected)).toBeLessThan(2000);
  });

  it('clears monitorUntil on a client', () => {
    resetStore([], [makeClient({ monitorUntil: new Date().toISOString() })]);
    useStore.getState().setMonitor('client', 'c1', null);
    const client = useStore.getState().clients[0];
    expect(client.monitorUntil).toBeUndefined();
  });
});

describe('syncLiveKRBatch with monitoring', () => {
  const liveGoal = (monitorUntil?: string, clientIds?: string[]): Goal => makeGoal({
    monitorUntil,
    clientIds,
    keyResults: [
      {
        id: 'kr-live',
        title: 'Live KR',
        start: 0,
        target: 100,
        current: 0,
        progress: 0,
        status: 'behind',
        liveConfig: {
          connectionId: 'conn1',
          sql: 'SELECT 1',
          unit: 'count',
          direction: 'hi',
        },
        syncStatus: 'pending',
      },
    ],
  });

  it('writes history when goal has active monitorUntil', () => {
    const futureDate = new Date(Date.now() + 86400000).toISOString();
    resetStore([liveGoal(futureDate)]);

    useStore.getState().syncLiveKRBatch([
      { goalId: 'g1', krIndex: 0, current: 42, status: 'ok' },
    ]);

    const kr = useStore.getState().goals[0].keyResults[0];
    expect(kr.history).toBeDefined();
    expect(kr.history!.length).toBe(1);
    expect(kr.history![0].source).toBe('sync');
    expect(kr.history![0].actor).toBe('system');
    expect(kr.history![0].value).toBe(42);
  });

  it('does NOT write history when goal monitor is expired', () => {
    const pastDate = new Date(Date.now() - 86400000).toISOString();
    resetStore([liveGoal(pastDate)]);

    useStore.getState().syncLiveKRBatch([
      { goalId: 'g1', krIndex: 0, current: 42, status: 'ok' },
    ]);

    const kr = useStore.getState().goals[0].keyResults[0];
    expect(kr.history ?? []).toEqual([]);
  });

  it('writes history when any client in goal.clientIds has active monitorUntil', () => {
    const futureDate = new Date(Date.now() + 86400000).toISOString();
    resetStore(
      [liveGoal(undefined, ['c1'])],
      [makeClient({ monitorUntil: futureDate })],
    );

    useStore.getState().syncLiveKRBatch([
      { goalId: 'g1', krIndex: 0, current: 55, status: 'ok' },
    ]);

    const kr = useStore.getState().goals[0].keyResults[0];
    expect(kr.history).toBeDefined();
    expect(kr.history!.length).toBe(1);
    expect(kr.history![0].value).toBe(55);
  });
});

describe('syncLiveKR with monitoring', () => {
  const liveGoal = (monitorUntil?: string): Goal => makeGoal({
    monitorUntil,
    keyResults: [
      {
        id: 'kr-live',
        title: 'Live KR',
        start: 0,
        target: 100,
        current: 0,
        progress: 0,
        status: 'behind',
        liveConfig: {
          connectionId: 'conn1',
          sql: 'SELECT 1',
          unit: 'count',
          direction: 'hi',
        },
        syncStatus: 'pending',
      },
    ],
  });

  it('writes history when goal has active monitor', () => {
    const futureDate = new Date(Date.now() + 86400000).toISOString();
    resetStore([liveGoal(futureDate)]);

    useStore.getState().syncLiveKR('g1', 0, 60);

    const kr = useStore.getState().goals[0].keyResults[0];
    expect(kr.history).toBeDefined();
    expect(kr.history!.length).toBe(1);
    expect(kr.history![0].source).toBe('sync');
    expect(kr.history![0].value).toBe(60);
  });

  it('does NOT write history without active monitor', () => {
    resetStore([liveGoal()]);

    useStore.getState().syncLiveKR('g1', 0, 60);

    const kr = useStore.getState().goals[0].keyResults[0];
    expect(kr.history ?? []).toEqual([]);
  });
});
