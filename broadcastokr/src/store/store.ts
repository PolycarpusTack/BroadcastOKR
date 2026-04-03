import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Goal, Task, KPI, SyncStatus, Client, GoalTemplate, Confidence, User, Team } from '../types';
import { createInitialGoals, createInitialTasks, createInitialKPIs } from '../constants/seedData';
import { createInitialUsers } from '../constants/users';
import { createInitialTeams } from '../constants/teams';
import { goalStatus } from '../utils/colors';
import { migrateClientChannelScopes, migrateKRIds } from './migration';
import { pruneHistory } from '../utils/history';
import { bridgePost, bridgePut, bridgeDelete } from './bridgeSync';

/** Recalculate goal progress and status from its KRs */
function recalcGoal(goal: Goal): Goal {
  if (goal.keyResults.length === 0) return goal;
  const progress = goal.keyResults.reduce((sum, k) => sum + k.progress, 0) / goal.keyResults.length;
  return { ...goal, progress, status: goalStatus(progress) };
}

function isMonitorActive(until?: string): boolean {
  return !!until && new Date(until) > new Date();
}

interface AppStore {
  goals: Goal[];
  tasks: Task[];
  kpis: KPI[];

  // Goals
  addGoal: (goal: Goal) => void;
  setGoals: (goals: Goal[]) => void;
  checkInKR: (goalId: string, krId: string, entry: { value: number; confidence?: Confidence; note?: string; actor: string }) => void;
  setMonitor: (type: 'goal' | 'client', id: string, days: number | null) => void;
  updateGoal: (id: string, updates: Partial<Omit<Goal, 'id'>>) => void;
  deleteGoal: (id: string) => void;

  // Live KR sync
  syncLiveKR: (goalId: string, krId: string, current: number) => void;
  syncLiveKRError: (goalId: string, krId: string, error: string, status?: SyncStatus) => void;
  syncLiveKRBatch: (results: Array<{ goalId: string; krId: string; current?: number; error?: string; status: SyncStatus }>) => void;

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

  // Users & Teams
  users: User[];
  teams: Team[];
  addUser: (user: User) => void;
  updateUser: (id: number, updates: Partial<Omit<User, 'id'>>) => void;
  deleteUser: (id: number, reassignTo: number | null) => void;
  addTeam: (team: Team) => void;
  updateTeam: (id: string, updates: Partial<Omit<Team, 'id'>>) => void;
  deleteTeam: (id: string) => void;

  // Goal Templates
  goalTemplates: GoalTemplate[];
  addGoalTemplate: (template: GoalTemplate) => void;
  updateGoalTemplate: (id: string, updates: Partial<Omit<GoalTemplate, 'id'>>) => void;
  deleteGoalTemplate: (id: string, cascade: boolean) => void;
  materializeTemplate: (templateId: string, clientIds: string[], ownerIndex?: number) => void;
  syncTemplateToGoals: (templateId: string) => void;

  // Bridge sync
  _initFromBridge: (state: { goals: Goal[]; tasks: Task[]; clients: Client[]; goalTemplates: GoalTemplate[]; users: User[]; teams: Team[]; kpis: KPI[] }) => void;
  _mergeChanges: (changes: { goals?: Goal[]; tasks?: Task[]; clients?: Client[]; goalTemplates?: GoalTemplate[]; users?: User[]; teams?: Team[]; kpis?: KPI[] }) => void;
}

