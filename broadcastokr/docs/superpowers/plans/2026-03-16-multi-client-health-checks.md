# Multi-Client Health Check Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Client entities, Goal Templates, materialization, and a comparison dashboard so the same Health Check goals can be evaluated across 15+ client databases simultaneously.

**Architecture:** New `Client` and `GoalTemplate` types in the Zustand store. Templates materialize into regular `Goal` objects (one per client) with Live KRs pointing at each client's database connection. A new Compare page renders a client×KR matrix. The bridge's `execute-batch` endpoint is parallelized for scale.

**Tech Stack:** React 19, TypeScript, Zustand 5 (persist), Express bridge, existing inline styles conventions.

**Spec:** `docs/superpowers/specs/2026-03-16-multi-client-health-checks-design.md`

---

## Chunk 1: Types, Store, and Bridge Parallelization

### Task 1: Add new types and extend existing types

**Files:**
- Modify: `src/types/index.ts:61-87`

- [ ] **Step 1: Write test for KR ID migration helper**

Create `src/store/__tests__/migration.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { migrateKRIds } from '../migration';
import type { Goal } from '../../types';

describe('migrateKRIds', () => {
  it('adds id to KeyResults that lack one', () => {
    const goals: Goal[] = [{
      id: 'g1', title: 'Test', status: 'on_track', progress: 0.5,
      owner: 0, channel: 0, period: 'Q1 2026',
      keyResults: [{ title: 'KR1', start: 0, target: 100, current: 50, progress: 0.5, status: 'on_track' }],
    }];
    const result = migrateKRIds(goals);
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/store/__tests__/migration.test.ts`
Expected: FAIL — `migrateKRIds` does not exist yet.

- [ ] **Step 3: Add types to `src/types/index.ts`**

Add `id` and `krTemplateId` to `KeyResult` (after line 62):

```ts
export interface KeyResult {
  id: string;
  title: string;
  start: number;
  target: number;
  current: number;
  progress: number;
  status: GoalStatus;
  liveConfig?: LiveKRConfig;
  syncStatus?: SyncStatus;
  syncError?: string;
  lastSyncAt?: string;
  /** Links to KRTemplate.id for template sync matching */
  krTemplateId?: string;
}
```

Add `clientId` and `templateId` to `Goal` (after line 86):

```ts
export interface Goal {
  id: string;
  title: string;
  status: GoalStatus;
  progress: number;
  owner: number;
  channel: number;
  period: string;
  keyResults: KeyResult[];
  /** Links to Client.id — present on materialized goals */
  clientId?: string;
  /** Links to GoalTemplate.id — present on materialized goals */
  templateId?: string;
}
```

Add new types at the end of the file (before the closing):

```ts
export interface Client {
  id: string;
  name: string;
  connectionId: string;
  logo?: string;
  color: string;
  tags?: string[];
  /** templateId → { krTemplateId → custom SQL } */
  sqlOverrides?: Record<string, Record<string, string>>;
}

export interface KRTemplate {
  id: string;
  title: string;
  sql: string;
  unit: string;
  direction: 'hi' | 'lo';
  start: number;
  target: number;
  timeframeDays?: number;
}

export interface GoalTemplate {
  id: string;
  title: string;
  category: string;
  period: string;
  syncIntervalMs?: number;
  krTemplates: KRTemplate[];
}
```

- [ ] **Step 4: Create migration helper `src/store/migration.ts`**

```ts
import type { Goal } from '../types';

/** Ensure all KeyResults have an `id` field (migration for pre-existing data) */
export function migrateKRIds(goals: Goal[]): Goal[] {
  let anyChanged = false;
  const result = goals.map((g) => {
    let goalChanged = false;
    const krs = g.keyResults.map((kr) => {
      if (kr.id) return kr;
      goalChanged = true;
      return { ...kr, id: crypto.randomUUID() };
    });
    if (goalChanged) anyChanged = true;
    return goalChanged ? { ...g, keyResults: krs } : g;
  });
  return anyChanged ? result : goals;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/store/__tests__/migration.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts src/store/migration.ts src/store/__tests__/migration.test.ts
git commit -m "feat: add Client, GoalTemplate types and KR ID migration"
```

