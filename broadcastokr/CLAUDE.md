# BroadcastOKR

## Project Overview
Broadcast Operations OKR Management Platform for VRT/Mediagenix WHATS'ON (PSI) environment. Manages Goals (OKRs), Tasks, KPIs, and Live database-backed Key Results via a bridge service. Multi-client architecture with goal templates materialized per client, historical KR tracking with check-in confidence/notes, monitoring mode, and three-view reporting.

## Tech Stack
- **Frontend**: React 19, TypeScript 5.9, Vite 7, Zustand 5, React Router 7 (HashRouter for Electron)
- **Desktop**: Electron 41 + electron-builder
- **Bridge**: Express.js on port 3001 (binds 127.0.0.1 by default; `BRIDGE_HOST=0.0.0.0` to expose — Docker sets it) — read-only Oracle/PostgreSQL proxy + SQLite CRUD/sync layer
- **DB Drivers**: `oracledb` (optional), `pg` (optional) — loaded at runtime
- **Testing**: Vitest + React Testing Library

## Architecture
- `src/` — React app (pages, components, hooks, store, utils, types, constants, styles)
- `bridge/` — Express bridge server (`server.cjs`, `broadcastokr.db` incl. the `connections`/`kpi_definitions` tables, `kpi-history.json`)
- `electron/` — Electron main process (`main.cjs`) + preload (`preload.cjs`)
- Single `useBridge()` hook in `App.tsx` owns all bridge state; props drilled to pages
- Zustand single store with `persist` middleware (localStorage) for goals, tasks, kpis, clients, goalTemplates
- 4 React contexts: AuthContext (roles/permissions), ThemeContext (dark/light), ToastContext, ActivityLogContext

## Pages & Routes
| Route | Page | Purpose |
|-------|------|---------|
| `/dashboard` | DashboardPage | Stats overview, channel health, urgent tasks, live KPI panel |
| `/goals` | GoalsPage | Goal CRUD, KR check-ins, live sync, templates, monitoring |
| `/tasks` | TasksPage | Kanban board (backlog→todo→in_progress→review→done) |
| `/team` | TeamPage | Team members and responsibilities |
| `/reports` | ReportsPage | Tasks tab (stats/compliance) + Client Goals tab (3 report views) |
| `/clients` | ClientsPage | Client CRUD, DB connections, channels, monitoring |
| `/compare` | ComparePage | Multi-client goal comparison with batch SQL execution |

## Core Domain Types
```
Goal { id, title, status, progress, owner, channel, period, keyResults[], clientIds[], channelScope, templateId, monitorUntil, archived? }
KeyResult { id, title, start, target, current, progress, status, liveConfig?, syncStatus?, syncError?, lastSyncAt?, krTemplateId?, history? }
LiveKRConfig { connectionId, sql, unit, direction, timeframeDays? }
KRHistoryEntry { timestamp, value, confidence?, note?, actor, source: 'check-in'|'sync' }
Task { id, title, description?, status, priority, assignee, channel, due, taskType, subtasks[], clientIds?, channelScope, goalId? }
Client { id, name, connectionId, color, tags?, channels[], sqlOverrides?, monitorUntil? }
GoalTemplate { id, title, category, period, syncIntervalMs?, krTemplates[] }
KRTemplate { id, title, sql, unit, direction, start, target, timeframeDays? }
KPI { name, unit, direction, target, current, trend[] }
```

## Store Actions (src/store/store.ts)
**Goals**: addGoal, setGoals, updateGoal, deleteGoal, checkInKR (with history), setMonitor (goal/client), setPeriodArchived (R6-5: archive/restore every goal of a period)
**Live Sync**: syncLiveKR, syncLiveKRError, syncLiveKRBatch (monitoring-aware history)
**Tasks**: addTask, setTasks, moveTask, toggleSubtask, addBulkTasks, updateTask, deleteTask
**KPIs**: setKPIs
**Clients**: addClient, updateClient (rebinds live KRs on connection change), deleteClient (cascade option)
**Templates**: addGoalTemplate, updateGoalTemplate, deleteGoalTemplate, materializeTemplate, syncTemplateToGoals (full field propagation)

