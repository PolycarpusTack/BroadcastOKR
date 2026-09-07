# Repository review remediation plan

Date: 2026-09-07. Baseline: `de815e6`, application/bridge version `0.9.2`.
Status: proposed implementation plan; no fixes, deployments, or risk acceptances have been performed.

## Purpose and scope

Restore the existing permission and persistence contracts for BroadcastOKR's owners, managers, and members, and make the packaged cloud application usable with SSO. Success means all seven findings below have passing regression evidence at the boundary where they failed, including persistence and another client's view.

This work belongs alongside the existing R4 hardening work and the R7 release checks. It does not close R1's unattended validation, R2 fleet operations, the wider R4 residuals, or R5 compliance work. It adds no product features, changes no pricing or role policy, and does not include a general UI/store rewrite.

The governance mode is **DELIVERY**, matching `docs/gpm/state/mode.md`. The collection's HARDENING mode only allows behavior-preserving refactoring/preparation. These remediation tasks change incorrect observable behavior, so they use the framework's **FEATURE** hat for corrective changes; independent structural preparation uses PREPARATORY. The existing execution mode file remains unchanged.

## Evidence baseline

| Finding | Observed failure | Evidence strength | Priority |
|---|---|---|---|
| F1 | Manager role change through `/api/users/2` returns 403; `/api/users/%32` returns 200 and persists owner role | Reproduced using the real auth/RBAC/router modules and an isolated SQLite database | High |
| F2 | `SELECT '--'; DELETE FROM review_only` passes the SELECT-only guard and is forwarded unchanged | Validator and mock PostgreSQL driver reproduction; no external database was modified | High |
| F3 | Runtime Docker stage installs the bridge manifest, which omits the dynamically imported `openid-client` | Source and dependency-manifest inspection; clean image not executed | High |
| F4 | Member check-in records history value 55, follow-up goal PUT returns 403, current value stays 0 | Real route/auth reproduction in an isolated database | High |
| F5 | Member task PUT changes title, assignee, and priority despite lacking edit/assign permissions | Real route/auth reproduction in an isolated database | High |
| F6 | Deleted task is absent from changes, and the client merge retains absent records | API reproduction plus frontend merge inspection | Medium |
| F7 | Invalid nested KR produces 500 after parent title and version have committed | Real route reproduction in an isolated database; analogous task update inspected | Medium |

Verification already performed: lint passed; production build passed; 309/309 frontend tests passed; 205/206 bridge tests passed. The bridge failure is the documented Windows POSIX `0600` assertion. Browser E2E, clean containers, real SQL enforcement, dependency auditing, and staging rollout were not part of that review. These counts are a baseline, not remediation acceptance evidence.

## Architecture and domain

React/TypeScript uses a persisted Zustand cache. The Express bridge is authoritative for SQLite entities and cloud sessions. Desktop uses its existing local API-key trust model. Client and cockpit instances use OIDC. Oracle/PostgreSQL access is concentrated in `bridge/whatson/core.cjs`, also consumed by the connector agent. The cockpit receives only explicitly shared metric fields.

| Term | Meaning in this plan |
|---|---|
| Owner | Existing role with structural editing, assignment, and role-management rights |
| Manager | Existing role with editing/assignment but no authority to change roles |
| Member | Existing role allowed check-ins, task status changes, and existing subtask completion toggles |
| Goal / Key result (KR) | Existing parent/child aggregate; manual KRs accept measured check-in values; live KRs retain externally synchronized values |
| Check-in | One accepted measurement/comment operation with history and an authoritative response |
| Entity version | Existing optimistic-concurrency counter on goals and tasks |
| Deletion marker | Proposed minimal entity kind/ID/cursor information needed to remove a record from a connected cache |
| Pull gate | Evidence and interface checks before starting dependent work; not automatic user-approval prompts |

Relevant existing data: `users`, `goals`, `key_results`, `kr_history`, `tasks`, `subtasks`; synchronization also carries clients, teams, goal templates, and legacy KPI rows. Dashboard `kpi_definitions` are a separate store and must not be confused with the `kpis` sync slice.

## Proposed solution contracts

These are planning decisions and implementation constraints, not claims about existing behavior. Cross-cutting choices become short ADRs/contract snapshots within their owning stories before dependent work is pulled.

### C1 — Role changes use the same identity as the handler (F1)

Authorize against the decoded and validated route identifier used to load the actual target user. Preserve existing valid IDs, including zero where present in fixtures/data. A missing/invalid target fails closed. Percent encoding, mixed-case paths, trailing slashes, double encoding, invalid numerics, and unknown IDs cannot change the actor's permissions. Owners retain legitimate role changes; managers retain permitted profile edits. Preserve session-derived roles, entitlement checks, and the operator allowlist.

