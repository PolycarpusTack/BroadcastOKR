# KR History, Enhanced Check-ins & Reporting

**Date**: 2026-03-18
**Status**: Draft
**Scope**: Historical KR tracking, enhanced check-in workflow, monitoring mode, three-view client/goal/template reporting

## Problem

BrOKR pulls live KR values from production databases but discards history on each sync. There is no record of how a KR evolved over time, no qualitative context (confidence, notes) attached to check-ins, and the Reports page only covers task statistics. Teams cannot answer "how is VRT trending this quarter?" or "which clients are falling behind on Rights Coverage?"

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Storage | Client-side (Zustand + localStorage) | Follows existing patterns, works offline, no bridge changes |
| History default | Check-in cadence only | Intentional snapshots keep storage lean |
| Monitoring mode | Per-goal and per-client toggles with expiry | Allows intensive recording during incidents without permanent overhead |
| Reporting | Three views: by client, by goal, by KR template | Client-centric first (matches broadcast ops mental model), goal and template views for cross-cutting analysis |
| Chart approach | SVG polyline (extended SparkLine) | No new dependencies, consistent with existing SparkLine component |

## 1. Data Model

### New type: KRHistoryEntry

```ts
interface KRHistoryEntry {
  timestamp: string;       // ISO 8601
  value: number;           // KR current value at this point
  confidence?: 'on_track' | 'at_risk' | 'blocked';
  note?: string;           // optional, max 500 chars
  actor: string;           // from useAuth().currentUser.name
  source: 'check-in' | 'sync';
}
```

**Actor field**: Populated from `useAuth().currentUser.name` for manual check-ins, and `'system'` for monitoring-triggered sync entries. In the current persona-switcher auth model this reflects the active persona. If real auth is added later, the field carries forward unchanged.

### KeyResult additions

```ts
interface KeyResult {
  // ... existing fields unchanged ...
  history?: KRHistoryEntry[];  // capped at 100 entries
}
```

### Goal additions

```ts
interface Goal {
  // ... existing fields unchanged ...
  monitorUntil?: string;  // ISO date — every sync writes history while active
}
```

### Client additions

```ts
interface Client {
  // ... existing fields unchanged ...
  monitorUntil?: string;  // ISO date — monitors all goals for this client
}
```

### Storage budget

- Cap: **100 entries per KR**. When exceeded, prune to 75 (drop oldest 25).
- Worst case: 50 clients x 5 KRs x 100 entries x ~120 bytes = **~3MB**.
- This stays well within the 5MB localStorage limit even with existing app state (~500KB).
- `history` is `undefined` until the first check-in — no cost for existing KRs.
- **Quota-exceeded handler**: Wrap the Zustand `persist` storage adapter with a try/catch. On `QuotaExceededError`, show a user-visible toast ("Storage full — export or clear old history") and skip the write. App state from the previous successful persist remains intact.

## 2. Store Actions

### New actions

**`checkInKR(goalId: string, krIndex: number, entry: { value: number; confidence?: 'on_track' | 'at_risk' | 'blocked'; note?: string; actor: string })`**

Replaces the old `checkIn` action (10% bump). This version:
1. Pushes a `KRHistoryEntry` with `source: 'check-in'` to `kr.history`
2. Updates `kr.current` to `entry.value` (for manual KRs) or leaves `kr.current` unchanged (for live KRs — see Section 3)
3. Recalculates `kr.progress` and `kr.status` from start/target/current
4. Recalculates goal-level progress via `recalcGoal()`
5. Prunes history if over 100 entries

**`setMonitor(type: 'goal' | 'client', id: string, days: number | null)`**

Sets `monitorUntil` to `now + days` on the target goal or client. Pass `null` to clear. Gated by `canCheckIn` permission (same users who can check in can enable monitoring).

### Modified actions

**`syncLiveKRBatch`** — After updating current/progress (existing behavior), checks:
1. Does the goal have `monitorUntil` set and not expired?
2. Does **any** client in `goal.clientIds` have `monitorUntil` set and not expired?
3. If either is true, pushes a history entry with `source: 'sync'`, `actor: 'system'`
4. Applies 100-entry cap

