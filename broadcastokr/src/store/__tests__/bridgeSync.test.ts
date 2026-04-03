import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../store';
import type { Goal, Task, Client, User } from '../../types';

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
