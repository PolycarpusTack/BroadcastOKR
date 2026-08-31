# Hardening Backlog — 2026-08-31

Source: current-state evaluation 2026-08-31 (three-agent review + empirical verification).
Mode: **HARDENING** (Core §1) — governance active: TDD order, Two Hats, contract tests, no scope growth.
Framework: Backlog Builder v5.1 + v5.2 extensions (E3 refactoring buckets, E4 execution mode).

## Readiness Decision

**PROCEED.** Input is not a solution design but a verified defect list with file:line evidence — the
Design Quality Gate (BB §5) is satisfied by the evaluation report itself (clarity 3, feasibility 3,
completeness 3 → 9/9). No High risk without mitigation.

## Critical Gaps

None blocking. One decision folded into A-4 (client-authoritative progress vs. duplicating
`krProgress` on the bridge — resolved: client-authoritative, see Assumptions).

## Domain Glossary (delta only)

- **Bridge write** — a fire-and-forget POST/PUT/DELETE from a store action to the bridge SQLite layer.
- **First-connect migration** — pushing existing local (localStorage) state up to an empty bridge DB
  before adopting bridge state as truth.
- **Contract test** — a bridge-side test asserting every `/api/*` path the frontend calls resolves to
  a mounted route.

## Assumptions Ledger

| # | Assumption | Impact | Verified? |
|---|---|---|---|
| 1 | Rename the bridge mount `/api/templates` → `/api/goal-templates` (not the client). Rationale: domain language (entity is GoalTemplate; `/api/kpi/templates` already exists, so bare "templates" is ambiguous). No other consumer of `/api/templates` exists. | High | (verified) grep: only mount site server.cjs:63; templates.cjs router paths are relative |
| 2 | `materialize`/`sync` need **no new server endpoints**: materialization/sync are client-side operations; persist their *outputs* (goals via `POST/PUT /api/goals`, template via `PUT /api/goal-templates/:id`). Phantom calls are removed, not implemented server-side. | High | (verified) sync.cjs + goals.cjs already accept those shapes |
| 3 | `POST /api/sync/migrate-from-local` accepts store-slice payload top-level keys (`users`, `goals`, …) — the in-app migration can call it as-is; only `operations.md`'s manual procedure is wrong. | High | (verified) sync.cjs:103–162 |
| 4 | Client is authoritative for progress semantics (`krProgress()` in `src/utils/progress.ts`). The bridge check-in endpoint stops recomputing progress; the client PUTs the recalculated goal (which bumps `updated_at`, fixing change-poll propagation). | High | (verified) PUT /api/goals/:id bumps updated_at (goals.cjs:150–152); upsertKeyResults writes progress/status |
| 5 | Electron `fork()` of a script inside the packaged app may need asar-unpacking and bridge node_modules resolution — unknown until built. | Med | ASSUMED → A-3 opens with ST0 SPIKE |
| 6 | `npm audit fix` for the 24 vulns stays within semver ranges for runtime deps; majors (if any) are deferred to their own story. | Med | ASSUMED — verified at B-1 execution |

## Backlog

Conventions: branch `hardening/2026-08-31-sync-trust`, commit per story `[type](scope): summary`.
Global DoD every story: `npm test` + `npm run test:bridge` + `npm run build` green; no Two Hats mixing.
Execution: SEQUENTIAL throughout (E4) — every story touches `store.ts`, bridge routes, or CI; write scopes overlap.

---

### EPIC A — Restore trust in the sync layer

- **Objective:** every frontend bridge write lands, propagates, or visibly fails; no data-loss path on connect.
- **Tracer Bullet?:** YES — A-1's contract test is the tracer: it walks the full frontend→bridge surface and turns the whole defect class into a CI failure.
- **Mode:** HARDENING
- **DoD:** (1) contract test green in CI; (2) empty-bridge first connect preserves local data; (3) a check-in on client 1 reaches client 2 via change-poll.
- **Risk:** A-3 packaging unknowns → ST0 spike, timeboxed S.
- **Smoke Test Story:** covered by A-1 contract test + existing Playwright E2E.
- **Runbook:** update `docs/operations.md` migration section in A-2.

#### A-1 — Fix the goal-template route contract; add the frontend↔bridge contract test
- **Persona:** As a team member I want template edits and materialized goals to reach the shared DB so that colleagues see them.
- **Priority:** 5 · **Size:** M · **Hat per sub-task below** · **DoR:** READY
- **AC:**
  - Given the bridge is running, When the store POSTs/PUTs/DELETEs `/api/goal-templates*`, Then the request succeeds (no 404) and the row is in SQLite.
  - Given a template is materialized for N clients, When materialization completes, Then N goals exist in the bridge DB.
  - Given any `/api/*` literal in `src/**`, When the contract test runs, Then it matches a mounted bridge route (else the test fails naming the path).
