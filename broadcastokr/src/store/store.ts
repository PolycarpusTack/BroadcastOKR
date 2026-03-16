import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Goal, Task, KPI, SyncStatus, Client, GoalTemplate } from '../types';
import { createInitialGoals, createInitialTasks, createInitialKPIs } from '../constants/seedData';
import { goalStatus } from '../utils/colors';
import { migrateKRIds } from './migration';

/** Recalculate goal progress and status from its KRs */
function recalcGoal(goal: Goal): Goal {
  if (goal.keyResults.length === 0) return goal;
  const progress = goal.keyResults.reduce((sum, k) => sum + k.progress, 0) / goal.keyResults.length;
  return { ...goal, progress, status: goalStatus(progress) };
}

interface AppStore {
  goals: Goal[];
  tasks: Task[];
  kpis: KPI[];

  // Goals
  addGoal: (goal: Goal) => void;
  setGoals: (goals: Goal[]) => void;
  checkIn: (goalId: string, krIndex: number) => void;
  updateGoal: (id: string, updates: Partial<Omit<Goal, 'id'>>) => void;
  deleteGoal: (id: string) => void;

  // Live KR sync
  syncLiveKR: (goalId: string, krIndex: number, current: number) => void;
  syncLiveKRError: (goalId: string, krIndex: number, error: string, status?: SyncStatus) => void;
  syncLiveKRBatch: (results: Array<{ goalId: string; krIndex: number; current?: number; error?: string; status: SyncStatus }>) => void;

  setKPIs: (kpis: KPI[]) => void;

  // Tasks
  addTask: (task: Task) => void;
  setTasks: (tasks: Task[]) => void;
  moveTask: (id: string, status: Task['status']) => void;
  toggleSubtask: (taskId: string, subtaskIndex: number) => void;
  addBulkTasks: (tasks: Task[]) => void;
  updateTask: (id: string, updates: Partial<Omit<Task, 'id'>>) => void;
  deleteTask: (id: string) => void;

  // Clients
  clients: Client[];
  addClient: (client: Client) => void;
  updateClient: (id: string, updates: Partial<Omit<Client, 'id'>>) => void;
  deleteClient: (id: string, cascade: boolean) => void;

  // Goal Templates
  goalTemplates: GoalTemplate[];
  addGoalTemplate: (template: GoalTemplate) => void;
  updateGoalTemplate: (id: string, updates: Partial<Omit<GoalTemplate, 'id'>>) => void;
  deleteGoalTemplate: (id: string, cascade: boolean) => void;
  materializeTemplate: (templateId: string, clientIds: string[], ownerIndex?: number) => void;
  syncTemplateToGoals: (templateId: string) => void;
}