---

### Task 2: Add client and template store slices

**Files:**
- Modify: `src/store/store.ts`
- Create: `src/store/__tests__/clients.test.ts`

- [ ] **Step 1: Write tests for client and template store actions**

Create `src/store/__tests__/clients.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../store';
import type { Client, GoalTemplate } from '../../types';

const testClient: Client = {
  id: 'test-vrt', name: 'VRT', connectionId: 'conn-1',
  color: '#3805E3', tags: ['tier-1'],
};

const testTemplate: GoalTemplate = {
  id: 'tpl-1', title: 'HC - Long Term Planning', category: 'Health Check',
  period: 'Q1 2026',
  krTemplates: [
    { id: 'kr-tpl-1', title: 'Rights Coverage', sql: 'SELECT COUNT(*) FROM psi.rights', unit: '%', direction: 'hi', start: 0, target: 100 },
    { id: 'kr-tpl-2', title: 'Media Coverage', sql: 'SELECT COUNT(*) FROM psi.media', unit: '%', direction: 'hi', start: 0, target: 100 },
  ],
};

beforeEach(() => {
  useStore.setState({ clients: [], goalTemplates: [], goals: [] });
});

describe('client actions', () => {
  it('addClient adds a client', () => {
    useStore.getState().addClient(testClient);
    expect(useStore.getState().clients).toHaveLength(1);
    expect(useStore.getState().clients[0].name).toBe('VRT');
  });

  it('updateClient updates fields', () => {
    useStore.getState().addClient(testClient);
    useStore.getState().updateClient('test-vrt', { name: 'VRT Updated' });
    expect(useStore.getState().clients[0].name).toBe('VRT Updated');
  });

  it('deleteClient with cascade removes client and its goals', () => {
    useStore.getState().addClient(testClient);
    useStore.getState().addGoalTemplate(testTemplate);
    useStore.getState().materializeTemplate('tpl-1', ['test-vrt']);
    expect(useStore.getState().goals.some(g => g.clientId === 'test-vrt')).toBe(true);

    useStore.getState().deleteClient('test-vrt', true);
    expect(useStore.getState().clients).toHaveLength(0);
    expect(useStore.getState().goals.some(g => g.clientId === 'test-vrt')).toBe(false);
  });

  it('deleteClient without cascade unlinks goals', () => {
    useStore.getState().addClient(testClient);
    useStore.getState().addGoalTemplate(testTemplate);
    useStore.getState().materializeTemplate('tpl-1', ['test-vrt']);

    useStore.getState().deleteClient('test-vrt', false);
    expect(useStore.getState().clients).toHaveLength(0);
    const remaining = useStore.getState().goals.filter(g => g.templateId === 'tpl-1');
    expect(remaining.length).toBeGreaterThan(0);
    expect(remaining[0].clientId).toBeUndefined();
    expect(remaining[0].templateId).toBeUndefined();
  });
});

describe('template actions', () => {
  it('addGoalTemplate adds a template', () => {
    useStore.getState().addGoalTemplate(testTemplate);
    expect(useStore.getState().goalTemplates).toHaveLength(1);
  });

  it('deleteGoalTemplate with cascade removes template and goals', () => {
    useStore.getState().addClient(testClient);
    useStore.getState().addGoalTemplate(testTemplate);
    useStore.getState().materializeTemplate('tpl-1', ['test-vrt']);

    useStore.getState().deleteGoalTemplate('tpl-1', true);
    expect(useStore.getState().goalTemplates).toHaveLength(0);
    expect(useStore.getState().goals.filter(g => g.templateId === 'tpl-1')).toHaveLength(0);
  });
});

describe('materializeTemplate', () => {
  it('creates one goal per client with correct liveConfig', () => {
    useStore.getState().addClient(testClient);
    useStore.getState().addGoalTemplate(testTemplate);
    useStore.getState().materializeTemplate('tpl-1', ['test-vrt']);

    const goals = useStore.getState().goals.filter(g => g.templateId === 'tpl-1');
    expect(goals).toHaveLength(1);
    expect(goals[0].clientId).toBe('test-vrt');
    expect(goals[0].keyResults).toHaveLength(2);
    expect(goals[0].keyResults[0].liveConfig?.connectionId).toBe('conn-1');
    expect(goals[0].keyResults[0].liveConfig?.sql).toBe('SELECT COUNT(*) FROM psi.rights');
    expect(goals[0].keyResults[0].krTemplateId).toBe('kr-tpl-1');
  });

  it('skips already-materialized client+template pairs', () => {
    useStore.getState().addClient(testClient);
    useStore.getState().addGoalTemplate(testTemplate);
    useStore.getState().materializeTemplate('tpl-1', ['test-vrt']);
    useStore.getState().materializeTemplate('tpl-1', ['test-vrt']);

    const goals = useStore.getState().goals.filter(g => g.templateId === 'tpl-1');
    expect(goals).toHaveLength(1);
  });

  it('uses client sqlOverrides when present', () => {
    const clientWithOverride: Client = {
      ...testClient,
      sqlOverrides: { 'tpl-1': { 'kr-tpl-1': 'SELECT COUNT(*) FROM vrt_custom.rights' } },
    };
    useStore.getState().addClient(clientWithOverride);
    useStore.getState().addGoalTemplate(testTemplate);
    useStore.getState().materializeTemplate('tpl-1', ['test-vrt']);

    const goal = useStore.getState().goals.find(g => g.clientId === 'test-vrt');
    expect(goal?.keyResults[0].liveConfig?.sql).toBe('SELECT COUNT(*) FROM vrt_custom.rights');
    expect(goal?.keyResults[1].liveConfig?.sql).toBe('SELECT COUNT(*) FROM psi.media');
  });
});

describe('syncTemplateToGoals', () => {
  it('updates SQL in materialized goals when template changes', () => {
    useStore.getState().addClient(testClient);
    useStore.getState().addGoalTemplate(testTemplate);
    useStore.getState().materializeTemplate('tpl-1', ['test-vrt']);

    useStore.getState().updateGoalTemplate('tpl-1', {
      krTemplates: [
        { ...testTemplate.krTemplates[0], sql: 'SELECT COUNT(*) FROM psi.rights_v2' },
        testTemplate.krTemplates[1],
      ],
    });
    useStore.getState().syncTemplateToGoals('tpl-1');

    const goal = useStore.getState().goals.find(g => g.clientId === 'test-vrt');
    expect(goal?.keyResults[0].liveConfig?.sql).toBe('SELECT COUNT(*) FROM psi.rights_v2');
  });

  it('skips SQL update for clients with overrides', () => {
    const clientWithOverride: Client = {
      ...testClient,
      sqlOverrides: { 'tpl-1': { 'kr-tpl-1': 'SELECT COUNT(*) FROM vrt_custom.rights' } },
    };
    useStore.getState().addClient(clientWithOverride);
    useStore.getState().addGoalTemplate(testTemplate);
    useStore.getState().materializeTemplate('tpl-1', ['test-vrt']);

    useStore.getState().updateGoalTemplate('tpl-1', {
      krTemplates: [
        { ...testTemplate.krTemplates[0], sql: 'SELECT COUNT(*) FROM psi.rights_v2' },
        testTemplate.krTemplates[1],
      ],
    });
    useStore.getState().syncTemplateToGoals('tpl-1');

    const goal = useStore.getState().goals.find(g => g.clientId === 'test-vrt');
    // Override should be preserved, not replaced with template SQL
    expect(goal?.keyResults[0].liveConfig?.sql).toBe('SELECT COUNT(*) FROM vrt_custom.rights');
  });

  it('removes KRs that are no longer in the template', () => {
    useStore.getState().addClient(testClient);
    useStore.getState().addGoalTemplate(testTemplate);
    useStore.getState().materializeTemplate('tpl-1', ['test-vrt']);

    // Remove second KR from template
    useStore.getState().updateGoalTemplate('tpl-1', {
      krTemplates: [testTemplate.krTemplates[0]],
    });
    useStore.getState().syncTemplateToGoals('tpl-1');

    const goal = useStore.getState().goals.find(g => g.clientId === 'test-vrt');
    expect(goal?.keyResults).toHaveLength(1);
    expect(goal?.keyResults[0].krTemplateId).toBe('kr-tpl-1');
  });

  it('appends new KRs from template', () => {
    useStore.getState().addClient(testClient);
    useStore.getState().addGoalTemplate(testTemplate);
    useStore.getState().materializeTemplate('tpl-1', ['test-vrt']);

    useStore.getState().updateGoalTemplate('tpl-1', {
      krTemplates: [
        ...testTemplate.krTemplates,
        { id: 'kr-tpl-3', title: 'New KR', sql: 'SELECT 1', unit: 'count', direction: 'hi' as const, start: 0, target: 50 },
      ],
    });
    useStore.getState().syncTemplateToGoals('tpl-1');

    const goal = useStore.getState().goals.find(g => g.clientId === 'test-vrt');
    expect(goal?.keyResults).toHaveLength(3);
    expect(goal?.keyResults[2].krTemplateId).toBe('kr-tpl-3');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/store/__tests__/clients.test.ts`
