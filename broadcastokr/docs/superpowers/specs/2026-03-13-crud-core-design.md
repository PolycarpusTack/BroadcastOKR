# Sub-project A: CRUD & Core — Design Spec

**Goal:** Complete the data lifecycle for tasks and goals by adding edit, delete, description, and destructive-action confirmation.

**Features covered:** #1 Edit tasks, #2 Edit goals, #3 Delete tasks, #4 Delete goals, #5 Reassign tasks, #6 Task description field, #18 Undo/confirmation for destructive actions.

---

## 1. Type Changes

Add an optional `description` field to the `Task` interface:

```ts
export interface Task {
  // ... existing fields
  description?: string;
}
```

No other type changes. `Goal` already has all needed fields.

## 2. Store Changes

Four new actions on `AppStore`:

| Action | Signature | Behavior |
|---|---|---|
| `updateTask` | `(id: string, updates: Partial<Omit<Task, 'id'>>)` | Map over tasks, spread updates into matching task |
| `deleteTask` | `(id: string)` | Filter task out of array |
| `updateGoal` | `(id: string, updates: Partial<Omit<Goal, 'id'>>)` | Map over goals, spread updates, recalculate `progress` and `status` from key results |
| `deleteGoal` | `(id: string)` | Filter goal out of array |

`updateGoal` must recalculate `goal.progress` as the average of `keyResults[].progress` and derive `goal.status` via the existing `goalStatus()` helper.

## 3. Task Editing (TaskDetailModal)

### Read mode (default)
- Current layout preserved
- New "description" section below badges (plain text paragraph, or "No description" in muted text if empty)
- "Edit" button in top-right area (visible when `permissions.canEdit`)
- "Delete" button at bottom (visible when `permissions.canDelete`)

### Edit mode
Toggled by clicking "Edit". All fields become editable:
- **Title**: text input
- **Description**: textarea (3 rows, auto-expand optional)
- **Channel**: select dropdown
- **Priority**: select dropdown
- **Type**: select dropdown
- **Assignee**: select dropdown (this IS feature #5 — reassignment)
- **Due date**: date input
- **Subtasks**: existing toggle behavior remains; no edit of subtask text in this sub-project

Bottom of edit mode shows "Save" (primary) and "Cancel" (secondary) buttons. Save calls `updateTask`, shows toast, logs activity, exits edit mode. Cancel discards local state and exits edit mode.

## 4. Goal Editing (GoalsPage)

An "Edit" pencil icon button on the expanded goal card header (next to the expand chevron), visible when `permissions.canEdit`.

Clicking opens a modal (reuse the same `Modal` component) pre-filled with:
- Title
- Channel, Owner, Period dropdowns
- Key Results list (add/remove/modify title, start, target)

"Save" calls `updateGoal` which recalculates progress from KRs. Shows toast, logs activity. "Cancel" closes without saving.

## 5. Delete Confirmation (Inline)

A reusable `ConfirmDelete` component pattern (not a separate file — just an inline state toggle):

```
Default:  [Delete]
Clicked:  "Delete this task?" [Confirm] [Cancel]
```

Used in:
- TaskDetailModal (below subtasks section)
- GoalsPage expanded goal card (in header area)

On confirm: calls `deleteTask`/`deleteGoal`, shows toast ("Task deleted" / "Goal deleted"), logs activity, closes modal/collapses card.

## 6. Permission Gating

All actions respect existing `RolePermissions`:
- Edit button: `permissions.canEdit`
- Delete button: `permissions.canDelete`
- Members see read-only view only (current behavior preserved)

## 7. Files Affected

| File | Change |
|---|---|
| `src/types/index.ts` | Add `description?: string` to Task |
| `src/store/store.ts` | Add 4 new actions |
| `src/components/tasks/TaskDetailModal.tsx` | Edit mode, description, delete |
| `src/pages/GoalsPage.tsx` | Edit modal, delete on goal cards |
| `src/store/__tests__/store.test.ts` | Tests for new actions |

## 8. Out of Scope

- Rich text / markdown in description
- Editing subtask text (only toggle done/not-done)
- Drag-and-drop (Sub-project B)
- Search, filters, export (Sub-projects B & C)