**`syncLiveKR`** — Same monitoring-aware history logic.

### Modified: Goal editing preserves history

In `GoalsPage.handleEditSave`, when building `updatedKRs`, carry forward `kr.history` from matched existing KRs (matched by index position, consistent with current behavior for all other KR fields like `current`, `syncStatus`, etc.).

### Removed actions

**`checkIn`** (the old 10% bump) — removed. All check-ins go through `checkInKR`.

### Helper

```ts
function pruneHistory(history: KRHistoryEntry[]): KRHistoryEntry[]
```
If length > 100, return last 75. Used by all actions that write history.

## 3. Check-in UI

### Check-in Modal

New component: `src/components/goals/CheckInModal.tsx`

Opens when the user clicks "Check In" on any KR row in the expanded goal view.

**Contents:**
1. KR title and current value displayed at top for context
2. **Value** — number input, pre-filled with current value. **Read-only for live KRs** (database is source of truth; next sync would overwrite any manual change). Editable for manual KRs.
3. **Confidence** — three toggle buttons: On Track / At Risk / Blocked. Pre-selects using this mapping:

| `kr.status` | Confidence default |
|-------------|-------------------|
| `on_track` | On Track |
| `at_risk` | At Risk |
| `behind` | Blocked |
| `done` | On Track |

4. **Note** — optional textarea, placeholder "What's driving this? (optional)", max 500 chars
5. **Submit** — "Record Check-in" button

**Validation:**
- Value must be a finite number (enforced by `type="number"` input)
- Value can be negative (some KRs track deltas)
- Value can exceed target (overshoot is valid)
- Empty value prevents submission (button disabled)
- Note truncated to 500 chars on submit

**Keyboard interaction:**
- Enter submits from any field
- Escape closes the modal (inherits from existing Modal component)
- Tab order: value -> confidence buttons -> note -> submit

**Behavior:**
- Calls `checkInKR()` store action with `actor` from `useAuth().currentUser.name`
- For live KRs: `entry.value` is set to `kr.current` (recording the synced value, not changing it)
- Shows toast on success
- Fast path: open -> Enter (value and confidence are pre-filled)

### GoalsPage changes

- "Check In" button on manual KRs opens CheckInModal instead of calling old `checkIn()`
- Live KRs gain a "Check In" button alongside "Sync" — lets team add confidence/notes to synced values
- Old quick-bump behavior removed

## 4. Monitoring Mode UI

### Goal-level (GoalsPage, expanded view)

Next to the "Sync Live KRs" button:
- **Off**: subtle "Monitor" text link
- **Click**: dropdown with 1 / 3 / 7 / 14 day options
- **On**: pill badge "Monitoring until Mar 25" with X to cancel
- If monitoring is active because a **client** has monitoring enabled (not the goal itself), show "Monitored via [ClientName]" badge instead (non-dismissible from goal view — cancel at client level). If multiple clients have active monitoring, show "Monitored via [Client1], [Client2]" (truncate with "+N more" if more than 2).
- Calls `setMonitor('goal', goalId, days)`
- Gated by `canCheckIn` permission

### Client-level (ClientsPage, expanded row)

In the Database Connection subsection, same pattern:
- Same duration options
- Badge: "Monitoring all goals until Mar 25"
- Calls `setMonitor('client', clientId, days)`
- Gated by `canCheckIn` permission

### Expiration

- Checked at sync time, not by a timer
- Expired monitors are inert — badge disappears when `new Date() > monitorUntil`
- No background cleanup process needed

## 5. Reporting

### Location

`ReportsPage.tsx` gets a top-level view toggle: **Tasks** (existing content: summary cards, status/priority breakdowns, KPI Trends, Channel Compliance) | **Client Goals** (new).

The Client Goals view has a sub-navigation row with three modes:

### View 1: By Client (default)

- Client dropdown selector, or "All Clients" which shows a flat list of all client goals grouped under client name headers. Standalone goals (no `clientIds`) are excluded from this view — they appear in View 2 under "Unassigned."
- Multi-client goals (with multiple `clientIds`) appear under each client they belong to
- For each goal belonging to the selected client:
  - Goal header: title, status badge, progress bar
  - KR rows: title, current/target, progress, SparkLine from history, latest confidence badge (scanned from last history entry with confidence set), last check-in time and note preview
  - Trend indicator per KR: up / flat / down (linear slope of last 5 history entries)
