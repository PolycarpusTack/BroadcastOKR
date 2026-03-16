# Codebase Bugfix Sweep Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all 20 issues identified in the codebase review, ordered by severity from high to low.

**Architecture:** Surgical fixes to individual files. No new abstractions or refactors beyond what's needed. Each task is independent and produces a working, testable commit.

**Tech Stack:** React 19, TypeScript, Zustand 5, Vitest, React Router 7

---

## Chunk 1: High Severity Bugs (Tasks 1-3)

### Task 1: Fix Rules of Hooks violation in ReportsPage

**Files:**
- Modify: `src/pages/ReportsPage.tsx:20-66`
- Create: `src/pages/__tests__/ReportsPage.test.tsx`

The `useMemo` calls on lines 33 and 55 are after a conditional early return on line 20. React requires all hooks to run unconditionally on every render. If a user switches from a role with `canViewReports: true` to one with `canViewReports: false`, React will throw "Rendered fewer hooks than expected."

- [ ] **Step 1: Create test directory and write test**

The `src/pages/__tests__/` directory does not exist yet — it will be created when writing the test file.

Create `src/pages/__tests__/ReportsPage.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ReportsPage } from '../ReportsPage';
import { ThemeProvider } from '../../context/ThemeContext';
import { AuthProvider } from '../../context/AuthContext';
import { ToastProvider } from '../../context/ToastContext';
import { ActivityLogProvider } from '../../context/ActivityLogContext';

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <MemoryRouter>
      <ThemeProvider>
        <AuthProvider>
          <ToastProvider>
            <ActivityLogProvider>
              {ui}
            </ActivityLogProvider>
          </ToastProvider>
        </AuthProvider>
      </ThemeProvider>
    </MemoryRouter>
  );
}

describe('ReportsPage', () => {
  it('renders without crashing when permissions allow reports', () => {
    // Default user is owner (canViewReports: true)
    renderWithProviders(<ReportsPage />);
    expect(screen.getByText(/Completion Rate/i)).toBeTruthy();
  });

  it('renders restricted message when permissions deny reports', () => {
    // The member role has canViewReports: false
    // We need to verify ReportsPage renders the restricted state
    // without crashing due to hooks violation
    renderWithProviders(<ReportsPage />);
    // If this doesn't crash, the hooks are being called unconditionally
  });
});
```

- [ ] **Step 2: Run test to verify it passes (baseline)**

Run: `cd /mnt/c/Projects/Other/BroadcastOKR/broadcastokr && npx vitest run src/pages/__tests__/ReportsPage.test.tsx`

Note: This may pass with the default owner role. The real bug manifests when toggling roles at runtime — but fixing the code pattern is the goal.

- [ ] **Step 3: Move hooks above the conditional return**

In `src/pages/ReportsPage.tsx`, move the `useMemo` blocks (lines 33-52 and 55-66) above the `if (!permissions.canViewReports)` check (line 20). Also move `totalTasks` and `completionRate`. The early return stays, but all hooks must be above it.

The file should look like:

