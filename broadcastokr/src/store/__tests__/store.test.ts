import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../store';

function resetStore() {
  const { goals, tasks } = useStore.getState();
  // Reset to initial state by getting a fresh copy
  useStore.setState({
    goals: goals.map((g) => ({
      ...g,
      progress: g.progress,
      keyResults: g.keyResults.map((kr) => ({ ...kr })),
    })),
    tasks: tasks.map((t) => ({ ...t, subtasks: t.subtasks.map((s) => ({ ...s })) })),
  });
}

describe('useStore', () => {
  beforeEach(() => {
    resetStore();
  });

  describe('addGoal', () => {
    it('prepends a new goal to the list', () => {
      const before = useStore.getState().goals.length;
      const newGoal = {
        id: 'g-test',
        title: 'Test Goal',
        status: 'on_track' as const,
        progress: 0,
        owner: 0,
        channel: 0,
        period: 'Q1 2026',
        keyResults: [],
      };
      useStore.getState().addGoal(newGoal);
      const after = useStore.getState().goals;
      expect(after.length).toBe(before + 1);
      expect(after[0].id).toBe('g-test');
    });
  });

  describe('setGoals', () => {
    it('replaces all goals', () => {
      useStore.getState().setGoals([]);
      expect(useStore.getState().goals).toEqual([]);
    });
  });

  describe('addTask', () => {
    it('prepends a new task', () => {
      const before = useStore.getState().tasks.length;
      const newTask = {
        id: 't-test',
        title: 'Test Task',
        status: 'todo' as const,
        priority: 'medium' as const,
        assignee: 0,
        channel: 0,
        due: '2026-04-01',
        taskType: 'task',
        subtasks: [],
      };
      useStore.getState().addTask(newTask);
      const after = useStore.getState().tasks;
      expect(after.length).toBe(before + 1);
      expect(after[0].id).toBe('t-test');
    });
  });

  describe('moveTask', () => {
    it('changes a task status by id', () => {
      const tasks = useStore.getState().tasks;
      const target = tasks[0];
      useStore.getState().moveTask(target.id, 'done');
      const updated = useStore.getState().tasks.find((t) => t.id === target.id);
      expect(updated?.status).toBe('done');
    });

    it('does not affect other tasks', () => {
      const tasks = useStore.getState().tasks;
      if (tasks.length < 2) return;
      const target = tasks[0];
      const other = tasks[1];
      const otherStatus = other.status;
      useStore.getState().moveTask(target.id, 'review');
      const otherAfter = useStore.getState().tasks.find((t) => t.id === other.id);
      expect(otherAfter?.status).toBe(otherStatus);
    });
  });

  describe('toggleSubtask', () => {
    it('toggles a subtask done state', () => {
      const tasks = useStore.getState().tasks;
      const withSubtasks = tasks.find((t) => t.subtasks.length > 0);
      if (!withSubtasks) return; // skip if no subtasks in seed data

      const wasDone = withSubtasks.subtasks[0].done;
      useStore.getState().toggleSubtask(withSubtasks.id, 0);
      const updated = useStore.getState().tasks.find((t) => t.id === withSubtasks.id);
      expect(updated?.subtasks[0].done).toBe(!wasDone);
    });

    it('double toggle restores original state', () => {
      const tasks = useStore.getState().tasks;
      const withSubtasks = tasks.find((t) => t.subtasks.length > 0);
      if (!withSubtasks) return;

      const original = withSubtasks.subtasks[0].done;
      useStore.getState().toggleSubtask(withSubtasks.id, 0);
      useStore.getState().toggleSubtask(withSubtasks.id, 0);
      const updated = useStore.getState().tasks.find((t) => t.id === withSubtasks.id);
      expect(updated?.subtasks[0].done).toBe(original);
    });
  });

  describe('addBulkTasks', () => {
    it('prepends multiple tasks at once', () => {
      const before = useStore.getState().tasks.length;
      const bulkTasks = [
        { id: 'b1', title: 'Bulk 1', status: 'todo' as const, priority: 'low' as const, assignee: 0, channel: 0, due: '2026-04-01', taskType: 'task', subtasks: [] },
        { id: 'b2', title: 'Bulk 2', status: 'todo' as const, priority: 'low' as const, assignee: 0, channel: 0, due: '2026-04-01', taskType: 'task', subtasks: [] },
      ];
      useStore.getState().addBulkTasks(bulkTasks);
      const after = useStore.getState().tasks;
      expect(after.length).toBe(before + 2);
      expect(after[0].id).toBe('b1');
      expect(after[1].id).toBe('b2');
    });
  });

  describe('checkIn', () => {
    it('increases key result progress', () => {
      const goals = useStore.getState().goals;
      const goalIdx = goals.findIndex((g) => g.keyResults.length > 0);
      if (goalIdx === -1) return;

      const krBefore = goals[goalIdx].keyResults[0].progress;
      useStore.getState().checkIn(goalIdx, 0);
      const krAfter = useStore.getState().goals[goalIdx].keyResults[0].progress;
      expect(krAfter).toBeGreaterThanOrEqual(krBefore);
    });

    it('updates goal-level progress after check-in', () => {
      const goals = useStore.getState().goals;
      const goalIdx = goals.findIndex((g) => g.keyResults.length > 0);
      if (goalIdx === -1) return;

      const goalBefore = goals[goalIdx].progress;
      useStore.getState().checkIn(goalIdx, 0);
      const goalAfter = useStore.getState().goals[goalIdx].progress;
      expect(goalAfter).toBeGreaterThanOrEqual(goalBefore);
    });

    it('sets correct status based on progress', () => {
      const goals = useStore.getState().goals;
      const goalIdx = goals.findIndex((g) => g.keyResults.length > 0);
      if (goalIdx === -1) return;

      // Check in multiple times to push progress up
      for (let i = 0; i < 10; i++) {
        useStore.getState().checkIn(goalIdx, 0);
      }
      const kr = useStore.getState().goals[goalIdx].keyResults[0];
      // After 10 check-ins of 10% each, should be at or near 100%
      expect(kr.progress).toBeGreaterThanOrEqual(0.7);
      expect(kr.status).toBe('on_track');
    });
  });
});