- Drill-down: click a KR to expand inline with full history table + larger SVG line chart + period-over-period delta (compare last 7 days to prior 7 days, showing value delta). If either 7-day window has no history entries, show a dash instead of a delta value.

### View 2: By Goal

- Goal dropdown grouped by client. Standalone goals (no `clientIds`) appear under an "Unassigned" group.
- Goal header with overall progress trend sparkline. Computed by collecting all unique timestamps across KR histories, using last-known-value for each KR at each timestamp, and recalculating goal progress (average of KR progress values) at each point.
- All KRs with full history, sparklines, confidence, notes
- Side-by-side: which KRs are pulling the goal up vs dragging it down (sorted by progress)

### View 3: By KR Template

- KR template dropdown sourced from existing `goalTemplates[].krTemplates`. Only templates that still exist are shown (orphaned `krTemplateId` values on deleted templates are excluded).
- One row per client that has a materialized goal with this KR template
- Each row: client name, color dot, current value, target, sparkline, confidence, trend
- Sorted by progress ascending (worst performing first)

### Empty states

| Component | Condition | Display |
|-----------|-----------|---------|
| KRSparkLine | 0 history entries | Dash (`—`) |
| KRSparkLine | 1 history entry | Single dot at value |
| TrendBadge | 0-1 history entries | Hidden (not rendered) |
| TrendBadge | 2-4 history entries | Trend from available entries |
| TrendBadge | 5+ entries | Trend from last 5 |
| ConfidenceBadge | No entry with confidence | Hidden |
| HistoryDetail | 0 entries | "No check-ins recorded yet" text |
| ClientReportView | Client has no goals | "No goals for this client" |
| GoalReportView | Goal has KRs but no history | KR rows shown without sparklines |
| KRTemplateReportView | Template has no materializations | "No clients have materialized this template" |

### TrendBadge calculation

- Linear slope of the last N entries (N = min(5, available entries), minimum 2)
- Slope computed from **values** (not progress percentages)
- "Flat" threshold: absolute slope < 2% of the KR's target-start range
- Display: arrow up (green) / arrow right (gray) / arrow down (red)

### Shared sub-components

All in `src/components/reports/`:

| Component | Purpose | ~Size |
|-----------|---------|-------|
| `KRSparkLine` | SparkLine wrapper that takes `KRHistoryEntry[]` | ~40 lines |
| `TrendBadge` | Up/flat/down indicator from last 5 entries | ~30 lines |
| `ConfidenceBadge` | on_track/at_risk/blocked pill | ~20 lines |
| `HistoryDetail` | Expandable history table + larger SVG chart | ~80 lines |
| `ClientReportView` | By-client report view | ~120 lines |
| `GoalReportView` | By-goal report view | ~100 lines |
| `KRTemplateReportView` | By-template cross-client view | ~100 lines |

### No new dependencies

Larger chart is an SVG `<polyline>` with axis labels — same technique as SparkLine, scaled up. No D3/Recharts.

## 6. Migration & Safety

### No migration needed

All new fields are optional with `undefined` as the correct default. Existing KRs show "No check-ins yet" in reports. No `onRehydrateStorage` changes required.

### Old checkIn removal

The `checkIn` action is removed. Its single callsite in GoalsPage changes to open CheckInModal. The `checkIn` test in the store test file gets replaced with `checkInKR` tests.

### History preservation during edits

`GoalsPage.handleEditSave` currently matches existing KRs by index position. This is fragile when KRs are reordered or deleted — history could be misattributed. As part of this feature, **switch to matching by `kr.id`** instead of index position. The edit flow already has access to the existing goal's KR array. Match each form KR to its existing KR by `id` (form KRs carry the `id` from the existing KR they were initialized from in `openEditModal`). This also fixes the pre-existing fragility for `current`, `syncStatus`, and other carried-forward fields. Add `history: existing?.history` to the reconstructed KR object literal in the "changed" code path.

### History after template sync