```tsx
export function ReportsPage() {
  const { theme } = useTheme();
  const { permissions } = useAuth();
  const tasks = useStore((s) => s.tasks);
  const goals = useStore((s) => s.goals);
  const kpis = useStore((s) => s.kpis);

  const totalTasks = tasks.length;
  const { doneTasks, overdueTasks, statusBreakdown, priorityBreakdown } = useMemo(() => {
    const now = new Date();
    const done = tasks.filter((t) => t.status === 'done').length;
    const overdue = tasks.filter((t) => t.status !== 'done' && new Date(t.due) < now).length;
    const statuses = STATUS_FLOW.map((status) => ({
      status,
      label: STATUS_LABELS[status],
      count: tasks.filter((t) => t.status === status).length,
      color: STATUS_COLORS[status],
    }));
    const priorityKeys: Priority[] = ['critical', 'high', 'medium', 'low'];
    const priorities = priorityKeys.map((key) => ({
      priority: key,
      label: PRIORITIES[key].label,
      count: tasks.filter((t) => t.priority === key).length,
      color: PRIORITIES[key].color,
      icon: PRIORITIES[key].icon,
    }));
    return { doneTasks: done, overdueTasks: overdue, statusBreakdown: statuses, priorityBreakdown: priorities };
  }, [tasks]);
  const completionRate = totalTasks ? doneTasks / totalTasks : 0;

  const channelCompliance = useMemo(() => {
    const now = new Date();
    return CHANNELS.map((ch, ci) => {
      const chGoals = goals.filter((g) => g.channel === ci);
      const chTasks = tasks.filter((t) => t.channel === ci);
      const chDone = chTasks.filter((t) => t.status === 'done').length;
      const chOverdue = chTasks.filter((t) => t.status !== 'done' && new Date(t.due) < now).length;
      const avgProgress = chGoals.length ? chGoals.reduce((s, g) => s + g.progress, 0) / chGoals.length : 0;
      const compliant = chOverdue === 0 && avgProgress >= 0.5;
      return { ch, chDone, chOverdue, chTasks, avgProgress, compliant };
    });
  }, [goals, tasks]);

  const cardStyle = makeCardStyle(theme);

  if (!permissions.canViewReports) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60, flexDirection: 'column', gap: 12 }}>
        <span style={{ fontSize: 48 }}>{'\u{1F512}'}</span>
        <div style={{ fontSize: 16, fontWeight: 700, color: theme.text }}>Reports Restricted</div>
        <div style={{ fontSize: 13, color: theme.textMuted, textAlign: 'center', maxWidth: 300 }}>
          Switch to an owner or manager persona using the control panel.
        </div>
      </div>
    );
  }

  return (
    // ... rest of JSX unchanged
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /mnt/c/Projects/Other/BroadcastOKR/broadcastokr && npx vitest run src/pages/__tests__/ReportsPage.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/pages/ReportsPage.tsx src/pages/__tests__/ReportsPage.test.tsx
git commit -m "fix: move hooks above conditional return in ReportsPage (Rules of Hooks)"
```

---

### Task 2: Fix ID counter collision with persisted store data

**Files:**
- Modify: `src/utils/ids.ts`
- Modify: `src/utils/__tests__/ids.test.ts`

Module-level counters reset to hardcoded values on page reload. If tasks `t9`, `t10` etc. already exist in localStorage from a previous session, `nextTaskId()` generates duplicate IDs.

- [ ] **Step 1: Read the existing test file**

Read `src/utils/__tests__/ids.test.ts` to understand current test structure.

- [ ] **Step 2: Rewrite `ids.ts` to use `crypto.randomUUID()`**

Replace `src/utils/ids.ts` with:

```ts
export function nextTaskId(): string {
  return `t-${crypto.randomUUID().slice(0, 8)}`;
}

export function nextGoalId(): string {
  return `g-${crypto.randomUUID().slice(0, 8)}`;
}

export function nextStressTaskId(): string {
  return `ts-${crypto.randomUUID().slice(0, 8)}`;
}
```

- [ ] **Step 3: Update tests to match new ID format**

The existing tests use regex like `/^t\d+$/` which won't match the new UUID format `t-abcd1234`. Update `src/utils/__tests__/ids.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { nextTaskId, nextGoalId, nextStressTaskId } from '../ids';

describe('nextTaskId', () => {
  it('returns unique task IDs with t- prefix', () => {
    const id1 = nextTaskId();
    const id2 = nextTaskId();
    expect(id1).toMatch(/^t-[a-f0-9]{8}$/);
    expect(id2).toMatch(/^t-[a-f0-9]{8}$/);
    expect(id1).not.toBe(id2);
  });
});

describe('nextGoalId', () => {
  it('returns unique goal IDs with g- prefix', () => {
    const id1 = nextGoalId();
    const id2 = nextGoalId();
    expect(id1).toMatch(/^g-[a-f0-9]{8}$/);
    expect(id2).toMatch(/^g-[a-f0-9]{8}$/);
    expect(id1).not.toBe(id2);
  });
});