Expected: FAIL — store actions don't exist yet.

- [ ] **Step 3: Implement store slices in `src/store/store.ts`**

Add imports at top (line 2-3):

```ts
import type { Goal, Task, KPI, SyncStatus, Client, GoalTemplate } from '../types';
import { migrateKRIds } from './migration';
```

Add to `AppStore` interface (after line 40):

```ts
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
```

Add initial state and actions (after line 48, inside `persist` callback):

```ts
      clients: [],
      goalTemplates: [],
```

Add client actions (after `deleteGoal`):

```ts
      addClient: (client) => set((s) => ({ clients: [...s.clients, client] })),

      updateClient: (id, updates) =>
        set((s) => ({
          clients: s.clients.map((c) => (c.id === id ? { ...c, ...updates } : c)),
        })),

      deleteClient: (id, cascade) =>
        set((s) => ({
          clients: s.clients.filter((c) => c.id !== id),
          goals: cascade
            ? s.goals.filter((g) => g.clientId !== id)
            : s.goals.map((g) => g.clientId === id ? { ...g, clientId: undefined, templateId: undefined } : g),
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
            s.goals.filter((g) => g.templateId === templateId).map((g) => g.clientId),
          );
          const skipped: string[] = [];
          const newGoals: Goal[] = [];
          for (const clientId of clientIds) {
            if (existingPairs.has(clientId)) {
              skipped.push(clientId);
              continue;
            }
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
              clientId,
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
          // Return skipped count for toast notification at the call site
          // Call site should: if (skipped.length) toast(`${skipped.length} clients skipped — already materialized`)
          return { goals: [...newGoals, ...s.goals] };
        }),

      /** Sync template SQL changes to materialized goals.
       *  Returns { skippedOverrides: string[] } — client names with overrides that were not updated.
       *  Call site should show these in a toast for manual review. */
      syncTemplateToGoals: (templateId) =>
        set((s) => {
          const template = s.goalTemplates.find((t) => t.id === templateId);
          if (!template) return {};
          const goals = structuredClone(s.goals);
          const templateKRIds = new Set(template.krTemplates.map((krt) => krt.id));
          for (const goal of goals) {
            if (goal.templateId !== templateId) continue;
            const client = s.clients.find((c) => c.id === goal.clientId);
            const overrides = client?.sqlOverrides?.[templateId] || {};

            // Update existing and add new KRs
            for (const krt of template.krTemplates) {
              const existing = goal.keyResults.find((kr) => kr.krTemplateId === krt.id);
              if (existing) {
                // Skip clients with SQL overrides for this KR (flagged for manual review)
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

            // Remove KRs that are no longer in the template
            goal.keyResults = goal.keyResults.filter(
              (kr) => !kr.krTemplateId || templateKRIds.has(kr.krTemplateId),
            );
          }
          return { goals };
        }),
```