export const useStore = create<AppStore>()(
  persist(
    (set) => ({
      goals: createInitialGoals(),
      tasks: createInitialTasks(),
      kpis: createInitialKPIs(),
      clients: [],
      goalTemplates: [],

      addGoal: (goal) => set((s) => ({ goals: [goal, ...s.goals] })),
      setGoals: (goals) => set({ goals }),

      checkIn: (goalId, krIndex) =>
        set((s) => {
          const goals = structuredClone(s.goals);
          const goalIdx = goals.findIndex((g) => g.id === goalId);
          if (goalIdx === -1) return {};
          const kr = goals[goalIdx].keyResults[krIndex];
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
          goals[goalIdx] = recalcGoal(goals[goalIdx]);

          return { goals };
        }),

      syncLiveKR: (goalId, krIndex, current) =>
        set((s) => {
          const goals = structuredClone(s.goals);
          const goalIdx = goals.findIndex((g) => g.id === goalId);
          if (goalIdx === -1) return {};
          const kr = goals[goalIdx].keyResults[krIndex];
          if (!kr) return {};

          kr.current = current;
          const range = Math.abs(kr.target - kr.start);
          kr.progress = range === 0 ? (current === kr.target ? 1 : 0) : Math.min(Math.abs(current - kr.start) / range, 1);
          kr.status = goalStatus(kr.progress);
          kr.syncStatus = 'ok';
          kr.syncError = undefined;
          kr.lastSyncAt = new Date().toISOString();

          goals[goalIdx] = recalcGoal(goals[goalIdx]);
          return { goals };
        }),

      syncLiveKRError: (goalId, krIndex, error, status = 'error') =>
        set((s) => {
          const goals = structuredClone(s.goals);
          const goalIdx = goals.findIndex((g) => g.id === goalId);
          if (goalIdx === -1) return {};
          const kr = goals[goalIdx].keyResults[krIndex];
          if (!kr) return {};

          kr.syncStatus = status;
          kr.syncError = error;
          return { goals };
        }),

      syncLiveKRBatch: (results) =>
        set((s) => {
          const goals = structuredClone(s.goals);
          const goalIndexMap = new Map(goals.map((g, i) => [g.id, i]));
          const touchedGoals = new Set<number>();

          for (const r of results) {
            const goalIdx = goalIndexMap.get(r.goalId) ?? -1;
            if (goalIdx === -1) continue;
            const kr = goals[goalIdx].keyResults[r.krIndex];
            if (!kr) continue;

            if (r.status === 'ok' && r.current !== undefined) {
              kr.current = r.current;
              const range = Math.abs(kr.target - kr.start);
              kr.progress = range === 0 ? (r.current === kr.target ? 1 : 0) : Math.min(Math.abs(r.current - kr.start) / range, 1);
              kr.status = goalStatus(kr.progress);
              kr.syncError = undefined;
              kr.lastSyncAt = new Date().toISOString();
            } else {
              kr.syncError = r.error;
            }
            kr.syncStatus = r.status;
            touchedGoals.add(goalIdx);
          }

          for (const idx of touchedGoals) {
            goals[idx] = recalcGoal(goals[idx]);
          }
          return { goals };
        }),

      setKPIs: (kpis) => set({ kpis }),

      addTask: (task) => set((s) => ({ tasks: [task, ...s.tasks] })),
      setTasks: (tasks) => set({ tasks }),

      moveTask: (id, status) =>
        set((s) => ({
          tasks: s.tasks.map((t) => (t.id === id ? { ...t, status } : t)),
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

      updateTask: (id, updates) =>
        set((s) => ({
          tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
        })),

      deleteTask: (id) =>
        set((s) => ({
          tasks: s.tasks.filter((t) => t.id !== id),
        })),

      updateGoal: (id, updates) =>
        set((s) => {
          const goals = structuredClone(s.goals);
          const idx = goals.findIndex((g) => g.id === id);
          if (idx === -1) return {};
          goals[idx] = recalcGoal({ ...goals[idx], ...updates });
          return { goals };
        }),

      deleteGoal: (id) =>
        set((s) => ({
          goals: s.goals.filter((g) => g.id !== id),
        })),

      addClient: (client) => set((s) => ({ clients: [...s.clients, client] })),

      updateClient: (id, updates) =>
        set((s) => ({
          clients: s.clients.map((c) => (c.id === id ? { ...c, ...updates } : c)),
        })),

      deleteClient: (id, cascade) =>
        set((s) => ({
          clients: s.clients.filter((c) => c.id !== id),
          goals: cascade
            ? s.goals.filter((g) => !(g.clientIds?.includes(id) && g.clientIds.length === 1))
            : s.goals.map((g) => {
                if (!g.clientIds?.includes(id)) return g;
                const remaining = g.clientIds.filter((cid) => cid !== id);
                return remaining.length === 0
                  ? { ...g, clientIds: undefined, channelScope: undefined, templateId: undefined }
                  : { ...g, clientIds: remaining };
              }),
          tasks: cascade
            ? s.tasks.filter((t) => !(t.clientIds?.includes(id) && t.clientIds.length === 1))
            : s.tasks.map((t) => {
                if (!t.clientIds?.includes(id)) return t;
                const remaining = t.clientIds.filter((cid) => cid !== id);
                return remaining.length === 0
                  ? { ...t, clientIds: undefined, channelScope: undefined }
                  : { ...t, clientIds: remaining };
              }),
        })),

      addGoalTemplate: (template) => set((s) => ({ goalTemplates: [...s.goalTemplates, template] })),

      updateGoalTemplate: (id, updates) =>
        set((s) => ({
          goalTemplates: s.goalTemplates.map((t) => (t.id === id ? { ...t, ...updates } : t)),
        })),

      deleteGoalTemplate: (id, cascade) =>
        set((s) => ({
          goalTemplates: s.goalTemplates.filter((t) => t.id !== id),
          goals: cascade
            ? s.goals.filter((g) => g.templateId !== id)
            : s.goals.map((g) => g.templateId === id ? { ...g, templateId: undefined } : g),
        })),

      materializeTemplate: (templateId, clientIds, ownerIndex = 0) =>
        set((s) => {
          const template = s.goalTemplates.find((t) => t.id === templateId);
          if (!template) return {};
          const existingPairs = new Set(
            s.goals
              .filter((g) => g.templateId === templateId)
              .flatMap((g) => g.clientIds ?? []),
          );
          const newGoals: Goal[] = [];
          for (const clientId of clientIds) {
            if (existingPairs.has(clientId)) continue;
            const client = s.clients.find((c) => c.id === clientId);
            if (!client) continue;
            const overrides = client.sqlOverrides?.[templateId] || {};
            newGoals.push({
              id: crypto.randomUUID(),
              title: `${template.title} — ${client.name}`,
              status: 'behind',
              progress: 0,
              owner: ownerIndex,
              channel: 0,
              period: template.period,
              clientIds: [clientId],
              channelScope: { type: 'all' },
              templateId,
              keyResults: template.krTemplates.map((krt) => ({
                id: crypto.randomUUID(),
                title: krt.title,
                start: krt.start,
                target: krt.target,
                current: krt.start,
                progress: 0,
                status: 'behind' as const,
                krTemplateId: krt.id,
                liveConfig: {
                  connectionId: client.connectionId,
                  sql: overrides[krt.id] || krt.sql,
                  unit: krt.unit,
                  direction: krt.direction,
                  timeframeDays: krt.timeframeDays,
                },
                syncStatus: 'pending' as const,
              })),
            });
          }
          return { goals: [...newGoals, ...s.goals] };
        }),

      syncTemplateToGoals: (templateId) =>
        set((s) => {
          const template = s.goalTemplates.find((t) => t.id === templateId);
          if (!template) return {};
          const goals = structuredClone(s.goals);
          const templateKRIds = new Set(template.krTemplates.map((krt) => krt.id));
          for (const goal of goals) {
            if (goal.templateId !== templateId) continue;
            const primaryClientId = goal.clientIds?.[0];
            const client = primaryClientId ? s.clients.find((c) => c.id === primaryClientId) : undefined;
            const overrides = client?.sqlOverrides?.[templateId] || {};

            // Update existing and add new KRs
            for (const krt of template.krTemplates) {
              const existing = goal.keyResults.find((kr) => kr.krTemplateId === krt.id);
              if (existing) {
                if (!overrides[krt.id] && existing.liveConfig) {
                  existing.liveConfig.sql = krt.sql;
                }
              } else {
                goal.keyResults.push({
                  id: crypto.randomUUID(),
                  title: krt.title,
                  start: krt.start,
                  target: krt.target,
                  current: krt.start,
                  progress: 0,
                  status: 'behind',
                  krTemplateId: krt.id,
                  liveConfig: {
                    connectionId: client?.connectionId || '',
                    sql: overrides[krt.id] || krt.sql,
                    unit: krt.unit,
                    direction: krt.direction,
                    timeframeDays: krt.timeframeDays,
                  },
                  syncStatus: 'pending',
                });
              }
            }

            // Remove KRs no longer in the template
            goal.keyResults = goal.keyResults.filter(
              (kr) => !kr.krTemplateId || templateKRIds.has(kr.krTemplateId),
            );
          }
          return { goals };
        }),
    }),
    {
      name: 'broadcastokr-data',
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.goals = migrateKRIds(state.goals);
        }
      },
    },
  ),
);