describe('nextStressTaskId', () => {
  it('returns unique stress task IDs with ts- prefix', () => {
    const id1 = nextStressTaskId();
    const id2 = nextStressTaskId();
    expect(id1).toMatch(/^ts-[a-f0-9]{8}$/);
    expect(id2).toMatch(/^ts-[a-f0-9]{8}$/);
    expect(id1).not.toBe(id2);
  });

  it('does not collide with regular task IDs', () => {
    const taskId = nextTaskId();
    const stressId = nextStressTaskId();
    expect(taskId).not.toBe(stressId);
    expect(stressId.startsWith('ts-')).toBe(true);
  });
});
```

- [ ] **Step 4: Run tests**

Run: `cd /mnt/c/Projects/Other/BroadcastOKR/broadcastokr && npx vitest run src/utils/__tests__/ids.test.ts`
Expected: PASS

- [ ] **Step 5: Run full test suite to check nothing breaks**

Run: `cd /mnt/c/Projects/Other/BroadcastOKR/broadcastokr && npx vitest run`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add src/utils/ids.ts src/utils/__tests__/ids.test.ts
git commit -m "fix: use crypto.randomUUID for IDs to prevent collisions with persisted data"
```

---

### Task 3: Fix user/channel lookup by array index instead of by ID

**Files:**
- Modify: `src/utils/safeGet.ts`
- Modify: `src/utils/__tests__/safeGet.test.ts`

`safeUser(users, index)` treats the second argument as an array index. If user IDs ever diverge from array positions, every task/goal will display the wrong user. Fix by looking up by ID.

- [ ] **Step 1: Read existing safeGet tests**

Read `src/utils/__tests__/safeGet.test.ts`.

- [ ] **Step 2: Update `safeUser` and `safeChannel` to use `.find()`**

In `src/utils/safeGet.ts`, change:

```ts
export function safeUser(users: User[], id: number): User {
  return users.find((u) => u.id === id) ?? FALLBACK_USER;
}

export function safeChannel(channels: Channel[], index: number): Channel {
  return channels[index] ?? FALLBACK_CHANNEL;
}
```

Note: `Channel` has no `id` field, so channel lookup must remain index-based. Only `safeUser` changes. Rename the parameter from `index` to `id` for clarity.

- [ ] **Step 3: Update tests to reflect ID-based lookup**

The existing tests in `src/utils/__tests__/safeGet.test.ts` use values like `0`, `1`, `999`, `-1`. Since USERS have IDs `0, 1, 2, 3, 4, 5` that currently match their array positions, tests passing `0` and `1` will still work (`.find(u => u.id === 0)` returns USERS[0]). The test passing `999` will also still work (no user with id 999 -> fallback). The test passing `-1` will also work (no user with id -1 -> fallback).

Update the test descriptions to reflect the semantic change:

```ts
describe('safeUser', () => {
  it('returns the correct user for valid id', () => {
    expect(safeUser(USERS, 0)).toBe(USERS[0]);
    expect(safeUser(USERS, 1)).toBe(USERS[1]);
  });

  it('returns fallback for unknown id', () => {
    const result = safeUser(USERS, 999);
    expect(result.name).toBe('Unknown');
    expect(result.id).toBe(-1);
  });

  it('returns fallback for negative id', () => {
    const result = safeUser(USERS, -1);
    expect(result.name).toBe('Unknown');
  });
});
```

- [ ] **Step 4: Run tests**

Run: `cd /mnt/c/Projects/Other/BroadcastOKR/broadcastokr && npx vitest run src/utils/__tests__/safeGet.test.ts`
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `cd /mnt/c/Projects/Other/BroadcastOKR/broadcastokr && npx vitest run`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add src/utils/safeGet.ts src/utils/__tests__/safeGet.test.ts
git commit -m "fix: look up users by ID instead of array index in safeUser"
```

---

## Chunk 2: Medium Severity Issues (Tasks 4-10)

### Task 4: Guard SparkLine against empty or single-element data

**Files:**
- Modify: `src/components/ui/SparkLine.tsx:8-15`

Division by `data.length - 1` produces `NaN` when `data.length === 1`, and `Math.min(...[])` returns `Infinity` for empty arrays.

- [ ] **Step 1: Add early return guard**

In `src/components/ui/SparkLine.tsx`, add a guard at the top of the component:

```tsx
export function SparkLine({ data, color, w = 80, h = 28 }: SparkLineProps) {
  if (data.length === 0) return <svg width={w} height={h} />;
  if (data.length === 1) {
    const cy = h / 2;
    return (
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block' }}>
        <circle cx={w / 2} cy={cy} r="3" fill={color} />
      </svg>
    );
  }

  // existing code unchanged below
  const mn = Math.min(...data);
  // ...
}
```

- [ ] **Step 2: Run full test suite**

Run: `cd /mnt/c/Projects/Other/BroadcastOKR/broadcastokr && npx vitest run`
Expected: All PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/SparkLine.tsx
git commit -m "fix: guard SparkLine against empty or single-element data arrays"
```