Add KR ID migration to the persist config (replace `{ name: 'broadcastokr-data' }` at line 189):

```ts
    {
      name: 'broadcastokr-data',
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.goals = migrateKRIds(state.goals);
        }
      },
    },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/store/__tests__/clients.test.ts`
Expected: PASS

- [ ] **Step 5: Run all existing tests to verify no regressions**

Run: `npx vitest run`
Expected: All pass (existing store tests still pass with new types)

- [ ] **Step 6: TypeScript check**

Run: `npx tsc --noEmit`
Expected: Clean (no errors)

- [ ] **Step 7: Commit**

```bash
git add src/store/store.ts src/store/__tests__/clients.test.ts
git commit -m "feat: add client and template store slices with materialization"
```

---

### Task 3: Parallelize bridge execute-batch

**Files:**
- Modify: `bridge/server.cjs:469-529`

- [ ] **Step 1: Replace sequential loop with concurrent execution**

In `bridge/server.cjs`, replace the `for (const q of queries)` loop in `/api/kpi/execute-batch` (lines 479-526) with:

```js
  const CONCURRENCY = 10;
  const results = [];

  // Process in batches of CONCURRENCY
  for (let i = 0; i < queries.length; i += CONCURRENCY) {
    const batch = queries.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.allSettled(
      batch.map(async (q) => {
        const { goalId, krIndex, connectionId, sql } = q;
        if (!connectionId || !sql) {
          return { goalId, krIndex, status: 'error', error: 'Missing connectionId or sql' };
        }

        const connConfig = config.connections.find(c => c.id === connectionId);
        if (!connConfig) {
          return { goalId, krIndex, status: 'error', error: 'Connection not found' };
        }

        try {
          const binds = {};
          if (q.timeframeDays) {
            const now = new Date();
            const start = new Date(now);
            start.setDate(start.getDate() - q.timeframeDays);
            binds.start_date = start;
            binds.end_date = now;
          }
          if (q.binds) Object.assign(binds, q.binds);

          const queryPromise = runQuery(connConfig, sql, binds);
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Query timed out')), TIMEOUT_MS)
          );

          const rows = await Promise.race([queryPromise, timeoutPromise]);
          if (!rows || rows.length === 0) {
            return { goalId, krIndex, status: 'no_data', error: 'Query returned no rows' };
          }

          const value = Number(Object.values(rows[0])[0]);
          if (isNaN(value)) {
            return { goalId, krIndex, status: 'error', error: 'Query did not return a numeric value' };
          }

          return { goalId, krIndex, status: 'ok', current: value };
        } catch (err) {
          console.error(`Batch query failed for goal ${goalId}, KR ${krIndex}:`, err);
          const status = err.message === 'Query timed out' ? 'timeout' : 'error';
          return { goalId, krIndex, status, error: status === 'timeout' ? 'Query timed out' : 'Query execution failed' };
        }
      })
    );

    batchResults.forEach((result, idx) => {
      results.push(result.status === 'fulfilled' ? result.value : {
        goalId: batch[idx]?.goalId,
        krIndex: batch[idx]?.krIndex,
        status: 'error',
        error: 'Unexpected execution error',
      });
    });
  }
```

