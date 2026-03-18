# KR History, Enhanced Check-ins & Reporting — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add historical KR tracking with enhanced check-ins (confidence + notes), monitoring mode for intensive sync recording, and three-view reporting (by client, by goal, by KR template).

**Architecture:** All history stored client-side in Zustand (localStorage). Each KeyResult gets an optional `history` array of timestamped entries capped at 100. Monitoring mode (per-goal or per-client with expiry) causes sync actions to also write history. Three report views consume history via shared sub-components (sparkline, trend, confidence badge, detail panel).

**Tech Stack:** React 19, TypeScript, Zustand 5, SVG charts (no new deps)

**Spec:** `docs/superpowers/specs/2026-03-18-kr-history-reporting-design.md`

---

## Task 1: Types & pruneHistory helper

**Files:**
- Modify: `src/types/index.ts`
- Create: `src/utils/history.ts`
- Create: `src/utils/__tests__/history.test.ts`

- [ ] **Step 1: Add KRHistoryEntry type and extend KeyResult, Goal, Client**

In `src/types/index.ts`, add before the `KeyResult` interface:

```ts
export type Confidence = 'on_track' | 'at_risk' | 'blocked';

export interface KRHistoryEntry {
  timestamp: string;
  value: number;
  confidence?: Confidence;
  note?: string;
  actor: string;
  source: 'check-in' | 'sync';
}
```

Add to `KeyResult`:
```ts
history?: KRHistoryEntry[];
```

Add to `Goal`:
```ts
monitorUntil?: string;
```

Add to `Client`:
```ts
monitorUntil?: string;
```

- [ ] **Step 2: Write failing test for pruneHistory**

Create `src/utils/__tests__/history.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { pruneHistory } from '../history';
import type { KRHistoryEntry } from '../../types';

function makeEntry(i: number): KRHistoryEntry {
  return { timestamp: `2026-03-${String(i).padStart(2, '0')}T00:00:00Z`, value: i, actor: 'test', source: 'check-in' };
}

describe('pruneHistory', () => {
  it('returns input unchanged when under cap', () => {
    const entries = Array.from({ length: 50 }, (_, i) => makeEntry(i));
    expect(pruneHistory(entries)).toHaveLength(50);
  });

  it('returns input unchanged at exactly 100', () => {
    const entries = Array.from({ length: 100 }, (_, i) => makeEntry(i));
    expect(pruneHistory(entries)).toHaveLength(100);
  });

  it('prunes to 75 when over 100', () => {
    const entries = Array.from({ length: 110 }, (_, i) => makeEntry(i));
    const result = pruneHistory(entries);
    expect(result).toHaveLength(75);
    expect(result[0].value).toBe(35); // keeps last 75
  });

  it('returns empty array for empty input', () => {
    expect(pruneHistory([])).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/utils/__tests__/history.test.ts`
Expected: FAIL — `pruneHistory` not found

- [ ] **Step 4: Implement pruneHistory**

Create `src/utils/history.ts`:

```ts
import type { KRHistoryEntry } from '../types';

const HISTORY_CAP = 100;
const HISTORY_PRUNE_TO = 75;

export function pruneHistory(history: KRHistoryEntry[]): KRHistoryEntry[] {
  if (history.length <= HISTORY_CAP) return history;
  return history.slice(-HISTORY_PRUNE_TO);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/utils/__tests__/history.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Run full type check**

Run: `npx tsc --noEmit`
Expected: Clean (no errors)

- [ ] **Step 7: Commit**

```bash
git add src/types/index.ts src/utils/history.ts src/utils/__tests__/history.test.ts
git commit -m "feat: add KRHistoryEntry type, monitorUntil fields, pruneHistory helper"
```

---

## Task 2: Store actions — checkInKR, setMonitor, remove checkIn

**Files:**
- Modify: `src/store/store.ts`
- Create: `src/store/__tests__/history.test.ts`
- Modify: `src/store/__tests__/clients.test.ts` (update old checkIn references)

- [ ] **Step 1: Write failing tests for checkInKR**

Create `src/store/__tests__/history.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../store';
import type { Goal } from '../../types';

const manualGoal: Goal = {
  id: 'g1', title: 'Test Goal', status: 'behind', progress: 0,
  owner: 0, channel: 0, period: 'Q1 2026',
  keyResults: [{
    id: 'kr1', title: 'Manual KR', start: 0, target: 100,
    current: 0, progress: 0, status: 'behind',
  }],
};