- **Sub-tasks (E3 buckets):**
  - ST0 (PREPARATORY): none required — mount rename is a config-level change.
  - ST1 (FEATURE): failing contract test `bridge/__tests__/route-contract.test.cjs` — scans `src/` for `/api/…` string literals (normalizing `${…}` to `:param`), asserts each against the mounted route table; must fail on `/api/goal-templates` today.
  - ST2 (FEATURE): mount rename `server.cjs:63` → `/api/goal-templates`; remove phantom `materialize`/`sync` POSTs (`store.ts:518,588`); persist outputs instead (goals POST/PUT, template PUT per Assumption 2). Contract test goes green.
  - ST3 (REFACTORING): cleanup: none expected — justify or do.
- **Pull Gate:** confirm no external consumer of `/api/templates` (Assumption 1). **Unblocks:** A-2.

#### A-2 — Guard `_initFromBridge`: first-connect migration instead of data wipe
- **Persona:** As the app owner I want connecting to an empty bridge to upload my local data, not erase it.
- **Priority:** 5 · **Size:** M · **DoR:** READY
- **AC:**
  - Given local state has goals/tasks and the bridge DB is empty, When the app connects, Then local state is migrated up (`/api/sync/migrate-from-local`) and re-fetched — nothing lost.
  - Given the bridge DB has data, When the app connects, Then bridge state is adopted (current behaviour).
  - Given migration fails, When the app connects, Then local state is left untouched and a toast reports the failure.
  - `docs/operations.md:77–85` manual procedure corrected (payload = state slices, not persist envelope).
- **Sub-tasks:** ST0: none required. ST1: failing tests (store/App connect logic — emptiness detection + migrate call; vitest). ST2: implement guard in `App.tsx` connect effect using existing `migrateFromLocal` (`bridgeSync.ts:101`); fix runbook. ST3: cleanup pass.
- **Pull Gate:** Assumption 3 (payload shape) re-verified against sync.cjs. **Unblocks:** A-3.
- **Note:** this also resolves the FK hazard (fresh DB rejecting `POST /api/goals` on `owner`) — users migrate first inside the transaction (sync.cjs:102).

#### A-3 — Package the bridge into the Electron build
- **Persona:** As an installed-app user I want "Start Bridge Service" to work so that live KRs function outside dev.
- **Priority:** 4 · **Size:** M · **Confidence: Low → ST0 SPIKE (E2)** · **DoR:** READY
- **AC:** Given a packaged Linux build, When the app starts the bridge, Then `/api/health` responds on 3001.
- **Sub-tasks:**
  - ST0 (SPIKE, timebox S): Question — can `fork(bridge/server.cjs)` run from the packaged layout (asar, native modules better-sqlite3, bridge deps)? Kill condition: fork fundamentally can't resolve native deps from the packaged app → re-scope to spawning an external bridge install.
  - ST1: add `bridge/**` (+ any asarUnpack the spike dictates) to `build.files` (`package.json:31–36`); verify per AC with `electron:build:linux`.
  - ST2 (REFACTORING): none expected.
- **Pull Gate:** A-1/A-2 merged (bridge code final before packaging). **Unblocks:** A-4.

#### A-4 — Check-in parity: one progress semantics, propagation restored
- **Persona:** As a team member I want my check-in visible to others within one poll cycle with correct progress.
- **Priority:** 5 · **Size:** S · **DoR:** READY
- **AC:**
  - Given a lower-is-better KR, When checked in on client 1, Then client 2's poll shows the same (direction-aware) progress.
  - Given a check-in, Then `goals.updated_at` is bumped so `/api/sync/changes` includes the goal.
- **Sub-tasks:** ST0: none. ST1: failing bridge test (check-in no longer recomputes progress; updated_at bumped) + store test (checkInKR PUTs the recalculated goal). ST2: `goals.cjs:182–190` → keep history insert + prune, drop progress recompute; `store.ts:99–129` checkInKR adds `bridgePut` of the recalculated goal. ST3: cleanup.
- **Pull Gate:** Assumption 4. **Unblocks:** A-5.