- [ ] **Step 2: TypeScript check (bridge is .cjs, just verify no syntax errors)**

Run: `node -c bridge/server.cjs`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add bridge/server.cjs
git commit -m "perf: parallelize execute-batch with concurrency limiter (10)"
```

---

## Chunk 2: Sidebar, Routing, and Clients Page

### Task 4: Add sidebar navigation entries

**Files:**
- Modify: `src/components/layout/Sidebar.tsx:6-12`
- Modify: `src/App.tsx`

- [ ] **Step 1: Add nav entries to Sidebar**

In `src/components/layout/Sidebar.tsx`, update the `NAV` array (lines 6-12):

```ts
const NAV = [
  { path: '/dashboard', label: 'Dashboard', icon: '\u{1F4CA}' },
  { path: '/goals', label: 'Goals', icon: '\u{1F3AF}' },
  { path: '/compare', label: 'Compare', icon: '\u{1F50D}' },
  { path: '/tasks', label: 'Tasks', icon: '\u2705' },
  { path: '/team', label: 'Team', icon: '\u{1F465}' },
  { path: '/clients', label: 'Clients', icon: '\u{1F3E2}' },
  { path: '/reports', label: 'Reports', icon: '\u{1F4C8}' },
];
```

- [ ] **Step 2: Add routes to App.tsx**

Add imports:

```ts
import { ClientsPage } from './pages/ClientsPage';
import { ComparePage } from './pages/ComparePage';
```

Add routes after the `/goals` route (after line 59):

```tsx
<Route path="/clients" element={
  <ClientsPage bridgeConnected={bridge.connected} testConnection={bridge.testConnection} getConnections={bridge.getConnections} />
} />
<Route path="/compare" element={
  <ComparePage bridgeConnected={bridge.connected} executeBatch={bridge.executeBatch} />
} />
```

- [ ] **Step 3: Create stub pages for TypeScript to compile**

Create `src/pages/ClientsPage.tsx`:

```tsx
import { useTheme } from '../context/ThemeContext';
import { FONT_HEADING } from '../constants/config';