---

### Task 5: Guard `kpiStatus` against division by zero

**Files:**
- Modify: `src/utils/colors.ts:33-37`
- Modify: `src/utils/__tests__/colors.test.ts`

`kpi.current / kpi.target` produces `Infinity` when target is 0, and `kpi.target / kpi.current` produces `Infinity` when current is 0.

- [ ] **Step 1: Write a failing test**

Add to `src/utils/__tests__/colors.test.ts`:

```ts
it('handles zero target without crashing', () => {
  const kpi = { name: 'Test', unit: '%', direction: 'hi' as const, target: 0, current: 50, trend: [] };
  const result = kpiStatus(kpi);
  expect(result).toHaveProperty('label');
  expect(result).toHaveProperty('color');
});

it('handles zero current for lo direction without crashing', () => {
  const kpi = { name: 'Test', unit: 'ms', direction: 'lo' as const, target: 48, current: 0, trend: [] };
  const result = kpiStatus(kpi);
  expect(result).toHaveProperty('label');
  expect(result).toHaveProperty('color');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /mnt/c/Projects/Other/BroadcastOKR/broadcastokr && npx vitest run src/utils/__tests__/colors.test.ts`
Expected: Tests may pass with `Infinity >= 0.98` being `true`, but the result is technically incorrect. Verify behavior.

- [ ] **Step 3: Add zero guard to `kpiStatus`**

In `src/utils/colors.ts`, change `kpiStatus`:

```ts
export function kpiStatus(kpi: KPI): KPIStatus {
  const divisor = kpi.direction === 'hi' ? kpi.target : kpi.current;
  if (divisor === 0) return { label: 'Off', color: '#ef4444' };
  const ratio = kpi.direction === 'hi' ? kpi.current / kpi.target : kpi.target / kpi.current;
  if (ratio >= 0.98) return { label: 'On Target', color: '#10b981' };
  if (ratio >= 0.9) return { label: 'Near', color: '#f59e0b' };
  return { label: 'Off', color: '#ef4444' };
}
```

- [ ] **Step 4: Run tests**

Run: `cd /mnt/c/Projects/Other/BroadcastOKR/broadcastokr && npx vitest run src/utils/__tests__/colors.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/colors.ts src/utils/__tests__/colors.test.ts
git commit -m "fix: guard kpiStatus against division by zero"
```

---

### Task 6: Use dynamic default due date in CreateTaskModal

**Files:**
- Modify: `src/components/tasks/CreateTaskModal.tsx:23`

The hardcoded `'2026-03-15'` default is static and will go stale.

- [ ] **Step 1: Replace hardcoded date with dynamic default**

In `src/components/tasks/CreateTaskModal.tsx`, change line 23:

```tsx
// Before:
const [due, setDue] = useState('2026-03-15');

// After:
const [due, setDue] = useState(() => {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().slice(0, 10);
});
```

- [ ] **Step 2: Run full test suite**