When `syncTemplateToGoals` changes a KR's `start`/`target`, existing history entries retain their original `value`. The historical values are absolute (not percentages), so they remain valid — the interpretation relative to the new target changes, but the raw data is correct. No history rewrite needed.

### Cascade deletes

- `deleteGoal`: history deleted with the goal. Expected behavior.
- `deleteClient(cascade=true)`: goals and their history deleted. Expected.
- `deleteClient(cascade=false)`: goals kept, history preserved. Expected.
- `deleteGoalTemplate(cascade=true)`: derived goals and history deleted. Expected.

### localStorage quota

- Wrap Zustand persist's `setItem` with try/catch
- On `QuotaExceededError`: show toast "Storage nearly full — consider exporting history", skip write
- Previous successful persist remains intact — no data loss
- Future escape hatch (not built now): export history to JSON, or IndexedDB migration

### Testing

**`src/store/__tests__/history.test.ts`**
- `checkInKR` writes history entry with correct fields
- `checkInKR` recalculates progress from new value
- `checkInKR` prunes history at 100 entries (to 75)
- `checkInKR` does not update `kr.current` when KR has `liveConfig` (live KR)
- `syncLiveKRBatch` writes history when goal has active monitor
- `syncLiveKRBatch` does NOT write history when monitor is expired
- `syncLiveKRBatch` writes history when any client in `clientIds` has active monitor
- `setMonitor` sets and clears `monitorUntil` on goals and clients
- `pruneHistory` returns last 75 when input exceeds 100
- Quota-exceeded handler shows toast and skips write without corrupting state

**`src/components/__tests__/CheckInModal.test.tsx`**
- Renders with pre-filled value and confidence
- Value field is read-only when KR has liveConfig
- Submits with value, confidence, and note
- Enforces 500-char note limit
- Enter key submits, Escape closes

**Report view tests** (one file per view):
- `ClientReport.test.tsx` — renders client selector, goal rows, sparklines, empty states
- `GoalReport.test.tsx` — renders goal selector, KR comparison, standalone goals under "Unassigned"
- `KRTemplateReport.test.tsx` — renders template selector, client rows sorted by progress, excludes deleted templates

## 7. Files Changed / Created

### New files
- `src/components/goals/CheckInModal.tsx`
- `src/components/reports/KRSparkLine.tsx`
- `src/components/reports/TrendBadge.tsx`
- `src/components/reports/ConfidenceBadge.tsx`
- `src/components/reports/HistoryDetail.tsx`
- `src/components/reports/ClientReportView.tsx`
- `src/components/reports/GoalReportView.tsx`
- `src/components/reports/KRTemplateReportView.tsx`
- `src/store/__tests__/history.test.ts`
- `src/components/__tests__/CheckInModal.test.tsx`
- `src/components/__tests__/ClientReport.test.tsx`
- `src/components/__tests__/GoalReport.test.tsx`
- `src/components/__tests__/KRTemplateReport.test.tsx`

### Modified files
- `src/types/index.ts` — add `KRHistoryEntry`, extend `KeyResult`, `Goal`, `Client`
- `src/store/store.ts` — add `checkInKR`, `setMonitor`; modify `syncLiveKRBatch`, `syncLiveKR`; remove `checkIn`; add quota-exceeded handler to persist config
- `src/pages/GoalsPage.tsx` — replace checkIn calls with CheckInModal, add monitor toggle, preserve history in edit flow, switch KR matching from index to `kr.id`
- `src/components/goals/GoalFormFields.tsx` — carry `kr.id` through form state for id-based matching
- `src/pages/ClientsPage.tsx` — add monitor toggle to ClientRow
- `src/pages/ReportsPage.tsx` — add view toggle, render new report views
- `src/store/__tests__/clients.test.ts` — update tests referencing old `checkIn`

## 8. Out of Scope

- Periodic auto-sync timer (separate feature, already on CLAUDE.md roadmap)
- Export history to file / IndexedDB migration (future if localStorage becomes tight)
- Bridge-side history storage
- AI-powered insights or recommendations
- PDF/PPT report export
- Date range filtering on report views (fast follow once history accumulates)
- Custom monitoring durations beyond the preset options