interface ClientsPageProps {
  bridgeConnected?: boolean;
  testConnection?: (conn: Omit<import('../hooks/useBridge').DBConnection, 'id'>) => Promise<{ ok: boolean; message: string }>;
  getConnections?: () => Promise<import('../hooks/useBridge').DBConnection[]>;
}

export function ClientsPage({ bridgeConnected = false }: ClientsPageProps) {
  const { theme } = useTheme();
  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontFamily: FONT_HEADING, color: theme.text, fontSize: 22, margin: 0 }}>Clients</h1>
      <p style={{ color: theme.textMuted, fontSize: 13, marginTop: 8 }}>Client management coming soon.</p>
    </div>
  );
}
```

Create `src/pages/ComparePage.tsx`:

```tsx
import { useTheme } from '../context/ThemeContext';
import { FONT_HEADING } from '../constants/config';

interface ComparePageProps {
  bridgeConnected?: boolean;
  executeBatch?: (queries: Array<{
    goalId: string; krIndex: number; connectionId: string; sql: string;
    binds?: Record<string, unknown>; timeframeDays?: number;
  }>) => Promise<{ results: Array<{ goalId: string; krIndex: number; status: 'ok' | 'error' | 'timeout' | 'no_data'; current?: number; error?: string }> }>;
}

export function ComparePage({ bridgeConnected = false }: ComparePageProps) {
  const { theme } = useTheme();
  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontFamily: FONT_HEADING, color: theme.text, fontSize: 22, margin: 0 }}>Compare</h1>
      <p style={{ color: theme.textMuted, fontSize: 13, marginTop: 8 }}>Comparison dashboard coming soon.</p>
    </div>
  );
}
```

- [ ] **Step 4: TypeScript check**

Run: `npx tsc --noEmit`
Expected: Clean

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/Sidebar.tsx src/App.tsx src/pages/ClientsPage.tsx src/pages/ComparePage.tsx
git commit -m "feat: add Clients and Compare routes with stub pages"
```

---

### Task 5: Build Clients page

**Files:**
- Modify: `src/pages/ClientsPage.tsx`
- Create: `src/components/clients/ClientModal.tsx`

- [ ] **Step 1: Implement ClientModal**

