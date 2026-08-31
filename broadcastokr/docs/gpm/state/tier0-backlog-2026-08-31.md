# Tier 0 Backlog — Finish the Desktop Core (2026-08-31)

Decomposition of Tier 0 from `docs/saas/2026-08-31-tiered-development-plan.md`.
Mode: **DELIVERY** (Core §1). Branch `feature/tier0-core`, commit per story, merge `--no-ff`.
Global DoD every story: vitest + bridge tests + lint + build green; Two Hats respected;
TDD order (failing test → simplest pass → cleanup) where behavior changes.

## Readiness Decision

PROCEED — the tiered plan §Tier 0 carries file:line seams from the 2026-08-31 investigations;
no blocking gaps. EPIC = Tier 0 itself; stories below in execution order (Sequential Pull).

## Assumptions Ledger

| # | Assumption | Impact |
|---|---|---|
| 1 | Unified fetch client preserves current per-call behavior via a `retries` option (health checks keep fast-fail, sync writes keep 3× backoff). | Med |
| 2 | Default bind flips to `127.0.0.1`; Docker/compose must set `BRIDGE_HOST=0.0.0.0` explicitly (compose file updated in-story). | Med |
| 3 | Version-checked PUTs: server echoes the new `version`; client applies it via a per-entity serialized write queue to avoid self-races; true conflicts 409 → `_mergeChanges` + toast. | High |
| 4 | Client-edition build excludes fleet chunks at build time (`VITE_EDITION=client`); desktop and internal share the full build. Runtime mode (from `/api/health`) governs behavior; build edition governs bundle contents. | High |
| 5 | With the bridge-side live-KR loop, the frontend auto-sync timer is removed entirely (sync requires the bridge anyway); manual per-page "Sync now" buttons remain. | Med |
| 6 | 500 bodies are genericized for all modes (operators read bridge logs); desktop loses nothing material. | Low |

## Stories (execution order)

**T0-1 — Unify the fetch clients** · Hat REFACTORING · S
`apiFetch` (useBridge.ts) and `bridgeFetch` (bridgeSync.ts) are 90% duplicates. One client in
`bridgeSync.ts` with `{ retries }` option; useBridge callers pass `retries: 0` (behavior
preserved); apiFetch deleted. AC: all suites green, no behavior change. Unblocks T0-6.

**T0-2 — Security quick wins** · Hat FEATURE · S
(a) `BRIDGE_HOST` default → `127.0.0.1` (+ compose/docs updated, Electron unaffected);
(b) `timingSafeEqual` in auth.cjs; (c) DB-side query cancellation: oracledb `callTimeout`,
pg `statement_timeout` at TIMEOUT_MS; (d) 500 bodies genericized (detail logged server-side).
AC: bridge tests green; grep shows no `err.message` in response bodies.

**T0-3 — TD-1 small writes** · Hat FEATURE · S
`setMonitor` PUTs the touched goal/client; `toggleSubtask` PUTs the full task; `addBulkTasks`
POSTs each task. AC: store tests (mocked bridgeSync) assert the calls; TD-1 closed for these.

**T0-4 — Automated backups** · Hat FEATURE · S
`bridge/utils/backup.cjs`: `startBackupScheduler(db, dir, {intervalMs, keep})` using online
`db.backup()`; run at startup + daily; prune to keep=14; `GET /api/sync/backup` serves a fresh
snapshot, not the WAL-hot live file; Electron passes `BRIDGE_BACKUP_DIR`. AC: node:test — backup
file created from a live db, prune works, snapshot endpoint 200s.

**T0-5 — Persistent activity log** · Hat FEATURE · S
Migration 002 `activity_log`; `bridge/routes/activity.cjs` POST + GET (limit/before, prune >90d
on insert); `logAction` fire-and-forgets POST (bridgeWriteFailed pattern); context hydrates from
GET on connect. AC: bridge route tests; context hydrate test; log survives reload when bridge on.

**T0-6 — Version-checked writes (goals + tasks)** · Hat FEATURE · M · Pull gate: T0-1
Migration 003 `version` columns; PUT does CAS (`WHERE id=? AND version=?`), 409 with current row;
success echoes `{ok, version}`; DTOs/sync include `version`; client: per-entity serialized PUT
queue in bridgeSync, applies echoed version, 409 → `_mergeChanges(row)` + `bridge-write-failed`-style
toast ("updated elsewhere — refreshed"). AC: bridge CAS tests (stale version 409s, current
succeeds); store test for version application; conflict toast path unit-tested.

**T0-7 — Tenancy plumbing & gates** · Hat FEATURE · M
`src/editions/entitlements.ts` (single reader of `VITE_EDITION`; FEATURES map; runtime mode
setter fed by health) + `bridge/editions.cjs` (single reader of `BRIDGE_MODE`); health reports
`mode`; gates: Sidebar NAV filter, App route redirects, TemplateCard Materialize button, store
early-returns (`materializeTemplate`, `syncTemplateToGoals`), PersonaPanel `DEV && desktop`;
bridge: client mode rejects 2nd client POST / last-client DELETE (403). AC: FF-3-style test
(client mode 403s; fleet mode 200s); vitest gate tests; desktop behavior unchanged by default.

**T0-8 — No-fork guardrails wave 1** · Hat FEATURE · S · Pull gate: T0-7
FF-2 (ESLint no-restricted-imports: src/utils|types|store cannot import pages/components/editions);
FF-7 (env reads only in editions modules — ESLint for src, fs-walk node:test for bridge; filename
fork ban); CI build matrix `VITE_EDITION={desktop,client,internal}` + FF-1 sentinel scan script
(client dist: zero 'FLEET AVG'/'Materialize'/'/compare'; internal dist: all present). AC: CI green
across matrix; deliberately-broken sentinel check fails locally.

**T0-9 — Extract `bridge/whatson/`** · Hat REFACTORING · M
Pure extraction: pools, sqlSafety (assertSelectOnly), queryRunner (runQuery/convertBinds/buildBinds),
schema, connectionStore (config.json + crypto) → `bridge/whatson/*.cjs`; the 11 WHATS'ON routes →
`routes/whatson.cjs` factory; server.cjs becomes composition root. Pinned by existing 52+ bridge
tests + route-contract test — zero route or behavior change. AC: full bridge suite green, no diff
in route table.

**T0-10 — Bridge-side live-KR sync loop** · Hat FEATURE · L · Pull gates: T0-3, T0-9
`bridge/liveSync.cjs`: `createKRSyncLoop(db, { executeQueries, intervalMs })` — reads live KRs
from SQLite, executes via whatson queryRunner, writes `current_val`/`sync_status`/`last_sync_at`,
bumps goal `updated_at`, inserts `kr_history source='sync'` when goal/client monitor active;
`POST /api/kpi/sync-now` triggers a pass. Frontend: remove auto-timer wiring (Assumption 5);
`_mergeChanges` recomputes KR progress + goal rollup via `krProgress`/`recalcGoal` for incoming
goals. AC: loop tests with injected fake executor (values written, updated_at bumped, monitored
history recorded, errors → sync_status='error'); store test proves merged goals carry recomputed
progress; sync-now endpoint test; App no longer starts the client timer.

## Validator summary

Linear DAG (T0-1→…→T0-10 with stated pull gates) ✓ · hats declared ✓ · tests-first on behavior
changes ✓ · no story spec longer than its code ✓ · migrations additive (002, 003) ✓ ·
rollback: per-story commits on a feature branch ✓.