const liveGoal: Goal = {
  id: 'g2', title: 'Live Goal', status: 'behind', progress: 0,
  owner: 0, channel: 0, period: 'Q1 2026', clientIds: ['c1'],
  keyResults: [{
    id: 'kr2', title: 'Live KR', start: 0, target: 100,
    current: 50, progress: 0.5, status: 'at_risk',
    liveConfig: { connectionId: 'conn-1', sql: 'SELECT 1', unit: '%', direction: 'hi' },
    syncStatus: 'ok',
  }],
};

beforeEach(() => {
  useStore.setState({ goals: [], clients: [], goalTemplates: [] });
});

describe('checkInKR', () => {
  it('writes history entry with correct fields for manual KR', () => {
    useStore.setState({ goals: [structuredClone(manualGoal)] });
    useStore.getState().checkInKR('g1', 0, { value: 40, confidence: 'on_track', note: 'Good progress', actor: 'Alice' });
    const kr = useStore.getState().goals[0].keyResults[0];
    expect(kr.history).toHaveLength(1);
    expect(kr.history![0].value).toBe(40);
    expect(kr.history![0].confidence).toBe('on_track');
    expect(kr.history![0].note).toBe('Good progress');
    expect(kr.history![0].actor).toBe('Alice');
    expect(kr.history![0].source).toBe('check-in');
  });

  it('updates current and recalculates progress for manual KR', () => {
    useStore.setState({ goals: [structuredClone(manualGoal)] });
    useStore.getState().checkInKR('g1', 0, { value: 70, actor: 'Alice' });
    const kr = useStore.getState().goals[0].keyResults[0];
    expect(kr.current).toBe(70);
    expect(kr.progress).toBeCloseTo(0.7);
    expect(kr.status).toBe('on_track');
  });

  it('does NOT update current for live KR', () => {
    useStore.setState({ goals: [structuredClone(liveGoal)] });
    useStore.getState().checkInKR('g2', 0, { value: 50, confidence: 'at_risk', actor: 'Bob' });
    const kr = useStore.getState().goals[0].keyResults[0];
    expect(kr.current).toBe(50); // unchanged — was already 50
    expect(kr.history).toHaveLength(1);
    expect(kr.history![0].value).toBe(50);
  });

  it('prunes history at 100 entries', () => {
    const goal = structuredClone(manualGoal);
    goal.keyResults[0].history = Array.from({ length: 100 }, (_, i) => ({
      timestamp: new Date(2026, 0, i + 1).toISOString(), value: i, actor: 'x', source: 'check-in' as const,
    }));
    useStore.setState({ goals: [goal] });
    useStore.getState().checkInKR('g1', 0, { value: 999, actor: 'Alice' });
    expect(useStore.getState().goals[0].keyResults[0].history!.length).toBeLessThanOrEqual(100);
  });
});

describe('setMonitor', () => {
  it('sets monitorUntil on a goal', () => {
    useStore.setState({ goals: [structuredClone(manualGoal)] });
    useStore.getState().setMonitor('goal', 'g1', 7);
    const goal = useStore.getState().goals[0];
    expect(goal.monitorUntil).toBeDefined();
    const until = new Date(goal.monitorUntil!);
    const now = new Date();
    expect(until.getTime()).toBeGreaterThan(now.getTime());
    expect(until.getTime()).toBeLessThanOrEqual(now.getTime() + 7 * 86400000 + 1000);
  });

  it('clears monitorUntil with null', () => {
    const goal = structuredClone(manualGoal);
    goal.monitorUntil = '2026-12-31T00:00:00Z';
    useStore.setState({ goals: [goal] });
    useStore.getState().setMonitor('goal', 'g1', null);
    expect(useStore.getState().goals[0].monitorUntil).toBeUndefined();
  });

  it('sets monitorUntil on a client', () => {
    useStore.setState({ clients: [{ id: 'c1', name: 'VRT', connectionId: 'conn-1', color: '#000', channels: [] }] });
    useStore.getState().setMonitor('client', 'c1', 3);
    expect(useStore.getState().clients[0].monitorUntil).toBeDefined();
  });

  it('clears monitorUntil on a client with null', () => {
    useStore.setState({ clients: [{ id: 'c1', name: 'VRT', connectionId: 'conn-1', color: '#000', channels: [], monitorUntil: '2026-12-31T00:00:00Z' }] });
    useStore.getState().setMonitor('client', 'c1', null);
    expect(useStore.getState().clients[0].monitorUntil).toBeUndefined();
  });
});