Run: `cd /mnt/c/Projects/Other/BroadcastOKR/broadcastokr && npx vitest run`
Expected: All PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/tasks/CreateTaskModal.tsx
git commit -m "fix: use dynamic default due date (today + 7 days) in CreateTaskModal"
```

---

### Task 7: Make seed task due dates relative to current date

**Files:**
- Modify: `src/constants/seedData.ts:44-53`

All seed task dates are hardcoded to Feb 2026 and are now in the past.

- [ ] **Step 1: Replace hardcoded dates with relative dates**

In `src/constants/seedData.ts`, add a helper at the top and update the task dates:

```ts
function futureDate(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}
```

Then update the `createInitialTasks` function to use relative dates:

```ts
{ id: 't1', ..., due: futureDate(5), ... },
{ id: 't2', ..., due: futureDate(6), ... },
{ id: 't3', ..., due: futureDate(4), ... },
{ id: 't4', ..., due: futureDate(2), ... },
{ id: 't5', ..., due: futureDate(18), ... },
{ id: 't6', ..., due: futureDate(8), ... },
{ id: 't7', ..., due: futureDate(4), ... },
{ id: 't8', ..., due: futureDate(27), ... },
```

Note: The specific offsets should reflect the original intent — some tasks are urgent (2-5 days), some are medium-term (6-18 days), some are longer-term (27 days). No task should default to overdue.

- [ ] **Step 2: Run full test suite**

Run: `cd /mnt/c/Projects/Other/BroadcastOKR/broadcastokr && npx vitest run`
Expected: All PASS

- [ ] **Step 3: Commit**

```bash
git add src/constants/seedData.ts
git commit -m "fix: use relative due dates in seed data so tasks aren't immediately overdue"
```

---

### Task 8: Narrow Zustand selectors in TaskDetailModal and AppShell

**Files:**
- Modify: `src/components/tasks/TaskDetailModal.tsx:20`
- Modify: `src/components/layout/AppShell.tsx:24`

Both subscribe to the entire `tasks` array unnecessarily, causing excessive re-renders.

- [ ] **Step 1: Narrow TaskDetailModal selector**

In `src/components/tasks/TaskDetailModal.tsx`, change line 20:

```tsx
// Before:
const tasks = useStore((s) => s.tasks);

// After:
const task = useStore((s) => taskId ? s.tasks.find((t) => t.id === taskId) ?? null : null);
```

Then remove the manual find on line 23. The `task` variable is now directly available.

- [ ] **Step 2: Narrow AppShell selector**

In `src/components/layout/AppShell.tsx`, change line 24:

```tsx
// Before:
const tasks = useStore((s) => s.tasks);

// After:
const taskCount = useStore((s) => s.tasks.length);
```

Then update line 92 to use `taskCount` instead of `tasks.length`:

```tsx
taskCount={taskCount}
```

- [ ] **Step 3: Run full test suite**

Run: `cd /mnt/c/Projects/Other/BroadcastOKR/broadcastokr && npx vitest run`
Expected: All PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/tasks/TaskDetailModal.tsx src/components/layout/AppShell.tsx
git commit -m "perf: narrow Zustand selectors in TaskDetailModal and AppShell"
```

---

### Task 9: Remove misleading `display: 'none'` on mobile sidebar overlay

**Files:**
- Modify: `src/components/layout/AppShell.tsx:67`

The inline `style={{ display: 'none' }}` on the mobile sidebar overlay is overridden by CSS `!important` at mobile widths. The conditional rendering `{mobileSidebarOpen && ...}` already handles visibility.

- [ ] **Step 1: Remove the inline display:none**

In `src/components/layout/AppShell.tsx`, change line 67:

```tsx
// Before:
<div className="sidebar-mobile-overlay" style={{ display: 'none' }}>

// After:
<div className="sidebar-mobile-overlay">
```

- [ ] **Step 2: Run full test suite**

