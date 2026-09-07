# ADR-B1 / ADR-B3 — Aggregates commit all or nothing; a check-in is one authorised command

Date: 2026-09-07. Status: accepted with B-1-T1, B-2-T1, B-3-T1..T4. Findings: F7, F4. Contracts: C5, C6.

## Context

`PUT /api/goals/:id` updated the goal row, bumped its version, and only then walked the key results.
An invalid nested KR (or any failure inside the upsert) left the parent's title and version committed
and the children as they were — a half-written aggregate with a new version. A KR id belonging to a
different goal was silently re-parented by the upsert. Task writes had the same shape.

`POST /api/goals/:id/check-in` wrote a history row and bumped `updated_at`, leaving the measured value
to a follow-up `PUT` of the whole goal from the client. A member is not allowed to PUT a goal, so a
member's check-in recorded history with value 55 while `current` stayed 0 for everyone.

## Decisions

### B1 — validate, then one synchronous SQLite transaction (`db.transaction`)

- `goalBodyProblem` / `taskBodyProblem` run before any write: types of every stored field, finite
  numbers, unique KR ids in the body, `version` numeric when present → `400 invalid_goal|invalid_task`
  with a `detail` naming the field.
- A KR id already owned by another goal → `409 kr_owned_by_other_goal { krId }`; both goals untouched.
- Create with an id that exists → `409 duplicate { current }` (a client retry can reconcile); the
  previous behaviour was a constraint error.
- Parent update, KR upsert/delete, subtask rewrite and the share-flag audit rows commit together.
  Stale `version` keeps `409 version_conflict { current }`; versionless bodies keep last-write-wins.
- No network await inside a transaction (all of this is better-sqlite3, synchronous).
- Other aggregate families (clients/channels, templates/KR templates, teams/members) have the same
  parent+children shape and are **not** changed here — recorded as follow-up candidates.

### B3 — the check-in command

- `POST /api/goals/:id/check-in { krId, value, confidence?, note?, operationId?, actor? }`.
  Validation: `krId` string, `value` finite number, strings optional, `operationId` ≤ 128 chars.
- In one transaction: history row; for a **manual** KR `current_val = value`; for a **live** KR the
  value is history only (the synced measurement stands); history pruned 100→75; the goal's
  `version` and `updated_at` bump so the change poll and CAS both see it.
- Response is additive to `{ ok: true }`: `applied: 'value' | 'history'`, the full authoritative
  `goal` DTO, `version`, `timestamp`.
- **Attribution:** cloud sessions are attributed to the user row's name (the body's `actor` is
  ignored); desktop keeps the persona from the body. Principal key for idempotency: `user:<id>` or
  `desktop`.
- **Idempotency:** `checkin_operations` (migration 011, additive) keyed by (principal, operationId)
  with a digest of (goal, kr, value, confidence, note) and the stored response. Same id + same digest
  → the stored response with `replayed: true` and no second history row; same id + different digest
  → `409 operation_conflict`. Rows older than 24 h are pruned on each call; an expired id is outside
  the retry guarantee. Requests without `operationId` (older clients) are **not** deduplicated —
  documented, not silently changed.
- **Progress/status stay client-computed** (`krProgress`, direction-aware, hold-the-line). The bridge
  stores what the last structural PUT sent; every client recomputes on merge (`withRecomputedProgress`
  in `_mergeChanges`), so a check-in's effect is correct everywhere without duplicating the
  progress rules server-side.

### B3-T4 — the client

- `store.checkInKR` applies the optimistic update, then sends exactly one `bridgeCheckIn` with a
  fresh `operationId` (`crypto.randomUUID`) and **no structural PUT**. The authoritative `goal`
  from the response is merged through `_mergeChanges`, which adopts the new version.
- `bridgeCheckIn` shares the goal's per-entity write queue with `bridgePutEntity`, so a check-in and
  a structural edit to the same goal reach the bridge in the order the user made them, and the
  next queued PUT reads the version the check-in returned. `bridgeFetch`'s retries resend the same
  body, so a lost response replays instead of duplicating.
- **Compatibility / minimum safe client:** this app version (0.9.2+remediation) always sends
  `version` on goal PUTs, so a stale full-goal write after a check-in gets `409 version_conflict`
  and cannot roll the value back. Older clients that PUT without a version remain last-write-wins
  — an explicit, documented risk; deploy the app and bridge together and treat 0.9.2 as the
  minimum safe client for check-ins. No protocol floor is raised.

## Evidence

- `bridge/__tests__/review-remediation-b.test.cjs` (11 cases, cloud mode, real session → RBAC →
  route → SQLite, readback after every refusal): invalid nested input, foreign KR id, duplicate create,
  stale version, valid commit, task create/update contracts; member check-in with session attribution,
  replay, operation conflict, principal-scoped ids, live-KR annotation, invalid input, stale-write
  no-rollback.
- `bridge/__tests__/aggregate-atomicity.test.cjs` (4 cases): injected failures after the parent write
  in goal create, goal update, check-in and task update; full before/after snapshots of goals, KRs,
  history, tasks, subtasks and operation records are equal.
- `bridge/__tests__/checkin-propagation.test.cjs` expectation replaced (value is now persisted);
  `src/store/__tests__/checkInBridge.test.ts` replaced (one command, no PUT, response adopted).

## Containment

If the command misbehaves, refuse `POST /api/goals/:id/check-in` at the RBAC table; never route back
to the old history-only + PUT pair. The `checkin_operations` table is additive and harmless on binary
rollback.