Primary files: `bridge/middleware/rbac.cjs`, `bridge/routes/users.cjs`, `bridge/__tests__/rbac.test.cjs`.

### C2 — SQL validation and database enforcement agree (F2)

Replace regex comment/string removal with a reviewed SQL-aware single-statement validator supporting the syntax actually used by the Oracle and PostgreSQL templates/query builder. The original SQL sent to the driver must be the SQL that was validated. Strings, quoted identifiers, escaped quotes, real comments, PostgreSQL dollar quotes, and Oracle alternative quotes have explicit cases. Invalid or unsupported syntax produces an actionable rejection before database execution.

A SELECT prefix is not a read-only guarantee: SELECT INTO, locking queries, function calls, and multi-statement input need explicit treatment. A short implementation refinement step selects the parser/tokenizer against a positive corpus from the repository and a negative corpus. It does not introduce CTEs or new SQL features merely because a parser supports them.

Dedicated least-privilege database accounts remain required. A read-only transaction/session on the same checked-out connection as the query provides database enforcement; PostgreSQL and Oracle behavior, timeout/cancellation, rollback, and pool reuse require real-driver contract evidence. There is no arbitrary function-side-effect safety claim. Local contract tests may use disposable schemas with a disposable write-capable test account to demonstrate that the bridge's enforcement prevents writes; customer data/accounts are excluded.

The bridge, preview/batch/KPI paths, scheduled sync, and agent must consume the same validated core. Invalid queries never fall back to an unprotected runner. A safety switch may disable query execution; it must never disable validation while allowing queries.

Primary files: `bridge/whatson/core.cjs`, `bridge/routes/whatson.cjs`, `bridge/agentCore.cjs`, SQL tests, agent bundle script.

### C3 — The runtime dependency graph contains SSO (F3)

Declare `openid-client` in the bridge's production dependencies. Give the bridge runtime a reproducible lockfile/install path; update both Dockerfiles and packaging/bundle assumptions where relevant. A clean build cannot resolve modules from the application root or a host `node_modules` tree.

Validate both client and cockpit images through login, callback, `/api/auth/me`, logout, unauthenticated refusal, and persistence/restart using an isolated test IdP. Gate publication on these checks in CI/release workflow; an image that only builds or answers health is insufficient. Correct deployment documentation and `.env.example` for the existing cloud OIDC/encryption requirements.

Primary files: `bridge/package.json`, proposed bridge lockfile, `Dockerfile`, `bridge/Dockerfile`, `.github/workflows/ci.yml`, `.github/workflows/release.yml`, `bridge/routes/auth.cjs`.

### C4 — Member task writes are restricted by field (F5)

Keep the existing task update endpoint compatible with full task DTOs from the current frontend. A member may change task status and the `done` state of existing subtasks. Changing structural fields, changing subtask text, adding/removing/reordering subtasks, or assigning a task is refused with 403 and zero persistence effects. Equal structural fields in an existing full DTO are permitted; absent fields in a supported restricted payload do not erase stored fields. Invalid payloads return 400; unknown tasks return 404; stale version checks still return the existing 409 conflict contract. Owners/managers retain their existing operations. Comparison, authorization, version check, and mutation use one consistent stored state.

Primary files: `bridge/middleware/rbac.cjs`, `bridge/routes/tasks.cjs`, task/RBAC tests, relevant frontend task writes.

### C5 — Aggregate mutations commit all or nothing (F7)

Validate goals/tasks and their nested data before mutation; commit parent, nested rows, version/timestamp, and related audit/history changes in one synchronous SQLite transaction. Failure at any point restores every affected row and version. A KR ID already belonging to a different goal is rejected instead of updating the other goal's KR through the upsert. Existing version-conflict responses remain compatible. No transaction spans a network await.

Scope is the identified goal/task create/update paths and changes required for check-ins/deletion delivery. Other aggregates with analogous patterns are recorded as follow-up candidates, not silently folded into this plan. Create retry uses the existing client-generated entity ID and a documented duplicate/conflict response; versioned updates are not silently replayed against a newer version.

Primary files: `bridge/routes/goals.cjs`, `bridge/routes/tasks.cjs`, aggregate/API/version tests.

### C6 — Check-in is one authorized command (F4)

`POST /api/goals/:id/check-in` owns a finite manual KR value, one history entry, and the parent change/version signal atomically. Live KR check-ins remain annotation/history-only for the measured value, preserving current domain semantics. Cloud attribution comes from the authenticated principal; desktop persona attribution follows the existing local trust model. Invalid input and unknown goal/KR associations fail without side effects.