Create `src/components/clients/ClientModal.tsx` — a modal for adding/editing clients with fields for: name, color (palette picker), connection dropdown, tags input. Include the SQL Override section that shows active templates with "Override" toggles per KR.

The modal receives:
- `open: boolean`, `onClose: () => void`, `theme: Theme`
- `client?: Client` (edit mode if present)
- `connections: DBConnection[]` (for dropdown)
- `templates: GoalTemplate[]` (for SQL override section)
- `onSave: (client: Client) => void`

Use the existing `Modal` component from `src/components/ui/Modal.tsx` and `formStyles` from `src/styles/formStyles.ts`. Follow the `KPIConfigModal` pattern for layout.

- [ ] **Step 2: Implement full ClientsPage**

Update `src/pages/ClientsPage.tsx` with:
- Grid of client cards (name, color dot, connection name, tag pills, template count)
- Connection health indicator: on page mount, call `testConnection` for each client's connection. Show green/red/gray dot per card.
- Search bar + tag filter
- "Add Client" button opening `ClientModal`
- Click card → edit mode
- Delete button with cascade/unlink confirmation modal (two buttons: "Delete with goals" / "Keep goals as standalone")
- Toast notification for materialization skips (passed from MaterializeModal)

Uses `useStore` for `clients`, `goalTemplates`, `goals` (to count materialized goals per client).
Uses `testConnection` and `getConnections` props for health checks.

- [ ] **Step 3: TypeScript check**

Run: `npx tsc --noEmit`
Expected: Clean

- [ ] **Step 4: Manual test**

Navigate to `/clients`, verify: empty state shows correctly, add a client, edit it, delete it.

- [ ] **Step 5: Commit**

```bash
git add src/pages/ClientsPage.tsx src/components/clients/ClientModal.tsx
git commit -m "feat: implement Clients page with CRUD and SQL overrides"
```

---

## Chunk 3: Goal Templates and Materialization

### Task 6: Add Templates toggle to Goals page

**Files:**
- Modify: `src/pages/GoalsPage.tsx`
- Create: `src/components/templates/TemplateCard.tsx`
- Create: `src/components/templates/TemplateForm.tsx`
- Create: `src/components/templates/MaterializeModal.tsx`

- [ ] **Step 1: Create TemplateCard component**

`src/components/templates/TemplateCard.tsx` — displays a template's title, category, KR count, active client count, and action buttons (Edit, Materialize, Delete). Uses `PillBadge` for category. Inline styles following project conventions.

- [ ] **Step 2: Create TemplateForm component**

`src/components/templates/TemplateForm.tsx` — form inside a `Modal` for creating/editing templates. Fields: title, category (dropdown: Health Check, Operational, Custom), period, KR list (title, SQL editor, unit, direction, start, target, timeframeDays). Uses `formStyles` and `GoalFormFields` as reference for KR list pattern.

- [ ] **Step 3: Create MaterializeModal component**

`src/components/templates/MaterializeModal.tsx` — modal with searchable client checklist, tag filter, "Select All" / "Select by tag" buttons. Shows already-materialized clients as disabled. Preview column shows override indicator. Calls `store.materializeTemplate()` on confirm.

- [ ] **Step 4: Add Templates view to GoalsPage**

In `src/pages/GoalsPage.tsx`:
- Add a `Goals | Templates` toggle in the header (two styled buttons)
- Add `const [view, setView] = useState<'goals' | 'templates'>('goals')`
- When `view === 'templates'`, render `TemplateCard` list with Create/Materialize/Edit/Delete buttons
- Add "Client" filter dropdown to the goals view (searchable, using clients from store)
- Template-sourced goals show a small icon badge

- [ ] **Step 5: TypeScript check**

Run: `npx tsc --noEmit`
Expected: Clean

- [ ] **Step 6: Manual test**

- Create a template with 2 KRs
- Materialize for 2 clients
- Verify goals appear on Goals page with correct liveConfig
- Verify Client filter works
- Edit template SQL → verify sync prompt updates goals

