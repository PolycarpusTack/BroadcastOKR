import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Goal, Task, KPI } from '../types';
import type { GoalStatus } from '../types';
import { createInitialGoals, createInitialTasks, createInitialKPIs } from '../constants/seedData';

function goalStatus(progress: number): GoalStatus {
  if (progress >= 0.7) return 'on_track';
  if (progress >= 0.4) return 'at_risk';
  return 'behind';
}

interface AppStore {
  goals: Goal[];
  tasks: Task[];
  kpis: KPI[];

  // Goals
  addGoal: (goal: Goal) => void;
  setGoals: (goals: Goal[]) => void;
  checkIn: (goalIndex: number, krIndex: number) => void;

  // Tasks
  addTask: (task: Task) => void;
  setTasks: (tasks: Task[]) => void;
  moveTask: (id: string, status: string) => void;
  toggleSubtask: (taskId: string, subtaskIndex: number) => void;
  addBulkTasks: (tasks: Task[]) => void;
}

export const useStore = create<AppStore>()(
  persist(
    (set) => ({
      goals: createInitialGoals(),
      tasks: createInitialTasks(),
      kpis: createInitialKPIs(),

      addGoal: (goal) => set((s) => ({ goals: [goal, ...s.goals] })),
      setGoals: (goals) => set({ goals }),

      checkIn: (goalIndex, krIndex) =>
        set((s) => {
          const goals = structuredClone(s.goals);
          const kr = goals[goalIndex].keyResults[krIndex];
          const range = Math.abs(kr.target - kr.start);

          if (range === 0) {
            kr.progress = 1;
            kr.current = kr.target;
          } else {
            const inc = range * 0.1;
            kr.current = kr.target > kr.start
              ? Math.min(kr.current + inc, kr.target)
              : Math.max(kr.current - inc, kr.target);
            kr.progress = Math.min(Math.abs(kr.current - kr.start) / range, 1);
          }

          kr.status = goalStatus(kr.progress);

          const g = goals[goalIndex];
          g.progress = g.keyResults.reduce((sum, k) => sum + k.progress, 0) / g.keyResults.length;
          g.status = goalStatus(g.progress);

          return { goals };
        }),

      addTask: (task) => set((s) => ({ tasks: [task, ...s.tasks] })),
      setTasks: (tasks) => set({ tasks }),

      moveTask: (id, status) =>
        set((s) => ({
          tasks: s.tasks.map((t) => (t.id === id ? { ...t, status: status as Task['status'] } : t)),
        })),

      toggleSubtask: (taskId, subtaskIndex) =>
        set((s) => ({
          tasks: s.tasks.map((t) => {
            if (t.id !== taskId) return t;
            const subtasks = [...t.subtasks];
            subtasks[subtaskIndex] = { ...subtasks[subtaskIndex], done: !subtasks[subtaskIndex].done };
            return { ...t, subtasks };
          }),
        })),

      addBulkTasks: (newTasks) => set((s) => ({ tasks: [...newTasks, ...s.tasks] })),
    }),
    { name: 'broadcastokr-data' },
  ),
);
