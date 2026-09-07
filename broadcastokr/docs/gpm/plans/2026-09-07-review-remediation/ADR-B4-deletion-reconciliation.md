# ADR-B4 — Deletions travel with the change poll as markers on the existing timestamp protocol

Date: 2026-09-07. Status: accepted with B-4-T1..T5 and B-5-T1/T2. Finding: F6. Contract: C7.

## Context

`GET /api/sync/changes?since=` answered "what changed" with rows only. A goal, task, client, user,
team or template deleted on one client stayed in every other client's cache (and in its persisted
localStorage) until a full reload, and `_mergeChanges` had no way to learn about absence.

## Options weighed (B-4-T1)

| Option | Correctness | Load | Protocol change |
|---|---|---|---|
| **Markers on the timestamp protocol** (chosen) | at-least-once like rows; delete+recreate resolves by applying removals before upserts; bounded gap → explicit reset | one small table, one indexed range query per poll | additive field on an existing response |
| Monotonic sequence + cursor + tombstones | strictly ordered | same table plus a sequence column and cursor bookkeeping on both sides | new cursor contract, both sides, plus a legacy path |
| Full id inventory per poll | trivially correct | O(rows) ids every 5 s on every client | additive but heavy |

The markers reuse `since` and its −1 s at-least-once edge exactly as rows do, so nothing about ordering
or idempotency is new: removing an absent id is a no-op, re-sending a row is a no-op. The cursor design
buys strict ordering the client does not need (it merges by id) at the price of a second protocol.

## Decision

1. **Table** `sync_deletions (kind, id, deleted_at)` (migration 012, additive), one row per (kind, id),
   newest deletion wins. Kinds: `goals tasks clients users teams goalTemplates` — the slices the client
   keeps. Legacy `kpis` rows have no delete route and are out of scope.
2. **Every delete route** goes through `deleteWithMarker` (`bridge/syncDeletions.cjs`): DELETE and the
   marker commit in one transaction; nothing is recorded for a row that did not exist. Parents the
   schema rewrites get their `updated_at` bumped in the same transaction so their new shape travels in
   the same poll: tasks that lose their goal (SET NULL), goals that lose their template (SET NULL),
   teams that lose a lead (SET NULL) or a member (CASCADE). Nested deletes (KRs, subtasks, KR templates,
   team members) already travel inside their parent DTO.
3. **The poll** returns `deletions: { goals: [...], ... }` next to the rows, prunes markers older than
   30 days, and sets `resetRequired: true` when `since` is older than the retention window.
4. **The client** applies deletions before upserts (an id in both was recreated; the row wins), runs one
   poll at a time so a slow response cannot land after a newer one, and on `resetRequired` reloads the
   full snapshot through `_initFromBridge`, which replaces every slice (authoritative absence).
5. **Stale updates** to a deleted goal/task get `404` from the bridge (existing) and surface as a
   write failure toast; the marker removes the local copy on the next poll. Clients, teams and templates
   keep their `UPDATE … WHERE id` no-op on a missing row — they cannot recreate it either.
6. **Compatibility.** Older clients ignore the new field and behave exactly as before (stale rows until
   reload); their full-resync path is the existing reconnect. No protocol floor is raised; the app and
   bridge should ship together.

## Evidence

- `bridge/__tests__/sync-deletions.test.cjs` (in-process routes + sync): every kind reports its marker;
  parent invalidation for template→goal, goal→task, user→team; delete+recreate in one window; repeated
  delete idempotent; stale PUT/check-in on a deleted goal → 404; retention → `resetRequired` and pruning.
- `src/store/__tests__/mergeDeletions.test.ts`: removals per slice, row-wins on recreate, unknown ids and
  empty lists as no-ops with slice identity preserved, convergence on repeated application.
- Not covered here (needs two browser sessions): the 10 s convergence bound — B-6 on the rig.

## Containment

The field is additive; a client that ignores it is no worse than before. If markers misbehave, stop
writing them (routes fall back to plain DELETE) — never stop delivering rows.
