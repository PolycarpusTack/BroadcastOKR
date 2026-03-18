import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../store';
import { createInitialGoals, createInitialTasks, createInitialKPIs } from '../../constants/seedData';

function resetStore() {
  useStore.setState({
    goals: createInitialGoals(),
    tasks: createInitialTasks(),
    kpis: createInitialKPIs(),
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
      if (!withSubtasks) return;

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

  describe('updateTask', () => {
    it('updates task fields by id', () => {
      const task = useStore.getState().tasks[0];
      useStore.getState().updateTask(task.id, { title: 'Updated Title', description: 'A description' });
      const updated = useStore.getState().tasks.find((t) => t.id === task.id);
      expect(updated?.title).toBe('Updated Title');
      expect(updated?.description).toBe('A description');
    });

    it('does not affect other tasks', () => {
      const tasks = useStore.getState().tasks;
      if (tasks.length < 2) return;
      const target = tasks[0];
      const other = tasks[1];
      const otherTitle = other.title;
      useStore.getState().updateTask(target.id, { title: 'Changed' });
      expect(useStore.getState().tasks.find((t) => t.id === other.id)?.title).toBe(otherTitle);
    });
  });

  describe('deleteTask', () => {
    it('removes a task by id', () => {
      const before = useStore.getState().tasks.length;
      const target = useStore.getState().tasks[0];
      useStore.getState().deleteTask(target.id);
      const after = useStore.getState().tasks;
      expect(after.length).toBe(before - 1);
      expect(after.find((t) => t.id === target.id)).toBeUndefined();
    });
  });

  describe('updateGoal', () => {
    it('updates goal fields and recalculates progress', () => {
      const goal = useStore.getState().goals.find((g) => g.keyResults.length > 0);
      if (!goal) return;
      const newKRs = goal.keyResults.map((kr) => ({ ...kr, progress: 1, current: kr.target, status: 'on_track' as const }));
      useStore.getState().updateGoal(goal.id, { title: 'Updated Goal', keyResults: newKRs });
      const updated = useStore.getState().goals.find((g) => g.id === goal.id);
      expect(updated?.title).toBe('Updated Goal');
      expect(updated?.progress).toBe(1);
      expect(updated?.status).toBe('on_track');
    });
  });

  describe('deleteGoal', () => {
    it('removes a goal by id', () => {
      const before = useStore.getState().goals.length;
      const target = useStore.getState().goals[0];
      useStore.getState().deleteGoal(target.id);
      const after = useStore.getState().goals;
      expect(after.length).toBe(before - 1);
      expect(after.find((g) => g.id === target.id)).toBeUndefined();
    });
  });

});
