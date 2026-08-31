import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../bridgeSync', () => ({
  bridgePost: vi.fn().mockResolvedValue({ ok: true }),
  bridgePut: vi.fn().mockResolvedValue({ ok: true }),
  bridgeDelete: vi.fn().mockResolvedValue({ ok: true }),
  bridgeWriteFailed: vi.fn(),
}));

import { useStore } from '../store';
import { bridgePost, bridgePut } from '../bridgeSync';
import type { Goal, Task, Client } from '../../types';

const goal: Goal = {
  id: 'g1', title: 'Goal', status: 'behind', progress: 0, owner: 0, channel: 0, period: 'Q1', keyResults: [],
};
const task: Task = {
  id: 't1', title: 'Task', status: 'todo', priority: 'medium', assignee: 0, channel: 0,
  due: '2026-09-01', taskType: 'task', subtasks: [{ text: 'sub', done: false }],
};
const client: Client = { id: 'c1', name: 'VRT', connectionId: 'conn1', color: '#000', channels: [] };

describe('TD-1: previously unsynced mutations reach the bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useStore.setState({ goals: [structuredClone(goal)], tasks: [structuredClone(task)], clients: [structuredClone(client)] });
  });

  it('setMonitor on a goal PUTs the goal with monitorUntil set', () => {
    useStore.getState().setMonitor('goal', 'g1', 7);
    expect(bridgePut).toHaveBeenCalledWith('/api/goals/g1',
      expect.objectContaining({ id: 'g1', monitorUntil: expect.any(String) }));
  });

  it('setMonitor(null) on a client PUTs the client with monitorUntil cleared', () => {
    useStore.getState().setMonitor('client', 'c1', null);
    expect(bridgePut).toHaveBeenCalledWith('/api/clients/c1',
      expect.objectContaining({ id: 'c1', monitorUntil: undefined }));
  });

  it('toggleSubtask PUTs the full task with the flipped subtask', () => {
    useStore.getState().toggleSubtask('t1', 0);
    expect(bridgePut).toHaveBeenCalledWith('/api/tasks/t1',
      expect.objectContaining({ id: 't1', subtasks: [expect.objectContaining({ done: true })] }));
  });

  it('addBulkTasks POSTs each task', () => {
    const bulk = [
      { ...structuredClone(task), id: 'b1' },
      { ...structuredClone(task), id: 'b2' },
    ];
    useStore.getState().addBulkTasks(bulk);
    expect(bridgePost).toHaveBeenCalledWith('/api/tasks', expect.objectContaining({ id: 'b1' }));
    expect(bridgePost).toHaveBeenCalledWith('/api/tasks', expect.objectContaining({ id: 'b2' }));
  });
});