The response is additive to `{ ok: true }` and includes the authoritative goal/version or sufficient facts to refresh it. The frontend consumes that response and stops sending the structural goal PUT. It continues using `krProgress`/goal recalculation for presentation; authoritative measured facts must not depend on permission to PUT a goal. Check-ins and structural writes to the same goal share an ordering contract: an old captured full DTO must not be sent with a newer version simply because the queue reads the version later. Replayed responses cannot regress a newer goal in the cache.

New clients send a stable operation ID across transport retries. A persisted, bounded idempotency record scoped to principal/goal/operation prevents duplicate history; conflicting reuse of a key is rejected. The operation record and check-in commit together. Proposed retention is 24 hours (well beyond the current retry window); privacy review confirms only IDs, a request digest, and minimal response metadata are retained. An expired key is outside the retry guarantee. Legacy unkeyed requests remain explicitly outside the new deduplication guarantee; the supported legacy/new-client matrix is tested and documented.

Versioned stale full-goal writes cannot roll back an accepted check-in. Legacy versionless writers remain an explicit compatibility risk: coordinated app/bridge delivery, upgrade guidance, and a documented minimum safe client are part of acceptance. The implementation refinement decides whether narrow rejection of conflicting legacy KR-value writes is sufficient or a protocol-floor change is necessary; no protocol floor is raised silently.

Primary files: `bridge/routes/goals.cjs`, `src/store/store.ts`, `src/store/bridgeSync.ts`, check-in modal/tests, next additive migration.

### C7 — Deletions reach every supported connected client (F6)

Proposed design: additive deletion markers plus a monotonic synchronization cursor. Deletion and its marker commit together. Full-state reads return a matching watermark, incremental reads return coherent changes/deletions and the next cursor, and the client applies each response in order before advancing its cursor. Legacy timestamp reads remain available within the supported protocol window. An older client that ignores new fields is not fixed by that additive response: the accepted compatibility contract needs a working full-resync/update path for every supported client, or an explicit supported-version/floor decision before release. No such version-policy decision has been made by this plan.

Cover every top-level collection actually synchronized: goals, tasks, clients, users, teams, goal templates, and legacy KPI rows where a delete path exists. Nested deletes travel in their parent's DTO; database cascades/SET NULL effects invalidate the affected parent. Deletion then recreation of an ID, same-timestamp mutations, duplicate responses, restart, interrupted initial sync, and slow/out-of-order polls have explicit rules and tests. Updates to a deleted object must not recreate it. Pending local mutations cannot resurrect a deletion; a failed pending edit surfaces conflict/not-found and converges with the server.

Proposed marker retention is 30 days; a cursor older than retained history gets `resetRequired` and a coherent full snapshot. No silent gap is permitted. Minimal markers contain entity kind, ID, sequence, and deletion time, not titles, notes, or credentials. Migration/restart/restore tests cover the cursor and retained markers together.

The owning design task compares this proposal with authoritative ID inventories/full-state reconciliation before implementation. The smallest design that satisfies the same correctness and bounded-load tests wins; a tombstone/event framework is not an end in itself. This selection is a bounded technical refinement, not a request to change the product's deletion semantics.

Primary files: `bridge/routes/sync.cjs`, delete routes/migrations, `src/store/bridgeSync.ts`, `src/store/store.ts`, `src/App.tsx`, sync/protocol tests.

## Execution sequence and agents

One implementation task at a time (WIP 1); independent review can run alongside it. The initial queue has two epics:

1. **A — Close authorization/query boundaries and prove cloud sign-in.** Thin existing-flow tracer: an owner and manager use the real session/middleware/user-route/SQLite path and only the owner can change roles. Continue with SQL protection, member task field restrictions, and clean-image SSO. High-risk protections are not held for a later broad refactor.
2. **B — Make accepted mutations durable across clients.** Make goal/task aggregates atomic, then deliver the complete member check-in journey, deletion reconciliation, and final multi-session release evidence. F7 precedes F4 because check-in depends on the transaction/version discipline.

The backlog separates logical dependencies from preferred order. If container/database infrastructure is unavailable, independent ready work can be pulled after recording the gate; missing infrastructure never counts as a passed release check.

