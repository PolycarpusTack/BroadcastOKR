import { describe, it, expect } from 'vitest';
import { migrateClientChannelScopes, migrateKRIds } from '../migration';
import type { Client, Goal, Task } from '../../types';

type GoalWithoutKRIds = Omit<Goal, 'keyResults'> & {
  keyResults: Array<Omit<Goal['keyResults'][number], 'id'>>;
};

describe('migrateKRIds', () => {
  it('adds id to KeyResults that lack one', () => {
    const goalsWithoutIds: GoalWithoutKRIds[] = [{
      id: 'g1', title: 'Test', status: 'on_track' as const, progress: 0.5,
      owner: 0, channel: 0, period: 'Q1 2026',
      keyResults: [{ title: 'KR1', start: 0, target: 100, current: 50, progress: 0.5, status: 'on_track' as const }],
    }];
    const result = migrateKRIds(goalsWithoutIds as Goal[]);
    expect(result[0].keyResults[0].id).toBeDefined();
    expect(typeof result[0].keyResults[0].id).toBe('string');
    expect(result[0].keyResults[0].id.length).toBeGreaterThan(0);
  });

  it('preserves existing KR ids', () => {
    const goals: Goal[] = [{
      id: 'g1', title: 'Test', status: 'on_track', progress: 0.5,
      owner: 0, channel: 0, period: 'Q1 2026',
      keyResults: [{ id: 'existing-id', title: 'KR1', start: 0, target: 100, current: 50, progress: 0.5, status: 'on_track' }],
    }];
    const result = migrateKRIds(goals);
    expect(result[0].keyResults[0].id).toBe('existing-id');
  });

  it('does not modify goals without keyResults', () => {
    const goals: Goal[] = [{
      id: 'g1', title: 'Test', status: 'on_track', progress: 0,
      owner: 0, channel: 0, period: 'Q1 2026', keyResults: [],
    }];
    const result = migrateKRIds(goals);
    expect(result[0].keyResults).toEqual([]);
  });
});

describe('migrateClientChannelScopes', () => {
  const clients: Client[] = [
    {
      id: 'client-a',
      name: 'Client A',
      connectionId: 'conn-a',
      color: '#111111',
      channels: [
        { id: 'shared', name: 'Shared Channel' },
        { id: 'a-only', name: 'A Only' },
      ],
    },
    {
      id: 'client-b',
      name: 'Client B',
      connectionId: 'conn-b',
      color: '#222222',
      channels: [
        { id: 'shared', name: 'Shared Channel' },
        { id: 'b-only', name: 'B Only' },
      ],
    },
  ];

  it('maps legacy goal channel ids to client-scoped refs', () => {
    const goals: Goal[] = [{
      id: 'g1',
      title: 'Scoped Goal',
      status: 'behind',
      progress: 0,
      owner: 0,
      channel: 0,
      period: 'Q1 2026',
      clientIds: ['client-a', 'client-b'],
      channelScope: { type: 'selected', channelIds: ['shared'] } as unknown as Goal['channelScope'],
      keyResults: [],
    }];

    const migrated = migrateClientChannelScopes(goals, [], clients);
    expect(migrated.goals[0].channelScope).toEqual({
      type: 'selected',
      channels: [
        { clientId: 'client-a', channelId: 'shared' },
        { clientId: 'client-b', channelId: 'shared' },
      ],
    });
  });

  it('maps legacy task channel ids to client-scoped refs', () => {
    const tasks: Task[] = [{
      id: 't1',
      title: 'Scoped Task',
      status: 'todo',
      priority: 'medium',
      assignee: 0,
      channel: 0,
      due: '2026-04-01',
      taskType: 'task',
      subtasks: [],
      clientIds: ['client-a'],
      channelScope: { type: 'selected', channelIds: ['a-only'] } as unknown as Task['channelScope'],
    }];

    const migrated = migrateClientChannelScopes([], tasks, clients);
    expect(migrated.tasks[0].channelScope).toEqual({
      type: 'selected',
      channels: [{ clientId: 'client-a', channelId: 'a-only' }],
    });
  });

  it('falls back to all channels when legacy refs cannot be resolved', () => {
    const goals: Goal[] = [{
      id: 'g2',
      title: 'Unknown Scope',
      status: 'behind',
      progress: 0,
      owner: 0,
      channel: 0,
      period: 'Q1 2026',
      clientIds: ['client-a'],
      channelScope: { type: 'selected', channelIds: ['missing'] } as unknown as Goal['channelScope'],
      keyResults: [],
    }];

    const migrated = migrateClientChannelScopes(goals, [], clients);
    expect(migrated.goals[0].channelScope).toEqual({ type: 'all' });
  });
});
