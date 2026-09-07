# ADR-A1 — Permission decisions use the identifier the handler writes; member task writes are field-scoped

Date: 2026-09-07. Status: accepted with A-1-T1 and A-3-T1. Findings: F1, F5. Contracts: C1, C4.

## Context

Two layers authorised a user-role change against different targets. `middleware/rbac.cjs` read the raw
`req.path` segment (`Number('%32')` is `NaN`, so the lookup found no row and the owner-only check was
skipped) while `routes/users.cjs` read the decoded `req.params.id` (`2`) and wrote the row. A manager could
therefore promote any user, including themselves, by percent-encoding the id.

Task updates were a single `PUT /api/tasks/:id` guarded by `canChangeStatus`, which every role holds. A
member's full-DTO write therefore replaced title, assignee, priority and the whole subtask list.

## Decision

1. **One id parser.** `bridge/utils/ids.cjs` `parseNumericId(segment)` decodes exactly once and accepts
   only `^\d{1,15}$`. Anything else (double encoding, signs, decimals, letters, empty) is `null`. Both the
   RBAC middleware and the users route call it, so the target that is authorised is the target that is
   loaded and written. `0` is a valid id.
2. **Fail closed at the boundary.** For `PUT /api/users/:id` carrying a `role`: invalid id → `400
   invalid_user_id`; no such user → `404`; role differs and the actor is not an owner → `403`. The route
   repeats the owner check against `req.user.role` (cloud sessions) so a policy or router slip cannot
   reach the write. Desktop mode (API key, no session role) keeps its single-user trust model.
3. **Member task writes are compared, not trusted.** In `routes/tasks.cjs` a session with role `member`
   is *restricted*: the body is merged over the stored DTO (omitted fields keep their stored value), then
   compared field by field inside the same SQLite transaction that performs the write. Any difference in
   `title, description, priority, assignee, channel, due, taskType, clientIds, channelScope, goalId`, or
   in the subtask list's length, order or text, is refused with `403 { error, field }` and nothing is
   written. `status` and each existing subtask's `done` may change. `undefined`, `null`, `''` and `[]`
   are treated as the same "nothing" so a DTO round-tripped through JSON or the client store does not
   trip the comparison.
4. **Contracts kept.** Malformed body → `400 invalid_task`; unknown task → `404`; stale `version` →
   `409 version_conflict` with the stored row; owners and managers keep the full-DTO contract exactly
   as before (absent fields still clear, as their forms rely on).

## Consequences

- Role policy is unchanged; only the identity it was applied to is fixed.
- The frontend needs no change: the member UI already sends full DTOs for moves and subtask ticks.
  A client that wants to send `{ status, version }` alone may now do so as a member.
- Other `:id` routes decode through Express and never authorised on the raw segment; a follow-up may
  still route them through `parseNumericId` for uniform 400s. Goal and task ids are strings and are
  out of scope here.
- Evidence: `bridge/__tests__/review-remediation-a.test.cjs` (8 cases, real session → middleware →
  route → SQLite, persisted-state readback after every refusal). Against the pre-fix code 6 of 8 fail;
  the two that pass are the permitted-path controls.

## Containment

Role changes: set no owner session and the endpoint is inert. Task editing: the policy is always on;
if a regression is suspected, refuse `PUT /api/tasks` for members at the RBAC table (`canChangeStatus`
→ `canEdit`) as a temporary measure — members then lose kanban moves until the fix lands.