#### A-5 — Surface bridge-write failures
- **Persona:** As a user I want to know when my change didn't reach the server.
- **Priority:** 4 · **Size:** S · **DoR:** READY
- **AC:** Given the bridge rejects/misses a write, When it exhausts retries, Then a toast reports "change not saved to server" (debounced); console noise replaced by `logger`.
- **Sub-tasks:** ST0: none — reuse the quota-exceeded custom-event→App.tsx-toast pattern (verified existing). ST1: failing test for a `bridgeWrite()` wrapper dispatching the event on rejection. ST2: wrap the ~20 `.catch(console.error)` call sites in `store.ts`. ST3 (REFACTORING): the wrapper *is* the cleanup — dedupe verbatim `.catch` blocks.
- **Pull Gate:** A-4 merged (call-site set final). **Unblocks:** EPIC B. `END OF STORY SEQUENCE`.

---

### EPIC B — Hygiene: dependencies, CI gate, known small defects

- **Objective:** audit clean, lint gated in CI, the four small verified defects fixed.
- **Tracer Bullet?:** NO · **Mode:** HARDENING
- **DoD:** (1) `npm audit` 0 vulns; (2) `npm run lint` green **and** a CI step; (3) smell-scan HIGH items closed.

#### B-1 — Dependency refresh (S) — `npm audit fix`, align with open Dependabot majors where semver-safe (Assumption 6); full test suite green. **Unblocks:** B-2.
#### B-2 — Lint: fix 17 errors, add CI gate (M) — fix `react-hooks` setState-in-effect/impure-render errors in ClientModal, TeamModal, UserModal, GoalsPage, useBridge, KPIConfigModal + unused vars + triple-slash; add `npm run lint` step to `ci.yml`. Hat: REFACTORING (behaviour preserved; existing tests are the net). **Unblocks:** B-3.
#### B-3 — `/api/test-connection` try/finally (S) — close Oracle conn / end PG client on query failure (`server.cjs:323–344`); bridge test with a throwing driver stub. **Unblocks:** B-4.
#### B-4 — ComparePage fleet-average color (S) — `progressColor(krProgress(krt.start, krt.target, avg))` at `ComparePage.tsx:539`; unit test for the lower-is-better case. **Unblocks:** B-5.
#### B-5 — Extract live-KR batch-query builder (M) — Hat: REFACTORING. Guardrail: characterize first (no direct test exists) — characterization tests for the 4 sites (`GoalsPage.tsx:325,371`, `ComparePage.tsx:176`, `useBridge.ts:179`), then extract `buildLiveKRQueries()` + `mapResultsToKrIds()` into `src/utils/liveSync.ts`; fixes the filtered-array `krIndex` drift by construction. `END OF BACKLOG`.

**Deliberately out of scope** (mention-not-make, per anti-scope-creep): `setMonitor`/`toggleSubtask`/`addBulkTasks` missing bridge writes and live-KR sync persistence → TD-1 below; GoalsPage god-component split; `_mergeChanges` 7× merge dedup; dead code removal (`syncLiveKR`/`syncLiveKRError`, `UrgencyBadge`, `stressTest`); JSON import validation; KPI-vs-LiveKR concept consolidation; bridge `package.json` lockfile. Candidates for the next backlog refinement.

**TD-2: Modals — prop→state reset effects (B-2)** — Artifact: ClientModal, TeamModal, UserModal (`eslint-disable react-hooks/set-state-in-effect` blocks). Type: code debt (deliberate). The reset-on-open effect pattern works but fights the react-hooks v7 compiler rules; the clean fix is remount-by-key from the parent (changes each modal's API). Principal: ~½ day. Interest: three suppression blocks to maintain. Servicing: when any of the three modals is next reworked. Origin: B-2 lint gate, 2026-08-31.

**TD-1: Store — mutations without bridge writes** — Artifact: `store.ts` (`setMonitor`, `toggleSubtask`, `addBulkTasks`, `syncLiveKRBatch` results). Type: architecture debt (deliberate, now visible). Principal: ~½ day. Recurring interest: change-poll can silently revert these fields on multi-client use. Servicing decision: next refinement, after A-5's wrapper makes writes uniform. Origin: pre-existing, surfaced by 2026-08-31 evaluation.

## Validator Summary

Structure ✓ (linear DAG, tracer = A-1 contract test, every story has Pull Gate + Unblocks) ·
Quality ✓ (Hats declared, TDD order via E3 buckets, B-5 characterizes before extracting) ·
Testing ✓ (contract test = the missing fitness function; migrations N/A — no schema change) ·
Risk ✓ (single Low-confidence task has ST0 spike; assumptions ledgered) ·
Operations ✓ (runbook fix in A-2; no user-facing behaviour change → no feature flags; SLOs N/A for local-first desktop tool — accepted) ·
Economics ✓ (11 stories, 2 EPICs — under the ≤25/≤2 cap; no spec longer than its code).