describe('syncLiveKRBatch with monitoring', () => {
  it('writes history when goal has active monitor', () => {
    const goal = structuredClone(liveGoal);
    goal.monitorUntil = new Date(Date.now() + 86400000).toISOString();
    useStore.setState({ goals: [goal], clients: [] });
    useStore.getState().syncLiveKRBatch([{ goalId: 'g2', krIndex: 0, current: 60, status: 'ok' }]);
    const kr = useStore.getState().goals[0].keyResults[0];
    expect(kr.history).toHaveLength(1);
    expect(kr.history![0].source).toBe('sync');
    expect(kr.history![0].actor).toBe('system');
  });

  it('does NOT write history when goal monitor is expired', () => {
    const goal = structuredClone(liveGoal);
    goal.monitorUntil = new Date(Date.now() - 86400000).toISOString();
    useStore.setState({ goals: [goal], clients: [] });
    useStore.getState().syncLiveKRBatch([{ goalId: 'g2', krIndex: 0, current: 60, status: 'ok' }]);
    const kr = useStore.getState().goals[0].keyResults[0];
    expect(kr.history).toBeUndefined();
  });

  it('writes history when client has active monitor', () => {
    useStore.setState({
      goals: [structuredClone(liveGoal)],
      clients: [{ id: 'c1', name: 'VRT', connectionId: 'conn-1', color: '#000', channels: [], monitorUntil: new Date(Date.now() + 86400000).toISOString() }],
    });
    useStore.getState().syncLiveKRBatch([{ goalId: 'g2', krIndex: 0, current: 60, status: 'ok' }]);
    const kr = useStore.getState().goals[0].keyResults[0];
    expect(kr.history).toHaveLength(1);
    expect(kr.history![0].source).toBe('sync');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/store/__tests__/history.test.ts`
Expected: FAIL — `checkInKR`, `setMonitor` not found on store

- [ ] **Step 3: Implement checkInKR, setMonitor, modify syncLiveKRBatch/syncLiveKR, remove checkIn**

In `src/store/store.ts`:

1. Add import: `import { pruneHistory } from '../utils/history';`
2. Add to `AppStore` interface:
   - `checkInKR: (goalId: string, krIndex: number, entry: { value: number; confidence?: Confidence; note?: string; actor: string }) => void;`
   - `setMonitor: (type: 'goal' | 'client', id: string, days: number | null) => void;`
3. Remove `checkIn` action and its interface entry
4. Add helper at module level:
   ```ts
   function isMonitorActive(until?: string): boolean {
     return !!until && new Date(until) > new Date();
   }
   ```
5. Implement `checkInKR`: push history entry, update `kr.current` only if no `liveConfig`, recalculate progress, prune
6. Implement `setMonitor`: set/clear `monitorUntil` on goal or client
7. Modify `syncLiveKRBatch`: after updating KR values, check `goal.monitorUntil` and all clients in `goal.clientIds` for active monitors. If monitoring, push history entry with `source: 'sync'`, `actor: 'system'`, prune.
8. Modify `syncLiveKR`: same monitoring check

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/store/__tests__/history.test.ts`
Expected: PASS (all tests)

- [ ] **Step 5: Add syncLiveKR monitoring test**

Add to `history.test.ts`:

```ts
describe('syncLiveKR with monitoring', () => {
  it('writes history when goal has active monitor', () => {
    const goal = structuredClone(liveGoal);
    goal.monitorUntil = new Date(Date.now() + 86400000).toISOString();
    useStore.setState({ goals: [goal], clients: [] });
    useStore.getState().syncLiveKR('g2', 0, 60);
    const kr = useStore.getState().goals[0].keyResults[0];
    expect(kr.history).toHaveLength(1);
    expect(kr.history![0].source).toBe('sync');
  });

  it('does NOT write history without active monitor', () => {
    useStore.setState({ goals: [structuredClone(liveGoal)], clients: [] });
    useStore.getState().syncLiveKR('g2', 0, 60);
    const kr = useStore.getState().goals[0].keyResults[0];
    expect(kr.history).toBeUndefined();
  });
});
```

- [ ] **Step 6: Remove old checkIn tests in store.test.ts**

In `src/store/__tests__/store.test.ts`, the `describe('checkIn', ...)` block (lines 182-208) references the removed `checkIn` action. Remove this entire describe block. The replacement tests for `checkInKR` are in the new `history.test.ts`.

- [ ] **Step 7: Run full test suite and type check**

Run: `npx tsc --noEmit && npx vitest run`
Expected: Clean compile, all tests pass

- [ ] **Step 8: Commit**

```bash
git add src/store/store.ts src/store/__tests__/history.test.ts src/store/__tests__/store.test.ts
git commit -m "feat: add checkInKR, setMonitor store actions; monitoring-aware sync; remove old checkIn"
```

---

## Task 3: Quota-exceeded handler on persist

**Files:**
- Modify: `src/store/store.ts` (persist config)

- [ ] **Step 1: Write failing test for quota-exceeded handler**

Add to `src/store/__tests__/history.test.ts`:

```ts
describe('quota-exceeded handler', () => {
  it('does not throw when localStorage.setItem fails with QuotaExceededError', () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      const err = new DOMException('quota exceeded', 'QuotaExceededError');
      throw err;
    };
    // Should not throw — the handler catches it
    expect(() => {
      useStore.getState().checkInKR('g1', 0, { value: 1, actor: 'test' });
    }).not.toThrow();
    Storage.prototype.setItem = original;
  });
});
```

- [ ] **Step 2: Add quota-exceeded handler to persist config**

In the `persist` options, add a custom `storage` adapter that wraps `localStorage` with try/catch on `setItem`. On `QuotaExceededError`, emit a custom event that the app can listen for to show a toast:

```ts
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
```

In `App.tsx`, add a listener for the custom event that triggers a toast:
```ts
useEffect(() => {
  const handler = () => toast('Storage nearly full — consider exporting history', COLOR_DANGER, '⚠️');
  window.addEventListener('storage-quota-exceeded', handler);
  return () => window.removeEventListener('storage-quota-exceeded', handler);
}, [toast]);
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run src/store/__tests__/history.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/store/store.ts src/store/__tests__/history.test.ts src/App.tsx
git commit -m "feat: add quota-exceeded handler with user-visible toast notification"
```

---

## Task 4: GoalFormKR id carry-through & edit flow history preservation

**Files:**
- Modify: `src/components/goals/GoalFormFields.tsx`
- Modify: `src/pages/GoalsPage.tsx`

- [ ] **Step 1: Add `id` to GoalFormKR interface**

In `src/components/goals/GoalFormFields.tsx`, add to `GoalFormKR`:
```ts
id?: string; // carried from existing KR for id-based matching during edits
```

- [ ] **Step 2: Update openEditModal to carry KR ids**

In `src/pages/GoalsPage.tsx`, in `openEditModal`, add `id` to the mapped KRs:
```ts
setEditKRs(goal.keyResults.map((kr) => ({
  id: kr.id,  // carry for id-based matching
  title: kr.title,
  start: kr.start,
  target: kr.target,
  liveConfig: kr.liveConfig,
})));
```

- [ ] **Step 3: Switch handleEditSave to id-based matching**

In `handleEditSave`, replace index-based matching:
```ts
const existing = existingGoal.keyResults[i];
```
with id-based matching:
```ts
const existing = kr.id ? existingGoal.keyResults.find((e) => e.id === kr.id) : undefined;
```

- [ ] **Step 4: Add history to the "changed" KR object literal**

In the `return { ... }` block of the changed KR path (around line 262-274), add:
```ts
history: existing?.history,
```

- [ ] **Step 5: Also add history to the "unchanged" early return**

The early-return path (`return existing`) already returns the full KR including `history`. No change needed — verify.

- [ ] **Step 6: Write regression test for id-based matching**

Add to `src/store/__tests__/history.test.ts`:

```ts
describe('edit flow history preservation', () => {
  it('preserves history when KR is edited via id-based matching', () => {
    const goal = structuredClone(manualGoal);
    goal.keyResults[0].history = [
      { timestamp: '2026-03-01T00:00:00Z', value: 10, actor: 'Alice', source: 'check-in' },
    ];
    useStore.setState({ goals: [goal] });
    // Simulate what handleEditSave does: updateGoal with KRs that carry id
    useStore.getState().updateGoal('g1', {
      keyResults: [{
        ...goal.keyResults[0],
        target: 200, // changed target
        history: goal.keyResults[0].history, // preserved
      }],
    });
    const updated = useStore.getState().goals[0].keyResults[0];
    expect(updated.target).toBe(200);
    expect(updated.history).toHaveLength(1);
    expect(updated.history![0].value).toBe(10);
  });
});
```

- [ ] **Step 7: Run type check and tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: Clean

- [ ] **Step 8: Commit**

```bash
git add src/components/goals/GoalFormFields.tsx src/pages/GoalsPage.tsx src/store/__tests__/history.test.ts
git commit -m "feat: switch KR edit matching from index to kr.id, preserve history"
```

---

## Task 5: CheckInModal component

**Files:**
- Create: `src/components/goals/CheckInModal.tsx`
- Create: `src/components/__tests__/CheckInModal.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `src/components/__tests__/CheckInModal.test.tsx`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CheckInModal } from '../goals/CheckInModal';

const baseProps = {
  open: true,
  onClose: vi.fn(),
  onSubmit: vi.fn(),
  krTitle: 'Rights Coverage',
  currentValue: 42,
  krStatus: 'at_risk' as const,
  isLive: false,
  theme: {
    text: '#fff', textSecondary: '#aaa', textMuted: '#888', textFaint: '#666',
    bg: '#111', bgCard: '#222', bgMuted: '#333',
    border: '#444', borderLight: '#555',
  } as any,
};

describe('CheckInModal', () => {
  it('renders with pre-filled value', () => {
    render(<CheckInModal {...baseProps} />);
    const input = screen.getByLabelText(/value/i) as HTMLInputElement;
    expect(input.value).toBe('42');
  });

  it('pre-selects confidence from kr status', () => {
    render(<CheckInModal {...baseProps} />);
    const atRiskBtn = screen.getByRole('button', { name: /at risk/i });
    expect(atRiskBtn).toHaveAttribute('aria-pressed', 'true');
  });

  it('value field is read-only for live KRs', () => {
    render(<CheckInModal {...baseProps} isLive={true} />);
    const input = screen.getByLabelText(/value/i) as HTMLInputElement;
    expect(input.readOnly).toBe(true);
  });

  it('calls onSubmit with value, confidence, and note', () => {
    render(<CheckInModal {...baseProps} />);
    fireEvent.change(screen.getByLabelText(/value/i), { target: { value: '55' } });
    fireEvent.click(screen.getByRole('button', { name: /on track/i }));
    fireEvent.change(screen.getByPlaceholderText(/driving/i), { target: { value: 'Looking good' } });
    fireEvent.click(screen.getByRole('button', { name: /record check-in/i }));
    expect(baseProps.onSubmit).toHaveBeenCalledWith({
      value: 55,
      confidence: 'on_track',
      note: 'Looking good',
    });
  });

  it('truncates note to 500 chars', () => {
    render(<CheckInModal {...baseProps} />);
    const longNote = 'x'.repeat(600);
    fireEvent.change(screen.getByPlaceholderText(/driving/i), { target: { value: longNote } });
    fireEvent.click(screen.getByRole('button', { name: /record check-in/i }));
    expect(baseProps.onSubmit.mock.calls[0][0].note).toHaveLength(500);
  });

  it('maps behind status to Blocked confidence', () => {
    render(<CheckInModal {...baseProps} krStatus={'behind' as any} />);
    const blockedBtn = screen.getByRole('button', { name: /blocked/i });
    expect(blockedBtn).toHaveAttribute('aria-pressed', 'true');
  });

  it('maps done status to On Track confidence', () => {
    render(<CheckInModal {...baseProps} krStatus={'done' as any} />);
    const onTrackBtn = screen.getByRole('button', { name: /on track/i });
    expect(onTrackBtn).toHaveAttribute('aria-pressed', 'true');
  });

  it('submits on Enter key', () => {
    render(<CheckInModal {...baseProps} />);
    fireEvent.keyDown(screen.getByLabelText(/value/i), { key: 'Enter' });
    expect(baseProps.onSubmit).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/__tests__/CheckInModal.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement CheckInModal**

Create `src/components/goals/CheckInModal.tsx`. The component:
- Takes props: `open`, `onClose`, `onSubmit`, `krTitle`, `currentValue`, `krStatus`, `isLive`, `theme`
- State: `value` (number), `confidence` (Confidence | undefined), `note` (string)
- Pre-fills value from `currentValue`, confidence from status mapping
- Value input is `readOnly` when `isLive`
- Three confidence toggle buttons with `aria-pressed`
- Note textarea with 500 char max
- Submit calls `onSubmit({ value, confidence, note: note.slice(0, 500) })` then `onClose()`
- Uses existing `Modal`, `buttonStyle`, `inputStyle`, `labelStyle` from shared styles

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/__tests__/CheckInModal.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/goals/CheckInModal.tsx src/components/__tests__/CheckInModal.test.tsx
git commit -m "feat: add CheckInModal component with confidence and note fields"
```

---

## Task 6: Wire CheckInModal into GoalsPage + remove old checkIn

**Files:**
- Modify: `src/pages/GoalsPage.tsx`

- [ ] **Step 1: Add CheckInModal state and import**

Add to GoalsPage:
```ts
import { CheckInModal } from '../components/goals/CheckInModal';
```
Add state:
```ts
const [checkInTarget, setCheckInTarget] = useState<{ goalId: string; krIndex: number } | null>(null);
```

- [ ] **Step 2: Replace old checkIn button with modal opener**

Replace the inline `handleCheckIn` call on manual KR buttons (around line 713) with:
```ts
onClick={(e) => { e.stopPropagation(); setCheckInTarget({ goalId: goal.id, krIndex: ki }); }}
```

- [ ] **Step 3: Add Check In button for live KRs**

Next to the existing sync button area in each KR row, add a "Check In" button for live KRs (when `kr.liveConfig` is present). Same click handler opening the modal.

- [ ] **Step 4: Render CheckInModal**

Add before the closing `</>` of the goals view:
```tsx
{checkInTarget && (() => {
  const goal = goals.find(g => g.id === checkInTarget.goalId);
  const kr = goal?.keyResults[checkInTarget.krIndex];
  if (!goal || !kr) return null;
  return (
    <CheckInModal
      open={true}
      onClose={() => setCheckInTarget(null)}
      onSubmit={(entry) => {
        checkInKR(checkInTarget.goalId, checkInTarget.krIndex, { ...entry, actor: currentUser.name });
        toast('Check-in recorded!', COLOR_SUCCESS, '📋');
        logAction(`Check-in on "${goal.title}" KR "${kr.title}"`, currentUser.name, COLOR_SUCCESS);
        setCheckInTarget(null);
      }}
      krTitle={kr.title}
      currentValue={kr.current}
      krStatus={kr.status}
      isLive={!!kr.liveConfig}
      theme={theme}
    />
  );
})()}
```

- [ ] **Step 5: Remove old handleCheckIn function and checkIn store selector**

Remove `const checkIn = useStore((s) => s.checkIn);` and the `handleCheckIn` function. Add `const checkInKR = useStore((s) => s.checkInKR);` instead.

- [ ] **Step 6: Run type check and tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: Clean

- [ ] **Step 7: Commit**

```bash
git add src/pages/GoalsPage.tsx
git commit -m "feat: wire CheckInModal into GoalsPage, remove old checkIn quick-bump"
```

---

## Task 7: Monitoring mode UI (GoalsPage + ClientsPage)

**Files:**
- Modify: `src/pages/GoalsPage.tsx`
- Modify: `src/pages/ClientsPage.tsx`

- [ ] **Step 1: Add monitor toggle to GoalsPage expanded goal view**

In the expanded goal header area (next to "Sync Live KRs" button), add monitoring controls:
- Read `goal.monitorUntil` and `clients` with `monitorUntil` matching this goal's `clientIds`
- If goal or client is actively monitored, show pill badge with expiry date and X to cancel
- If client-monitored, show "Monitored via [ClientName]" (non-dismissible from goal view)
- If not monitored, show "Monitor" link that opens a small dropdown (1/3/7/14 day options)
- Gate behind `permissions.canCheckIn`

- [ ] **Step 2: Add monitor toggle to ClientsPage ClientRow**

In `ClientRow` expanded view, in the Database Connection subsection, add the same pattern:
- Read `client.monitorUntil`
- Active: pill badge "Monitoring all goals until [date]" with X
- Inactive: "Monitor" link with duration dropdown
- Gate behind `permissions.canCheckIn` (pass as prop to ClientRow)

- [ ] **Step 3: Add setMonitor store selector to both pages**

```ts
const setMonitor = useStore((s) => s.setMonitor);
```

- [ ] **Step 4: Run type check**

Run: `npx tsc --noEmit`
Expected: Clean

- [ ] **Step 5: Commit**

```bash
git add src/pages/GoalsPage.tsx src/pages/ClientsPage.tsx
git commit -m "feat: add monitoring mode toggles to GoalsPage and ClientsPage"
```

---

## Task 8: Report sub-components (KRSparkLine, TrendBadge, ConfidenceBadge, HistoryDetail)

**Files:**
- Create: `src/components/reports/KRSparkLine.tsx`
- Create: `src/components/reports/TrendBadge.tsx`
- Create: `src/components/reports/ConfidenceBadge.tsx`
- Create: `src/components/reports/HistoryDetail.tsx`

- [ ] **Step 1: Create KRSparkLine**

Wraps the existing `SparkLine` component. Extracts `value` array from `KRHistoryEntry[]`. Returns dash for 0 entries. Passes through to `SparkLine` for 1+ entries.

```ts
// src/components/reports/KRSparkLine.tsx
import { SparkLine } from '../ui/SparkLine';
import type { KRHistoryEntry } from '../../types';

interface KRSparkLineProps {
  history: KRHistoryEntry[];
  color: string;
  w?: number;
  h?: number;
}

export function KRSparkLine({ history, color, w, h }: KRSparkLineProps) {
  if (history.length === 0) {
    return <span style={{ color: '#888', fontSize: 12 }}>—</span>;
  }
  return <SparkLine data={history.map(e => e.value)} color={color} w={w} h={h} />;
}
```

- [ ] **Step 2: Create TrendBadge**

Props: `history: KRHistoryEntry[]`, `target: number`, `start: number`, `theme`. Computes linear slope from last N entries (min 2, max 5). Classifies as up/flat/down — "flat" when absolute slope < 2% of `Math.abs(target - start)`. Returns `null` for 0-1 entries.

- [ ] **Step 3: Create ConfidenceBadge**

Wraps `PillBadge`. Scans history array for last entry with confidence set. Returns null if none found. Maps confidence to color: `on_track` -> green, `at_risk` -> yellow, `blocked` -> red.

- [ ] **Step 4: Create HistoryDetail**

Expandable panel showing:
- Full history table (timestamp, value, confidence, note, actor, source)
- Larger SVG line chart (reuse SparkLine technique but wider, with Y-axis labels)
- Period delta: last 7 days vs prior 7 days value change, or dash if insufficient data

- [ ] **Step 5: Add report utility functions with tests**

Create `src/utils/reportHelpers.ts` with:
- `computeGoalProgressTimeline(keyResults: KeyResult[]): Array<{timestamp: string; progress: number}>` — collects all unique timestamps across KR histories, uses last-known-value for each KR at each point, returns goal progress at each timestamp
- `computePeriodDelta(history: KRHistoryEntry[], windowDays?: number): number | null` — compares average value in the last N days to the prior N days. Returns null if either window has no entries. Default windowDays=7.
- `computeTrend(history: KRHistoryEntry[], target: number, start: number): 'up' | 'flat' | 'down' | null` — linear slope of last min(5, available) entries, min 2. Flat threshold: 2% of |target-start|.

Create `src/utils/__tests__/reportHelpers.test.ts` with tests for:
- `computeGoalProgressTimeline` with KRs having different timestamps
- `computeGoalProgressTimeline` with empty histories
- `computePeriodDelta` with data in both windows
- `computePeriodDelta` returning null when one window is empty
- `computeTrend` up/flat/down classification
- `computeTrend` returning null for 0-1 entries

- [ ] **Step 6: Run all tests**

Run: `npx vitest run src/utils/__tests__/reportHelpers.test.ts`
Expected: PASS

- [ ] **Step 7: Run type check**

Run: `npx tsc --noEmit`
Expected: Clean

- [ ] **Step 8: Commit**

```bash
git add src/components/reports/ src/utils/reportHelpers.ts src/utils/__tests__/reportHelpers.test.ts
git commit -m "feat: add report sub-components and utility functions for trend/delta/timeline"
```

---

## Task 9: ClientReportView

**Files:**
- Create: `src/components/reports/ClientReportView.tsx`
- Create: `src/components/__tests__/ClientReport.test.tsx`

- [ ] **Step 1: Write failing test**

Test: renders client selector, shows goals for selected client, shows "No goals for this client" empty state, multi-client goals appear under each client.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/__tests__/ClientReport.test.tsx`

- [ ] **Step 3: Implement ClientReportView**

- Client dropdown with "All Clients" option
- For each goal: header (title, status, progress bar), KR rows with KRSparkLine, TrendBadge, ConfidenceBadge, last check-in preview
- Click KR row to expand HistoryDetail inline
- "All Clients" groups goals under client name headers
- Standalone goals (no `clientIds`) excluded

- [ ] **Step 4: Run test to verify it passes**

- [ ] **Step 5: Commit**

```bash
git add src/components/reports/ClientReportView.tsx src/components/__tests__/ClientReport.test.tsx
git commit -m "feat: add ClientReportView — by-client goal and KR reporting"
```

---

## Task 10: GoalReportView

**Files:**
- Create: `src/components/reports/GoalReportView.tsx`
- Create: `src/components/__tests__/GoalReport.test.tsx`

- [ ] **Step 1: Write failing test**

Test: renders goal selector grouped by client, "Unassigned" group for standalone goals, KR side-by-side sorted by progress, goal-level progress sparkline.

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement GoalReportView**

- Goal dropdown grouped by client (standalone under "Unassigned")
- Goal header with progress trend sparkline (computed via last-known-value interpolation across KR timestamps)
- All KRs with sparklines, confidence, notes
- KRs sorted by progress (lowest first = dragging goal down)

- [ ] **Step 4: Run test to verify it passes**

- [ ] **Step 5: Commit**

```bash
git add src/components/reports/GoalReportView.tsx src/components/__tests__/GoalReport.test.tsx
git commit -m "feat: add GoalReportView — by-goal KR analysis with progress trend"
```

---

## Task 11: KRTemplateReportView

**Files:**
- Create: `src/components/reports/KRTemplateReportView.tsx`
- Create: `src/components/__tests__/KRTemplateReport.test.tsx`

- [ ] **Step 1: Write failing test**

Test: renders template selector from existing templates, client rows sorted by progress ascending, excludes deleted templates, shows empty state when no materializations.

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement KRTemplateReportView**

- Template dropdown sourced from `goalTemplates[].krTemplates`
- One row per client: name, color dot, current, target, sparkline, confidence, trend
- Sorted by progress ascending (worst first)
- Only existing templates shown

- [ ] **Step 4: Run test to verify it passes**

- [ ] **Step 5: Commit**

```bash
git add src/components/reports/KRTemplateReportView.tsx src/components/__tests__/KRTemplateReport.test.tsx
git commit -m "feat: add KRTemplateReportView — cross-client KR comparison by template"
```

---

## Task 12: Wire report views into ReportsPage

**Files:**
- Modify: `src/pages/ReportsPage.tsx`

- [ ] **Step 1: Add view toggle at top of ReportsPage**

Add state `const [reportView, setReportView] = useState<'tasks' | 'client-goals'>('tasks');`

Add toggle buttons at top: "Tasks" | "Client Goals" (same button style as GoalsPage view toggle).

- [ ] **Step 2: Wrap existing content in Tasks tab**

Wrap all existing ReportsPage content (summary cards, breakdowns, KPI, compliance) inside `{reportView === 'tasks' && (...)}`.

- [ ] **Step 3: Add Client Goals tab with sub-navigation**

```tsx
{reportView === 'client-goals' && (
  <div>
    {/* Sub-nav: By Client | By Goal | By KR Template */}
    {subView === 'client' && <ClientReportView ... />}
    {subView === 'goal' && <GoalReportView ... />}
    {subView === 'template' && <KRTemplateReportView ... />}
  </div>
)}
```

Pass required store data (goals, clients, goalTemplates) and theme as props.

- [ ] **Step 4: Run type check and full test suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: Clean

- [ ] **Step 5: Commit**

```bash
git add src/pages/ReportsPage.tsx
git commit -m "feat: add Tasks/Client Goals toggle and three-view reporting to ReportsPage"
```

---

## Task 13: Final integration check

**Files:** None (verification only)

- [ ] **Step 1: Run full type check**

Run: `npx tsc --noEmit`
Expected: Clean, zero errors

- [ ] **Step 2: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 3: Run production build**

Run: `npx vite build`
Expected: Successful build

- [ ] **Step 4: Verify no regressions in existing functionality**

Manually verify:
- Existing goals still display correctly
- Template materialization still works
- Live KR sync still works
- Client CRUD still works
- Reports Tasks tab still shows existing content

- [ ] **Step 5: Final commit if any cleanup needed**

```bash
git add -A
git commit -m "chore: final cleanup for KR history and reporting feature"
```