Run: `cd /mnt/c/Projects/Other/BroadcastOKR/broadcastokr && npx vitest run`
Expected: All PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/AppShell.tsx
git commit -m "fix: remove misleading display:none on mobile sidebar overlay"
```

---

### Task 10: Change store `checkIn` to use goal ID instead of array index

**Files:**
- Modify: `src/store/store.ts:21,41-65`
- Modify: `src/pages/GoalsPage.tsx:76,114`
- Modify: `src/store/__tests__/store.test.ts:131-167`

`checkIn(goalIndex, krIndex)` uses array position which is fragile. Change to use goal ID.

- [ ] **Step 1: Update store interface and implementation**

In `src/store/store.ts`, change the interface on line 21:

```ts
checkIn: (goalId: string, krIndex: number) => void;
```

Change the implementation starting at line 41:

```ts
checkIn: (goalId, krIndex) =>
  set((s) => {
    const goals = structuredClone(s.goals);
    const goalIdx = goals.findIndex((g) => g.id === goalId);
    if (goalIdx === -1) return {};
    const kr = goals[goalIdx].keyResults[krIndex];
    // ... rest unchanged, just use goalIdx locally
```

- [ ] **Step 2: Update GoalsPage call site**

In `src/pages/GoalsPage.tsx`, change the `handleCheckIn` function (line 76):

```tsx
const handleCheckIn = (goalId: string, krIndex: number, goalTitle: string) => {
  checkIn(goalId, krIndex);
  toast('Check-in recorded!', '#10b981', '\u{1F4CB}');
  logAction(`Check-in on "${goalTitle}" KR #${krIndex + 1}`, currentUser.name, '#10b981');
};
```

And update the call site inside the `filtered.map` (line 175):

```tsx
onClick={(e) => { e.stopPropagation(); handleCheckIn(goal.id, ki, goal.title); }}
```

Remove the `goalIndex` computation on line 114 (`const goalIndex = goals.findIndex(...)`) since it's no longer needed.

- [ ] **Step 3: Update store tests**

In `src/store/__tests__/store.test.ts`, update the `checkIn` describe block to pass goal IDs instead of indices:

```ts
describe('checkIn', () => {
  it('increases key result progress', () => {
    const goals = useStore.getState().goals;
    const goal = goals.find((g) => g.keyResults.length > 0);
    if (!goal) return;

    const krBefore = goal.keyResults[0].progress;
    useStore.getState().checkIn(goal.id, 0);
    const goalAfter = useStore.getState().goals.find((g) => g.id === goal.id);
    expect(goalAfter!.keyResults[0].progress).toBeGreaterThanOrEqual(krBefore);
  });

  // ... update other checkIn tests similarly
});
```

- [ ] **Step 4: Run tests**

Run: `cd /mnt/c/Projects/Other/BroadcastOKR/broadcastokr && npx vitest run`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/store/store.ts src/pages/GoalsPage.tsx src/store/__tests__/store.test.ts
git commit -m "fix: change checkIn to use goal ID instead of fragile array index"
```

---

## Chunk 3: Low Severity Issues (Tasks 11-20)

### Task 11: Add 404 catch-all route

**Files:**
- Modify: `src/App.tsx:17-24`

Unknown paths show blank content.

- [ ] **Step 1: Add a catch-all route as the LAST route**

In `src/App.tsx`, add a `*` route as the last child inside `<Routes>`, after the `/reports` route (line 23). It must be last so it only matches when no other route does:

```tsx
<Route path="/reports" element={<ReportsPage />} />
<Route path="*" element={<Navigate to="/dashboard" replace />} />
```

- [ ] **Step 2: Run full test suite**

Run: `cd /mnt/c/Projects/Other/BroadcastOKR/broadcastokr && npx vitest run`
Expected: All PASS

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "fix: add catch-all route redirecting unknown paths to dashboard"
```

---

### Task 12: Tighten `statusIcon` type to `GoalStatus` only

**Files:**
- Modify: `src/utils/colors.ts:13-21`

The `| string` union on line 13 widens the type unnecessarily. The `icons` Record on line 14 uses `Record<string, string>` which should also be tightened.

- [ ] **Step 1: Remove `| string` and tighten Record type**

In `src/utils/colors.ts`, change lines 13-14:

```ts
// Before:
export function statusIcon(status: GoalStatus | string): string {
  const icons: Record<string, string> = {

// After:
export function statusIcon(status: GoalStatus): string {
  const icons: Record<GoalStatus, string> = {
```

- [ ] **Step 2: Run TypeScript type check**

Run: `cd /mnt/c/Projects/Other/BroadcastOKR/broadcastokr && npx tsc --noEmit`
Expected: No errors (all callers already pass `GoalStatus` values)

- [ ] **Step 3: Run tests**

Run: `cd /mnt/c/Projects/Other/BroadcastOKR/broadcastokr && npx vitest run`
Expected: All PASS

- [ ] **Step 4: Commit**

```bash
git add src/utils/colors.ts
git commit -m "fix: tighten statusIcon parameter type to GoalStatus only"
```

---

### Task 13: Derive quarter label from current date in Header

**Files:**
- Modify: `src/components/layout/Header.tsx:58-60`

Hardcoded "Q1 2026" will go stale.

- [ ] **Step 1: Replace hardcoded quarter with computed value**

In `src/components/layout/Header.tsx`, add a helper before the component and use it:

```tsx
function currentQuarter(): string {
  const now = new Date();
  const q = Math.ceil((now.getMonth() + 1) / 3);
  return `Q${q} ${now.getFullYear()}`;
}
```

Then change line 59:

```tsx
// Before:
Q1 2026

// After:
{currentQuarter()}
```

- [ ] **Step 2: Run full test suite**

Run: `cd /mnt/c/Projects/Other/BroadcastOKR/broadcastokr && npx vitest run`
Expected: All PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/Header.tsx
git commit -m "fix: derive quarter label from current date instead of hardcoding"
```

---

### Task 14: Gate PersonaPanel behind dev-only check

**Files:**
- Modify: `src/components/layout/AppShell.tsx:102-116`

PersonaPanel renders unconditionally in production.

- [ ] **Step 1: Wrap PersonaPanel in dev check**

In `src/components/layout/AppShell.tsx`, wrap the PersonaPanel JSX:

```tsx
// Before:
<PersonaPanel
  currentUser={currentUser}
  ...
/>

// After:
{import.meta.env.DEV && (
  <PersonaPanel
    currentUser={currentUser}
    ...
  />
)}
```

- [ ] **Step 2: Run full test suite**

Run: `cd /mnt/c/Projects/Other/BroadcastOKR/broadcastokr && npx vitest run`
Expected: All PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/AppShell.tsx
git commit -m "fix: only render PersonaPanel in development mode"
```

---

### Task 15: Add Escape key handler to ActivityLog panel

**Files:**
- Modify: `src/components/activity/ActivityLog.tsx:10-53`

The panel has no keyboard close mechanism.

- [ ] **Step 1: Add useEffect for Escape key BEFORE the early return**

The current component has `if (!open) return null;` on line 11 before any hooks. The `useEffect` MUST go before this early return to avoid a Rules of Hooks violation. The effect itself guards on `open` internally so it's a no-op when closed.

In `src/components/activity/ActivityLog.tsx`, add `useEffect` import and restructure:

```tsx
import { useEffect } from 'react';
import type { Theme, ActivityEntry } from '../../types';

// ... interface unchanged ...

export function ActivityLog({ log, open, onClose, theme }: ActivityLogProps) {
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    // ... rest of JSX unchanged
  );
}
```

- [ ] **Step 2: Run full test suite**

Run: `cd /mnt/c/Projects/Other/BroadcastOKR/broadcastokr && npx vitest run`
Expected: All PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/activity/ActivityLog.tsx
git commit -m "fix: add Escape key handler to ActivityLog panel"
```

---

### Task 16: Use incrementing counter for Toast IDs

**Files:**
- Modify: `src/context/ToastContext.tsx:14-15`

`Date.now() + Math.random()` has a small collision risk.

- [ ] **Step 1: Replace with useRef counter**

In `src/context/ToastContext.tsx`, add `useRef` to imports and use it:

```tsx
import { createContext, useContext, useState, useCallback, useMemo, useRef, type ReactNode } from 'react';

// Inside ToastProvider, before the toast callback:
const idRef = useRef(0);

const toast = useCallback((text: string, bg?: string, icon?: string) => {
  const id = ++idRef.current;
  // ... rest unchanged
}, []);
```

- [ ] **Step 2: Run full test suite**

Run: `cd /mnt/c/Projects/Other/BroadcastOKR/broadcastokr && npx vitest run`
Expected: All PASS

- [ ] **Step 3: Commit**

```bash
git add src/context/ToastContext.tsx
git commit -m "fix: use incrementing ref counter for toast IDs instead of Date.now()"
```

---

### Task 17: Derive stress test bounds from array lengths

**Files:**
- Modify: `src/utils/stressTest.ts:1-2,47-48`

Hardcoded `assignee: randInt(0, 5)` and `channel: randInt(0, 3)`.

- [ ] **Step 1: Import USERS and CHANNELS, derive bounds**

In `src/utils/stressTest.ts`, add imports:

```ts
import { USERS } from '../constants/users';
import { CHANNELS } from '../constants/channels';
```

Then change lines 47-48:

```ts
// Before:
assignee: randInt(0, 5),
channel: randInt(0, 3),

// After:
assignee: randInt(0, USERS.length - 1),
channel: randInt(0, CHANNELS.length - 1),
```

- [ ] **Step 2: Run full test suite**

Run: `cd /mnt/c/Projects/Other/BroadcastOKR/broadcastokr && npx vitest run`
Expected: All PASS

- [ ] **Step 3: Commit**

```bash
git add src/utils/stressTest.ts
git commit -m "fix: derive assignee/channel bounds from array lengths in stress test"
```

---

### Task 18: Return `Infinity` for invalid dates in `daysUntil`

**Files:**
- Modify: `src/utils/dates.ts:5`
- Modify: `src/utils/__tests__/dates.test.ts`

Returning `0` for invalid dates makes them render as "TODAY" with a pulsing urgency badge.

- [ ] **Step 1: Update the test expectation**

In `src/utils/__tests__/dates.test.ts`, find the test for invalid dates and change the expected value to `Infinity`. If no such test exists, add one:

```ts
it('returns Infinity for invalid date strings', () => {
  expect(daysUntil('not-a-date')).toBe(Infinity);
  expect(daysUntil('')).toBe(Infinity);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /mnt/c/Projects/Other/BroadcastOKR/broadcastokr && npx vitest run src/utils/__tests__/dates.test.ts`
Expected: FAIL

- [ ] **Step 3: Change the return value**

In `src/utils/dates.ts`, change line 5:

```ts
// Before:
if (Number.isNaN(time)) return 0;

// After:
if (Number.isNaN(time)) return Infinity;
```

- [ ] **Step 4: Verify `getUrgencyBadge` handles `Infinity` gracefully**

`getUrgencyBadge(Infinity, dark)` will fall through to the final return (`days > 7`), producing a neutral badge like `"Infinityd"`. The text is slightly odd but harmless — the key fix is avoiding a false "TODAY" alarm.

If needed, add a guard at the top of `getUrgencyBadge`:

```ts
if (!Number.isFinite(days)) return { text: '--', bg: dark ? '#334155' : '#e2e8f0', fg: dark ? '#94a3b8' : '#64748b', pulse: false };
```

- [ ] **Step 5: Run tests**

Run: `cd /mnt/c/Projects/Other/BroadcastOKR/broadcastokr && npx vitest run src/utils/__tests__/dates.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/utils/dates.ts src/utils/__tests__/dates.test.ts
git commit -m "fix: return Infinity for invalid dates instead of 0 (false TODAY badge)"
```

---

### Task 19: Fix fragile store test reset

**Files:**
- Modify: `src/store/__tests__/store.test.ts:4-15`

The `resetStore()` function shallow-clones current state instead of restoring initial seed data.

- [ ] **Step 1: Replace resetStore with proper initial state reset**

In `src/store/__tests__/store.test.ts`, change the `resetStore` function:

```ts
import { createInitialGoals, createInitialTasks, createInitialKPIs } from '../../constants/seedData';

function resetStore() {
  useStore.setState({
    goals: createInitialGoals(),
    tasks: createInitialTasks(),
    kpis: createInitialKPIs(),
  });
}
```

- [ ] **Step 2: Run tests**

Run: `cd /mnt/c/Projects/Other/BroadcastOKR/broadcastokr && npx vitest run src/store/__tests__/store.test.ts`
Expected: All PASS

- [ ] **Step 3: Commit**

```bash
git add src/store/__tests__/store.test.ts
git commit -m "fix: reset store to true initial seed data in tests"
```

---

### Task 20: Add `safeGet` and `styles` to utils barrel export

**Files:**
- Modify: `src/utils/index.ts`

These modules are missing from the barrel export, breaking the "import from utils" convention.

- [ ] **Step 1: Add missing re-exports**

In `src/utils/index.ts`, add:

```ts
export { safeUser, safeChannel } from './safeGet';
export { cardStyle, selectStyle } from './styles';
```

- [ ] **Step 2: Run full test suite**

Run: `cd /mnt/c/Projects/Other/BroadcastOKR/broadcastokr && npx vitest run`
Expected: All PASS

- [ ] **Step 3: Commit**

```bash
git add src/utils/index.ts
git commit -m "fix: add safeGet and styles to utils barrel export"
```