## Key Patterns
- `structuredClone` for immutable state updates in all store actions
- `goalStatus()` is the single source of truth in `src/utils/colors.ts` (thresholds: >=70% on_track, >=40% at_risk, <40% behind)
- `krProgress()` in `src/utils/progress.ts` is the single source of truth for KR progress — direction-aware (wrong-direction movement clamps to 0, works for lower-is-better KRs) and supports hold-the-line KRs (start === target → 1 only while current holds target)
- `recalcGoal()` helper for DRY progress recalculation from KRs
- Live KR toggle: presence/absence of `liveConfig` on a KeyResult (no separate boolean)
- KR history capped at 100 entries per KR, pruned to 75 via `pruneHistory()` in `src/utils/history.ts`
- Monitoring mode: `monitorUntil` on Goal/Client — when active, every sync writes history entry
- Template materialization: one goal per client, SQL overrides per KR template per client
- Live-KR query entry has three paths that all end in the same editable textarea: a preset (`GET /api/kpi/templates`, filtered by the connection's dialect), the guided builder (`QueryBuilder` → `buildKRQuery`), or hand-written SQL. The AI-assist layer is a decision spike (`docs/saas/2026-09-03-query-assist-spike.md`), not built
- `syncTemplateToGoals` propagates title, start, target, sql, unit, direction, timeframeDays, connectionId
- `updateClient` with connection change rebinds all live KRs and resets syncStatus to 'pending'
- KR edit matching by `kr.id` (not index) to preserve history during reorder/delete
- localStorage quota-exceeded handler: catches QuotaExceededError, dispatches custom event, App.tsx shows toast
- All bridge API calls go through `apiFetch()` in `useBridge.ts`
- **Path shape is a security boundary.** Every path-keyed middleware compares against `canonicalPath(req.path)` (`bridge/middleware/auth.cjs`: lowercase, trailing slashes stripped) and every router comes from `bridge/utils/router.cjs` (strict, case-sensitive). Never compare `req.path` to a literal or a `$`-anchored regex directly — `/API/…` and `…/` used to bypass sign-in and RBAC entirely
- `POST /api/kpi/execute-batch` is `canEdit`, but a non-owner's queries must match the KR's stored `liveConfig` byte-for-byte (`isStoredQuery` in `routes/whatson.cjs`) — only owners run ad hoc SQL. `addGoal`/`updateGoal` return the bridge-write promise so callers sync *after* the write lands
- Credentials: `enc:v1:` marks ciphertext; pre-marker values were written under `BRIDGE_API_KEY`, which `createCredentialCipher` takes as `legacyKey` for the startup rewrap. A value that cannot be read is never rewritten — it is counted as `unreadable`, logged, and exposed on `/api/health` (`credentials.unreadable`) → SystemHealthPanel warning. Desktop key lives in `electron/credentialKey.cjs` (`sealed:`/`plain:` marker; never overwrites an unreadable file)
- Oracle `:named` binds auto-converted to PostgreSQL `$1` positional via `convertBinds()`
- **Licence tiers** (R3, `docs/gpm/state/r3-backlog-2026-09-04.md`): `bridge/editions.cjs` reads `BRIDGE_TIER` (starter/pro/enterprise) and `BRIDGE_CAP_{CHANNELS,SEATS,AGENTS}` — client mode only; desktop and cockpit are enterprise. `middleware/entitlements.cjs` refuses gated routes and goal writes carrying live/shared KRs (`403 entitlement`); caps are checked in the clients/users/agents routers (`403 entitlement_cap`); `bridge/entitlements.cjs` computes usage. `src/editions/entitlements.ts` mirrors `TIER_FEATURES` (pinned by `tierMirror.test.ts`); `useDeployment().entitled(feature)` gates the UI. FF-8 = `entitlements.test.cjs`
- **Period archive** (R6-5): `Goal.archived` (migration 010). Active views read through `activeGoals()` in `src/utils/goals.ts`; archived goals are read-only cards, skipped by the bridge sync loop and the share payload, still in Reports. Goals page: Active/Archived filter, owner "Archive period…" / "Restore period…"
- **Fleet board** (R6-2): the share payload carries `krTemplateId` (an id — titles still never leave a tenant; FF-4's sentinel stands) so the cockpit lines the same template KR up across tenants; `shared_metric_history` keeps the newest 100 points per metric (migration 009); labels are the cockpit's own (`fleet_labels`). UI: `FleetBoard` in Compare (default view in cockpit mode; `src/utils/fleetBoard.ts` builds columns/rows), `FleetMetricsPanel` on the Dashboard links to it
- **Operator channel** (R6-1, `docs/gpm/state/r6-backlog-2026-09-03.md` ST0): a client instance provisioned with `BRIDGE_OPERATOR_TOKEN` accepts it in `X-Operator-Token` as an operator principal (`req.user.operator`, client mode only, checked before the dev escape); `OPERATOR_ALLOW` in `middleware/rbac.cjs` is the closed list it may call; audited as `Mediagenix operator`. The cockpit stores each tenant's URL + token (migration 008, ciphertext) and forwards a fixed set of calls — no generic proxy. UI: `TenantModal` (cockpit Clients page, owner) and `AgentsPanel` (both editions), API in `src/utils/cockpitApi.ts`
- **Connection store is the database** (D-3, `docs/gpm/state/ADR-2026-09-03-connection-store.md`): `connections` + `kpi_definitions` + `bridge_settings` tables (migration 007), behind the unchanged `createConfigStore` interface in `bridge/whatson/store.cjs`. `BRIDGE_CONFIG_PATH` is only the one-time import source (`config.json` → rows → renamed `.migrated`; `BRIDGE_CONFIG_IMPORT=dry-run` to preview). Deleting a referenced connection is refused with `409 connection_in_use` (clients, live KRs and Dashboard KPIs named); `bridgeFetch` treats only `error: 'version_conflict'` 409s as CAS conflicts. Backups are the `.db` alone

## Components Structure
```
components/
  layout/     — AppShell, Sidebar, Header
  goals/      — CheckInModal, GoalFormFields, LiveKRConfigPanel (presets · Build it · Write SQL), QueryBuilder (dropdowns → SQL)
  tasks/      — CreateTaskModal, TaskDetailModal, TaskCard
  kpi/        — KPIConfigModal (609 lines, extraction candidate), LiveKPIPanel
  templates/  — TemplateForm, TemplateCard, MaterializeModal
  clients/    — ClientModal
  reports/    — ClientReportView, GoalReportView, KRTemplateReportView,
                HistoryDetail, KRSparkLine, TrendBadge, ConfidenceBadge
  ui/         — Modal, ProgressBar, SparkLine, ChannelBadge, PillBadge, UrgencyBadge, Avatar
  data/       — ImportExportModal
  activity/   — ActivityLog
  dev/        — PersonaPanel (role switcher for testing)
  toast/      — ToastContainer
  help/       — HelpModal (For Dummies user guide incl. Set It Up), DeveloperGuideModal (O'Reilly-style dev guide; linked from HelpModal)
```

## Utilities (src/utils/)
- `colors.ts` — goalStatus, progressColor, statusIcon, kpiStatus, roleColor
- `progress.ts` — krProgress (direction-aware KR progress, single source of truth)
- `queryBuilder.ts` — buildKRQuery: deterministic single-value SELECT (count / percent-where / average, optional condition + last-N-days binds) per dialect; identifiers validated, literals escaped; columnKind classifies browser types
- `history.ts` — pruneHistory (100 cap, prune to 75)
- `reportHelpers.ts` — computeTrend, computePeriodDelta, computeGoalProgressTimeline
- `dates.ts` — daysUntil, getUrgencyBadge, formatTime, formatTimeAgo
- `ids.ts` — nextGoalId, nextTaskId
- `safeGet.ts` — safeUser, safeChannel (null-safe lookups)
- `styles.ts` — cardStyle, selectStyle (theme-aware)
- `importExport.ts` — JSON import/export
- `stressTest.ts` — bulk test data generation

## Bridge API (bridge/server.cjs)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/health` | Status + loaded drivers |
| GET/POST | `/api/config` | Load/save bridge config |
| POST | `/api/test-connection` | Test DB connection |
| POST/GET/DELETE | `/api/connections` | Connection CRUD |
| POST | `/api/tables` | Schema browser |
| POST | `/api/columns` | Column metadata |
| POST | `/api/channels` | Get channels from DB |
| POST | `/api/preview-query` | Execute preview SQL |
| GET/POST/DELETE | `/api/kpis` | KPI definition CRUD |
| POST | `/api/kpi/execute` | Single KPI query |
| GET | `/api/kpi/poll` | Poll all KPIs |
| POST | `/api/kpi/execute-batch` | Batch KR queries |
| GET | `/api/kpi/history/:id` | KPI history |
| GET | `/api/kpi/templates` | KPI SQL templates |
| GET | `/api/sync/state`, `/api/sync/changes?since=` | Full/incremental state for the 5s change poll |
| POST | `/api/sync/migrate-from-local` | Upload local state (auto-run on first connect to an empty bridge) |
| CRUD | `/api/goals` (+`/:id/check-in`), `/api/tasks`, `/api/clients`, `/api/users`, `/api/teams`, `/api/goal-templates` | SQLite-backed entity CRUD (bridge/routes/*.cjs) |
| GET/PUT | `/api/cockpit/tenants` (+`/:clientId`, `/:clientId/status`) | Cockpit tenant registry: instance URL + operator token (encrypted), reachability probe |
| * | `/api/cockpit/tenants/:clientId/{connections,test-connection,binding,channels,agents}` | Operator channel: forwarded to the tenant with its `X-Operator-Token` (bridge/routes/cockpit.cjs) |
| GET/PUT | `/api/cockpit/metrics`, `/api/cockpit/fleet-labels/:key` | Fleet board data (tenants × shared KRs with `krTemplateId`, resolved `label`, last 30 history points) and the cockpit's own column labels (`tpl:<krTemplateId>` / `kr:<tenant>:<krId>`) |
| GET/POST/DELETE | `/api/agents` (+`/enrol-token`, `/:id`) | Connector-agent ops surface (owner); `/api/agent/*` is the machine surface |
| GET | `/api/usage`, `/api/cockpit/usage`, `/api/cockpit/tenants/:clientId/usage` | Licence tier, caps and what the instance holds (R3); the cockpit aggregate is the invoicing input |

All SQL execution is SELECT-only (enforced at bridge level). Check-in semantics: the bridge records history and bumps `updated_at` only — the client owns progress (`krProgress`) and PUTs the recalculated goal. Bridge timestamps are sqlite `datetime('now')` format (UTC, no 'T'); `/api/sync/changes` normalizes the ISO `since` before comparing.

## Auth & Permissions
Frontend-only persona switching (no backend auth). Three roles:
- **Owner**: full CRUD + assign + check-in + status + reports
- **Manager**: create/edit (no delete) + assign + check-in + status + reports
- **Member**: check-in + status only

## Code Conventions
- No default exports except `App.tsx`
- Inline styles (no CSS modules) — theme object passed as prop
- Font families: Space Grotesk (headings), IBM Plex Sans (body), JetBrains Mono (code)
- Brand color: `#3805E3` (use `PRIMARY_COLOR` constant)
- Constants in `src/constants/config.ts`, shared form styles in `src/styles/formStyles.ts`

## Testing
- `npm test` — 309 tests across 61 test files (vitest; not on PATH, use the npm script)
- `npm run test:bridge` — 206 bridge tests (node --test via `bridge/__tests__/run.cjs`, which isolates config/history paths and blanks any dev keys), including `route-contract.test.cjs` which walks every `/api/*` literal in `src/` against the mounted bridge routes — frontend↔bridge path drift fails CI — and `ff9-policy-coverage.test.cjs` (every WHATS'ON-router route has a POLICY entry, and the entry survives the path shapes Express accepts). Expect 205/206 on Windows: `agent.test.cjs` asserts a `0600` identity file
- `npm run lint` — 0 errors, gated in CI
- `better-sqlite3` is native and can only be built for ONE runtime at a time. `npm run rebuild:node` targets system Node (`npm run bridge`, `npm test`); `npm run rebuild:electron` targets Electron (`npm run electron:dev`, packaging). `electron:build*` now force-rebuilds for Electron itself, so packaging is safe from either state — but run `npm run rebuild:node` afterwards to get the dev bridge back. Stop any running bridge/agent first (`scripts/local-rig/start-rig.ps1 -Stop`) — a loaded `better_sqlite3.node` makes the Electron rebuild fail with EPERM. **Do not trust electron-builder's own rebuild step**: on 2026-09-02 it treated a system-Node build as up to date and shipped an installer whose bridge died on `require` (NODE_MODULE_VERSION 127 vs 145)
- `npm run build` — must pass before committing (`tsc -b` catches noUnusedLocals errors that plain `tsc --noEmit` misses)
- Key test files: `store.test.ts` (core actions), `history.test.ts` (checkInKR, setMonitor, monitoring sync), `clients.test.ts` (client CRUD, templates, materialization), `progress.test.ts` (krProgress direction/hold-the-line)

## Build
- `npx vite build` — production web build to `dist/`
- `npm run electron:build` — Electron packaged app
- `npm run bridge` — Start Express bridge on localhost:3001
- `node scripts/build-agent-bundle.mjs` — connector-agent tarball (`dist-agent/`, require graph checked); `node scripts/capture-protocol-fixtures.mjs` — FF-5 verify/capture; `Dockerfile` — instance image (`EDITION`, `MODE` args); `../.github/workflows/release.yml` — one `v*` tag → installers + GHCR images + agent bundle + GitHub Release (R7)

## Current State (2026-09-04)

### What's done
- Full React app with Dashboard, Goals, Tasks, Team, Reports, Clients, Compare pages
- Bridge service with Oracle/PostgreSQL, connection CRUD, schema browser, auth/logging/rate-limit middleware, SQLite-backed CRUD routes + frontend bridgeSync
- Live Key Results: manual/live toggle per KR, SQL editor, batch sync, auto-sync on create/edit, bridge-side sync loop (15 min default, `bridge/liveSync.cjs`; `POST /api/kpi/sync-now` to trigger; progress recomputed client-side in `_mergeChanges`), staleness banner + per-KR stale labels (60 min threshold)
- Multi-client architecture: clients with connections, channels, SQL overrides
- Goal templates: materialization per client, full sync propagation
- KR history tracking: check-in with confidence + notes, monitoring mode per goal/client
- Three-view reporting: By Client, By Goal, By KR Template with sparklines, trends, drill-down
- Direction-aware KR progress (`krProgress()`) incl. lower-is-better and hold-the-line KRs
- Production readiness phases 1–7 complete (see docs/PRODUCTION-READINESS.md) — verdict: production-ready for internal/trusted-network use
- Code-split bundle (1.21MB → 67KB main), 0 npm vulns, Playwright E2E in CI
- localStorage quota-exceeded handler

- 2026-08-31 hardening pass (GPM, `docs/gpm/state/`): goal-template route contract fixed + contract-tested in CI, first-connect migration replaces the data-wipe path, bridge ships in packaged Electron builds (fork from inside app.asar, writable paths → userData), check-in propagation fixed (updated_at bump + ISO-vs-sqlite `since` normalization), bridge-write failures toast, audit 24→0, lint 0 + CI gate, shared live-KR batch builder (`src/utils/liveSync.ts`)

- 2026-09-04 — R6-6: the edition is visible — `src/editions/editionLabel.ts` feeds the sign-in card, the sidebar brand (cockpit in amber, client instances named after their pinned client) and `document.title`
- 2026-09-04 — R3 entitlements: tiers starter/pro/enterprise + caps in the provisioned env, server-side gates (FF-8), usage report and cockpit aggregate, UI degrades per tier. **0.9.2 released by CI alone** (`v0.9.2`: Windows/Linux installers, `ghcr.io/polycarpustack/broadcastokr-instance:0.9.2-{client,cockpit}`, `brokr-agent-0.9.2.tgz`). R7 release engineering: `release.yml` on `v*` tags, instance `Dockerfile`, agent bundle script, FF-5 capture script, desktop update signal (`src/utils/updates.ts`, daily GitHub check, toast + System Health line). R6-5 shipped (period archive) — R6 list complete: no operator action needs curl. R6-3 (TD-2) closed: the three modals remount by key, no `set-state-in-effect` suppressions left. R6-1 exit passed on the rig through the real cockpit UI (findings 35/36 fixed). R6-2 shipped: fleet board in Compare (cockpit), history-lite + template-id alignment + cockpit-side labels. R6 backlog: `docs/gpm/state/r6-backlog-2026-09-03.md`

- 2026-09-03 (late) — R6-1 shipped: operator channel cockpit → tenant (bridge + UI). On the cockpit a client's **Tenant** modal registers the instance, binds/adds/tests its WHATS'ON connection, pulls channels, mints the share token and agent enrolment tokens, lists/revokes agents; the client edition's Settings page gets the same agents panel. Finding 29 closed. R6 backlog: `docs/gpm/state/r6-backlog-2026-09-03.md`

- 2026-09-03 (evening) — D-3 shipped: connections and Dashboard KPI definitions moved from `config.json` into the tenant database (migration 007, additive), one-shot import with `.migrated` rename, refuse-while-referenced delete, backups are the `.db` alone. ADR `docs/gpm/state/ADR-2026-09-03-connection-store.md` also closes R6 item 4 (KPI vs live KR: keep both, share the store, name them apart)

- 2026-09-03 — R1 local validation rig is up (`docs/saas/readiness/r1-findings.md`): real Keycloak OIDC on both instances, real Oracle 19c (WHATS'ON PSI schema, thick driver) + Postgres 17 through the agent on read-only accounts, cockpit channel live. Fixes from the rig: cloud editions call the bridge same-origin (`BRIDGE_URL` defaults to `''` unless desktop), `POST /api/kpi/execute-batch` persists a KR's own result on the bridge (`storedKR` — a user's sync no longer vanishes at the next change poll), session-keyed rate limiter uses `ipKeyGenerator`. Instances start with `node --env-file=<inst>/.env bridge/server.cjs` — the bridge only auto-loads `bridge/.env`

### Next steps
1. Export history to file (if localStorage gets tight)
2. TD-1: bridge writes for setMonitor/toggleSubtask/addBulkTasks (live-KR sync persistence landed 2026-09-03 via execute-batch; see docs/gpm/state/hardening-backlog-2026-08-31.md)
3. Phase 3 offline mutation queue (deferred — server convergence; note: first-connect migration now protects local data)
4. **Deferred to v1.1 — investigate AI assistance for KR querying** (decision 2026-09-03, `docs/gpm/state/DECISIONS-2026-09-03.md`): "model fills the builder" first, bridge-side, opt-in per instance, SELECT-only, preview-gated, scored against a golden set of real questions collected during R1 and the first demos. Design input: `docs/saas/2026-09-03-query-assist-spike.md`
5. (Longer-term, shared suite asset with WHATS'ON Insights) Adopt the ChartConfig/ChartRenderer contract from the Insights prototype (`../whatson-insights.jsx` — chartType/title/insight/xKey/yKey/data/highlights; kept at repo root as a design asset) if AI query → chart ever lands in BrOKR; rewrite to BrOKR conventions, don't merge the prototype
6. **Idea, parked — BrOKR as Mediagenix's own WHATS'ON usage monitor** (`docs/saas/2026-09-04-usage-telemetry-idea.md`): cockpit + fleet board already fit; needs stable template ids across tenants, tenant opt-in, entitlement carve-out, longer cockpit retention; spike = ten real questions checked against the PSI schema on the rig