| Agent from the requested collection | Role in this plan / execution |
|---|---|
| `gpm/gpm-partner-agent-v2.md` + GPM v2.1 | Planning prompts, domain contracts, dependency and acceptance gates; later execution from accepted task prompts |
| `gpm/backlog-builder-agent-v2.md` + Backlog Builder v5.1 | Two-epic backlog, Gherkin criteria, task sizing, pull gates and handoffs |
| `library/testing-debt-legacy/test-quality-auditor.md` | Check that tests prove persisted behavior and full user journeys; distinguish unit isolation from deliberate integration tests |
| `library/backlog-product/backlog-critic-agent.md` | Fresh second-pass validation of the generated backlog against the core and builder validator |

The framework's model tiers are capability guidance. This planning run uses the available inherited model for each agent; it does not pretend to execute unavailable Claude models. Later routing: strong reasoning for security/protocol choices, execution-focused agents for accepted tasks, and independent review for acceptance.

## Validation and release gates

Each finding has a failing regression first, a permitted-path control, and assertions on resulting stored state. Existing unit/API/contract suites remain in place. Target at least 80% coverage of new logic where coverage is measured; it does not replace the scenario evidence. Add only the scoped instrumentation needed to measure changed behavior.

Proposed test acceptance thresholds (not measured production SLOs):

- Authorization: zero forbidden writes across the case matrix; no credentials/SQL/notes in rejection logs.
- Check-in: one value/history result per operation ID after response loss and retry; observer converges within 10 seconds with the existing 5-second polling interval in an isolated two-session test.
- Deletion: observer converges within 10 seconds under the same conditions; resync restores correctness after retention expiry.
- Local SQLite mutation endpoints: no partial writes under injected failures; proposed p95 under 250 ms across 100 requests against a stated 1,000-goal/1,000-task fixture on the validation runner. Record runner characteristics; refine this performance target before a commitment if baseline disproves it.
- SQL: positive corpus works through both real drivers; prohibited writes never change disposable fixture tables; existing 15-second database timeout/cancellation protections remain effective.

Global commands from `broadcastokr/`: `npm run lint`, `npm test`, `npm run test:bridge`, `npm run build`; edition/protocol/agent packaging checks relevant to each change. CI uses the isolated bridge test entrypoint. Browser checks use isolated state and test identities, not the user's current rig. The Windows permission test remains visible; Linux CI must pass it. Container checks build and run fresh client/cockpit images with no host dependency mount and gate both PR validation and publication.

Each epic produces a short runbook section (symptoms, safe diagnostics, expected logs, containment/recovery), contract snapshots, and an evidence table with commit, command, platform, pass/fail, and artifact location. No external messages, commits, merges, releases, or deployments are authorized by this planning request.

## Risks, rollout, and decisions

| Risk / unknown | Planning treatment | Recheck gate |
|---|---|---|
| Docker runner or Oracle test environment may be unavailable | Availability is unverified in this turn; use CI/disposable test services or the existing rig only after appropriate execution authorization; keep real-driver/image gates outstanding | Before A SQL/image acceptance |
| SQL-aware validator may reject valid templates | Repository SQL corpus and both dialects are acceptance input; narrow unsupported syntax fails with an actionable message | Before parser selection and integration |
| A read-only account can still execute granted functions with side effects | Review granted capabilities; document the supported read-only envelope; do not claim a universal sandbox | A SQL security review |
| New check-in semantics meet old full-goal writers | Explicit compatibility matrix and minimum-safe-client decision; no silent floor change | Before C6 implementation |
| Sync protocol/cursor expands beyond one task | Design contract first, then cohesive backend/frontend tasks; max three complex modules per task; alternative inventory design remains eligible | Before C7 implementation |
| New history for idempotency/deletion | Proposed 24-hour/30-day retention with reset/replay limits, minimal metadata, synthetic fixtures, and tested pruning | Migration acceptance |
| Rollback reopens a vulnerability or destroys post-upgrade data | Security controls stay enabled; disable the affected operation or use a patched build. Keep additive schema on binary rollback. Snapshot restore is an operator recovery action with an explicit data-loss window, not automatic down-migration | Every release gate |

All seven findings are scheduled for remediation; none is accepted as a permanent residual. Wider security/compliance certification is outside this plan. Routine technical refinements are resolved and recorded inside the owning task; a change to role policy, historical-data retention commitments, or the supported-client window is surfaced before dependent implementation.

## Planning artifacts

- `backlog.md`: the Backlog Builder's executable queue and finding-to-story mapping.
- `prompts.md`: GPM kickoff/first-task prompts and continuation instructions.
- `validation.md`: independent backlog validation; distinguishes plan readiness from implementation/release acceptance.

Start with the first READY task in `backlog.md`; verify the baseline and its pull gate before editing code. This document is the solution-design input, not authorization to begin implementation.