- [ ] **Step 7: Commit**

```bash
git add src/pages/GoalsPage.tsx src/components/templates/
git commit -m "feat: add Goal Templates with materialization flow"
```

---

## Chunk 4: Comparison Dashboard

### Task 7: Build Compare page

**Files:**
- Modify: `src/pages/ComparePage.tsx`

- [ ] **Step 1: Implement comparison grid**

Replace the stub `ComparePage` with full implementation:
- Template selector dropdown at top (from `useStore.goalTemplates`)
- Client×KR matrix table:
  - Rows: clients (from goals matching selected template)
  - Columns: KRs from the template
  - Cells: current value, `PillBadge` status, `SparkLine` trend (from `kpi-history` if available)
- Summary row: fleet-wide averages per KR column
- Filter by client tag
- Sort by any column
- "Sync All" button calling `executeBatch` for all live KRs in the template's goals

UI states:
- No templates: empty state with CTA
- No selection: prompt to select
- No materialized goals: message with link to Goals → Templates
- Partial errors: red indicator + tooltip per cell
- Bridge offline: banner + stale indicators

- [ ] **Step 2: TypeScript check**

Run: `npx tsc --noEmit`
Expected: Clean

- [ ] **Step 3: Manual test**

- Select a template with materialized goals
- Verify grid renders with correct data
- Click cell → navigates to goal detail
- Sort by column
- Filter by tag
- Sync All triggers batch sync

- [ ] **Step 4: Commit**

```bash
git add src/pages/ComparePage.tsx
git commit -m "feat: implement comparison dashboard with client×KR grid"
```

---

## Chunk 5: Import/Export and Final Integration

### Task 8: Extend import/export for clients and templates

**Files:**
- Modify: `src/utils/importExport.ts`
- Modify: `src/components/data/ImportExportModal.tsx`

- [ ] **Step 1: Update `ParsedData` interface and export functions**

In `src/utils/importExport.ts`:
- Add `clients: Client[]` and `goalTemplates: GoalTemplate[]` to the `ParsedData` return interface
- Update `exportToJSON` / `exportToExcel` / `exportToCSV` function signatures to accept `clients` and `goalTemplates` arrays
- Include clients and templates in JSON export output

- [ ] **Step 2: Update import parsing**

In the JSON import parser:
- Detect `clients` and `goalTemplates` keys. If missing (pre-feature data), default to empty arrays
- Generate KR `id` fields on imported goals that lack them (reuse `migrateKRIds`)
- Validate `clientId`/`templateId` references: warn if a goal references a `clientId` not present in the imported `clients` array (add to `warnings` array)

- [ ] **Step 3: Update ImportExportModal**

In `src/components/data/ImportExportModal.tsx`:
- Pass `clients` and `goalTemplates` from store to export functions
- Handle new `clients`/`goalTemplates` fields from import results, calling `useStore.setState` to load them

- [ ] **Step 3: TypeScript check**

Run: `npx tsc --noEmit`
Expected: Clean

- [ ] **Step 4: Commit**

```bash
git add src/utils/importExport.ts
git commit -m "feat: extend import/export for clients and templates"
```

---

### Task 9: Final integration test

- [ ] **Step 1: Full TypeScript check**

Run: `npx tsc --noEmit`
Expected: Clean

- [ ] **Step 2: Run all tests**

Run: `npx vitest run`
Expected: All pass

- [ ] **Step 3: Manual end-to-end test**

1. Add 3 clients with different connections
2. Create a Health Check template with 3 KRs
3. Add a SQL override for one client on one KR
4. Materialize for all 3 clients
5. Verify Goals page shows 3 new goals with correct liveConfig
6. Navigate to Compare page → select template → verify 3×3 grid
7. Click Sync All → verify data updates
8. Delete one client (cascade) → verify goal removed
9. Delete template (unlink) → verify goals remain as standalone
10. Export → reimport → verify clients and templates preserved

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete multi-client health check feature"
```