export const useStore = create<AppStore>()(
  persist(
    (set, get) => ({
      goals: createInitialGoals(),
      tasks: createInitialTasks(),
      kpis: createInitialKPIs(),
      clients: [],
      users: createInitialUsers(),
      teams: createInitialTeams(),
      goalTemplates: [],

      addGoal: (goal) => {
        set((s) => ({ goals: [goal, ...s.goals] }));
        bridgePost('/api/goals', goal).catch(console.error);
      },
      setGoals: (goals) => set({ goals }),

      checkInKR: (goalId, krId, entry) => {
        set((s) => {
          const goals = structuredClone(s.goals);
          const goalIdx = goals.findIndex((g) => g.id === goalId);
          if (goalIdx === -1) return {};
          const kr = goals[goalIdx].keyResults.find((k) => k.id === krId);
          if (!kr) return {};

          if (!kr.history) kr.history = [];
          kr.history.push({
            timestamp: new Date().toISOString(),
            value: entry.value,
            confidence: entry.confidence,
            note: entry.note,
            actor: entry.actor,
            source: 'check-in',
          });

          if (!kr.liveConfig) {
            kr.current = entry.value;
            const range = Math.abs(kr.target - kr.start);
            kr.progress = range === 0
              ? (kr.current === kr.target ? 1 : 0)
              : Math.min(Math.abs(kr.current - kr.start) / range, 1);
            kr.status = goalStatus(kr.progress);
          }

          kr.history = pruneHistory(kr.history);
          goals[goalIdx] = recalcGoal(goals[goalIdx]);

          return { goals };
        });
        bridgePost(`/api/goals/${goalId}/check-in`, { krId, value: entry.value, confidence: entry.confidence, note: entry.note, actor: entry.actor }).catch(console.error);
      },

      setMonitor: (type, id, days) =>
        set((s) => {
          const monitorUntil = days === null
            ? undefined
            : new Date(Date.now() + days * 86400000).toISOString();

          if (type === 'goal') {
            return {
              goals: s.goals.map((g) =>
                g.id === id ? { ...g, monitorUntil } : g,
              ),
            };
          }
          return {
            clients: s.clients.map((c) =>
              c.id === id ? { ...c, monitorUntil } : c,
            ),
          };
        }),

      syncLiveKR: (goalId, krId, current) =>
        set((s) => {
          const goals = structuredClone(s.goals);
          const goalIdx = goals.findIndex((g) => g.id === goalId);
          if (goalIdx === -1) return {};
          const goal = goals[goalIdx];
          const kr = goal.keyResults.find((k) => k.id === krId);
          if (!kr) return {};

          kr.current = current;
          const range = Math.abs(kr.target - kr.start);
          kr.progress = range === 0 ? (current === kr.target ? 1 : 0) : Math.min(Math.abs(current - kr.start) / range, 1);
          kr.status = goalStatus(kr.progress);
          kr.syncStatus = 'ok';
          kr.syncError = undefined;
          kr.lastSyncAt = new Date().toISOString();

          const shouldRecord = isMonitorActive(goal.monitorUntil)
            || goal.clientIds?.some((cid) => isMonitorActive(s.clients.find((c) => c.id === cid)?.monitorUntil));
          if (shouldRecord) {
            if (!kr.history) kr.history = [];
            kr.history.push({
              timestamp: new Date().toISOString(),
              value: current,
              actor: 'system',
              source: 'sync',
            });
            kr.history = pruneHistory(kr.history);
          }

          goals[goalIdx] = recalcGoal(goal);
          return { goals };
        }),

      syncLiveKRError: (goalId, krId, error, status = 'error') =>
        set((s) => {
          const goals = structuredClone(s.goals);
          const goalIdx = goals.findIndex((g) => g.id === goalId);
          if (goalIdx === -1) return {};
          const kr = goals[goalIdx].keyResults.find((k) => k.id === krId);
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
            const goal = goals[goalIdx];
            const kr = goal.keyResults.find((k) => k.id === r.krId);
            if (!kr) continue;

            if (r.status === 'ok' && r.current !== undefined) {
              kr.current = r.current;
              const range = Math.abs(kr.target - kr.start);
              kr.progress = range === 0 ? (r.current === kr.target ? 1 : 0) : Math.min(Math.abs(r.current - kr.start) / range, 1);
              kr.status = goalStatus(kr.progress);
              kr.syncError = undefined;
              kr.lastSyncAt = new Date().toISOString();

              const shouldRecord = isMonitorActive(goal.monitorUntil)
                || goal.clientIds?.some((cid) => isMonitorActive(s.clients.find((c) => c.id === cid)?.monitorUntil));
              if (shouldRecord) {
                if (!kr.history) kr.history = [];
                kr.history.push({
                  timestamp: new Date().toISOString(),
                  value: r.current,
                  actor: 'system',
                  source: 'sync',
                });
                kr.history = pruneHistory(kr.history);
              }
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

      addTask: (task) => {
        set((s) => ({ tasks: [task, ...s.tasks] }));
        bridgePost('/api/tasks', task).catch(console.error);
      },
      setTasks: (tasks) => set({ tasks }),

      moveTask: (id, status) => {
        set((s) => ({
          tasks: s.tasks.map((t) => (t.id === id ? { ...t, status } : t)),
        }));
        const full = get().tasks.find((t) => t.id === id);
        if (full) bridgePut(`/api/tasks/${id}`, full).catch(console.error);
      },

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

      updateTask: (id, updates) => {
        set((s) => ({
          tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
        }));
        const full = get().tasks.find((t) => t.id === id);
        if (full) bridgePut(`/api/tasks/${id}`, full).catch(console.error);
      },

      deleteTask: (id) => {
        set((s) => ({
          tasks: s.tasks.filter((t) => t.id !== id),
        }));
        bridgeDelete(`/api/tasks/${id}`).catch(console.error);
      },

      updateGoal: (id, updates) => {
        set((s) => {
          const goals = structuredClone(s.goals);
          const idx = goals.findIndex((g) => g.id === id);
          if (idx === -1) return {};
          goals[idx] = recalcGoal({ ...goals[idx], ...updates });
          return { goals };
        });
        const full = get().goals.find((g) => g.id === id);
        if (full) bridgePut(`/api/goals/${id}`, full).catch(console.error);
      },

      deleteGoal: (id) => {
        set((s) => ({
          goals: s.goals.filter((g) => g.id !== id),
        }));
        bridgeDelete(`/api/goals/${id}`).catch(console.error);
      },

      addClient: (client) => {
        set((s) => ({ clients: [...s.clients, client] }));
        bridgePost('/api/clients', client).catch(console.error);
      },

      updateClient: (id, updates) => {
        set((s) => {
          const oldClient = s.clients.find((c) => c.id === id);
          const connectionChanged = updates.connectionId !== undefined && oldClient && oldClient.connectionId !== updates.connectionId;
          const nextConnectionId = typeof updates.connectionId === 'string' ? updates.connectionId : undefined;
          const updatedClients = s.clients.map((c) => {
            if (c.id !== id) return c;
            return {
              ...c,
              ...updates,
              ...(connectionChanged ? { channels: [] } : {}),
            };
          });
          // If connectionId changed, rebind existing live KRs for this client's goals
          if (connectionChanged && oldClient) {
            const goals = structuredClone(s.goals);
            const tasks = structuredClone(s.tasks);
            for (const goal of goals) {
              if (!goal.clientIds?.includes(id)) continue;
              for (const kr of goal.keyResults) {
                if (kr.liveConfig && kr.liveConfig.connectionId === oldClient.connectionId) {
                  kr.liveConfig.connectionId = nextConnectionId ?? '';
                  kr.syncStatus = 'pending';
                  kr.syncError = undefined;
                }
              }
              if (goal.channelScope?.type === 'selected') {
                goal.channelScope.channels = goal.channelScope.channels.filter((channel) => channel.clientId !== id);
                if (goal.channelScope.channels.length === 0) {
                  goal.channelScope = { type: 'all' };
                }
              }
            }
            for (const task of tasks) {
              if (!task.clientIds?.includes(id) || task.channelScope?.type !== 'selected') continue;
              task.channelScope.channels = task.channelScope.channels.filter((channel) => channel.clientId !== id);
              if (task.channelScope.channels.length === 0) {
                task.channelScope = { type: 'all' };
              }
            }
            return { clients: updatedClients, goals, tasks };
          }
          return { clients: updatedClients };
        });
        const full = get().clients.find((c) => c.id === id);
        if (full) bridgePut(`/api/clients/${id}`, full).catch(console.error);
      },

      deleteClient: (id, cascade) => {
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
          users: s.users.map((u) => u.clientIds?.includes(id)
            ? { ...u, clientIds: u.clientIds.filter((cid) => cid !== id) }
            : u),
          teams: s.teams.map((t) => t.clientIds?.includes(id)
            ? { ...t, clientIds: t.clientIds.filter((cid) => cid !== id) }
            : t),
        }));
        bridgeDelete(`/api/clients/${id}`).catch(console.error);
      },

      addUser: (user) => {
        set((s) => ({ users: [...s.users, user] }));
        bridgePost('/api/users', user).catch(console.error);
      },

      updateUser: (id, updates) => {
        set((s) => ({
          users: s.users.map((u) => (u.id === id ? { ...u, ...updates } : u)),
        }));
        const full = get().users.find((u) => u.id === id);
        if (full) bridgePut(`/api/users/${id}`, full).catch(console.error);
      },

      deleteUser: (id, reassignTo) => {
        set((s) => {
          if (s.users.length <= 1) return {};
          const remaining = s.users.filter((u) => u.id !== id);
          const target = reassignTo ?? remaining[0]?.id;
          return {
            users: s.users.filter((u) => u.id !== id),
            tasks: s.tasks.map((t) => (t.assignee === id ? { ...t, assignee: target } : t)),
            goals: s.goals.map((g) => (g.owner === id ? { ...g, owner: target } : g)),
            teams: s.teams.map((t) => ({
              ...t,
              members: t.members.filter((m) => m !== id),
              leadId: t.leadId === id ? undefined : t.leadId,
            })),
          };
        });
        bridgeDelete(`/api/users/${id}`).catch(console.error);
      },

      addTeam: (team) => {
        set((s) => ({ teams: [...s.teams, team] }));
        bridgePost('/api/teams', team).catch(console.error);
      },

      updateTeam: (id, updates) => {
        set((s) => ({
          teams: s.teams.map((t) => {
            if (t.id !== id) return t;
            const updated = { ...t, ...updates };
            if (updated.leadId !== undefined && !updated.members.includes(updated.leadId)) {
              updated.leadId = undefined;
            }
            return updated;
          }),
        }));
        const full = get().teams.find((t) => t.id === id);
        if (full) bridgePut(`/api/teams/${id}`, full).catch(console.error);
      },

      deleteTeam: (id) => {
        set((s) => ({
          teams: s.teams.filter((t) => t.id !== id),
        }));
        bridgeDelete(`/api/teams/${id}`).catch(console.error);
      },

      addGoalTemplate: (template) => {
        set((s) => ({ goalTemplates: [...s.goalTemplates, template] }));
        bridgePost('/api/goal-templates', template).catch(console.error);
      },

      updateGoalTemplate: (id, updates) => {
        set((s) => ({
          goalTemplates: s.goalTemplates.map((t) => (t.id === id ? { ...t, ...updates } : t)),
        }));
        const full = get().goalTemplates.find((t) => t.id === id);
        if (full) bridgePut(`/api/goal-templates/${id}`, full).catch(console.error);
      },

      deleteGoalTemplate: (id, cascade) => {
        set((s) => ({
          goalTemplates: s.goalTemplates.filter((t) => t.id !== id),
          goals: cascade
            ? s.goals.filter((g) => g.templateId !== id)
            : s.goals.map((g) => g.templateId === id ? { ...g, templateId: undefined } : g),
        }));
        bridgeDelete(`/api/goal-templates/${id}`).catch(console.error);
      },

      materializeTemplate: (templateId, clientIds, ownerIndex = 0) => {
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
        });
        bridgePost(`/api/goal-templates/${templateId}/materialize`, { clientIds, ownerIndex }).catch(console.error);
      },

      syncTemplateToGoals: (templateId) => {
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
                // Sync all template-managed fields
                existing.title = krt.title;
                existing.start = krt.start;
                existing.target = krt.target;
                if (existing.liveConfig) {
                  existing.liveConfig.sql = overrides[krt.id] || krt.sql;
                  existing.liveConfig.unit = krt.unit;
                  existing.liveConfig.direction = krt.direction;
                  existing.liveConfig.timeframeDays = krt.timeframeDays;
                  // Rebind to current client connection
                  if (client?.connectionId) {
                    existing.liveConfig.connectionId = client.connectionId;
                  }
                }
                // Recalc progress with potentially new start/target
                const range = Math.abs(existing.target - existing.start);
                existing.progress = range === 0
                  ? (existing.current === existing.target ? 1 : 0)
                  : Math.min(Math.abs(existing.current - existing.start) / range, 1);
                existing.status = goalStatus(existing.progress);
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

            // Recalculate goal-level progress after KR changes
            const updated = recalcGoal(goal);
            goal.progress = updated.progress;
            goal.status = updated.status;
          }
          return { goals };
        });
        bridgePost(`/api/goal-templates/${templateId}/sync`, {}).catch(console.error);
      },

      // Bridge sync actions
      _initFromBridge: (state) => set(() => ({
        goals: state.goals ?? [],
        tasks: state.tasks ?? [],
        kpis: state.kpis ?? [],
        clients: state.clients ?? [],
        users: state.users ?? [],
        teams: state.teams ?? [],
        goalTemplates: state.goalTemplates ?? [],
      })),

      _mergeChanges: (changes) => set((s) => {
        const result: Partial<Pick<AppStore, 'goals' | 'tasks' | 'kpis' | 'clients' | 'users' | 'teams' | 'goalTemplates'>> = {};

        if (changes.goals) {
          const changedMap = new Map(changes.goals.map((g) => [g.id, g]));
          const merged = s.goals.map((g) => changedMap.get(g.id) ?? g);
          const existingIds = new Set(s.goals.map((g) => g.id));
          for (const g of changes.goals) {
            if (!existingIds.has(g.id)) merged.push(g);
          }
          result.goals = merged;
        }

        if (changes.tasks) {
          const changedMap = new Map(changes.tasks.map((t) => [t.id, t]));
          const merged = s.tasks.map((t) => changedMap.get(t.id) ?? t);
          const existingIds = new Set(s.tasks.map((t) => t.id));
          for (const t of changes.tasks) {
            if (!existingIds.has(t.id)) merged.push(t);
          }
          result.tasks = merged;
        }

        if (changes.kpis) {
          const changedMap = new Map(changes.kpis.map((k) => [k.name, k]));
          const merged = s.kpis.map((k) => changedMap.get(k.name) ?? k);
          const existingNames = new Set(s.kpis.map((k) => k.name));
          for (const k of changes.kpis) {
            if (!existingNames.has(k.name)) merged.push(k);
          }
          result.kpis = merged;
        }

        if (changes.clients) {
          const changedMap = new Map(changes.clients.map((c) => [c.id, c]));
          const merged = s.clients.map((c) => changedMap.get(c.id) ?? c);
          const existingIds = new Set(s.clients.map((c) => c.id));
          for (const c of changes.clients) {
            if (!existingIds.has(c.id)) merged.push(c);
          }
          result.clients = merged;
        }

        if (changes.users) {
          const changedMap = new Map(changes.users.map((u) => [u.id, u]));
          const merged = s.users.map((u) => changedMap.get(u.id) ?? u);
          const existingIds = new Set(s.users.map((u) => u.id));
          for (const u of changes.users) {
            if (!existingIds.has(u.id)) merged.push(u);
          }
          result.users = merged;
        }

        if (changes.teams) {
          const changedMap = new Map(changes.teams.map((t) => [t.id, t]));
          const merged = s.teams.map((t) => changedMap.get(t.id) ?? t);
          const existingIds = new Set(s.teams.map((t) => t.id));
          for (const t of changes.teams) {
            if (!existingIds.has(t.id)) merged.push(t);
          }
          result.teams = merged;
        }

        if (changes.goalTemplates) {
          const changedMap = new Map(changes.goalTemplates.map((t) => [t.id, t]));
          const merged = s.goalTemplates.map((t) => changedMap.get(t.id) ?? t);
          const existingIds = new Set(s.goalTemplates.map((t) => t.id));
          for (const t of changes.goalTemplates) {
            if (!existingIds.has(t.id)) merged.push(t);
          }
          result.goalTemplates = merged;
        }

        return result;
      }),
    }),
    {
      name: 'broadcastokr-data',
      version: 1,
      storage: {
        getItem: (name) => {
          const value = localStorage.getItem(name);
          return value ? JSON.parse(value) : null;
        },
        setItem: (name, value) => {
          try {
            localStorage.setItem(name, JSON.stringify(value));
          } catch (e) {
            if (e instanceof DOMException && e.name === 'QuotaExceededError') {
              console.warn('localStorage quota exceeded — state not persisted');
              window.dispatchEvent(new CustomEvent('storage-quota-exceeded'));
            } else {
              throw e;
            }
          }
        },
        removeItem: (name) => localStorage.removeItem(name),
      },
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.goals = migrateKRIds(state.goals);
          const migrated = migrateClientChannelScopes(state.goals, state.tasks, state.clients);
          state.goals = migrated.goals;
          state.tasks = migrated.tasks;
          if (!state.users || state.users.length === 0) {
            state.users = createInitialUsers();
          }
          if (!state.teams || state.teams.length === 0) {
            state.teams = createInitialTeams();
          }
        }
      },
    },
  ),
);
