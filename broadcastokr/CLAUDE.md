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
- `bridge/` — Express bridge server (`server.cjs`, `config.json`, `kpi-history.json`)
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
Goal { id, title, status, progress, owner, channel, period, keyResults[], clientIds[], channelScope, templateId, monitorUntil }
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
**Goals**: addGoal, setGoals, updateGoal, deleteGoal, checkInKR (with history), setMonitor (goal/client)
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
- `syncTemplateToGoals` propagates title, start, target, sql, unit, direction, timeframeDays, connectionId
- `updateClient` with connection change rebinds all live KRs and resets syncStatus to 'pending'
- KR edit matching by `kr.id` (not index) to preserve history during reorder/delete
- localStorage quota-exceeded handler: catches QuotaExceededError, dispatches custom event, App.tsx shows toast
- All bridge API calls go through `apiFetch()` in `useBridge.ts`
- Oracle `:named` binds auto-converted to PostgreSQL `$1` positional via `convertBinds()`

## Components Structure
```
components/
  layout/     — AppShell, Sidebar, Header
  goals/      — CheckInModal, GoalFormFields
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
- `npm test` — 210 tests across 40 test files (vitest; not on PATH, use the npm script)
- `npm run test:bridge` — 108 bridge tests (node --test), including `route-contract.test.cjs` which walks every `/api/*` literal in `src/` against the mounted bridge routes — frontend↔bridge path drift fails CI
- `npm run lint` — 0 errors, gated in CI
- `better-sqlite3` is native and can only be built for ONE runtime at a time. `npm run rebuild:node` targets system Node (`npm run bridge`, `npm test`); `npm run rebuild:electron` targets Electron (`npm run electron:dev`, packaging). `electron:build*` now force-rebuilds for Electron itself, so packaging is safe from either state — but run `npm run rebuild:node` afterwards to get the dev bridge back. **Do not trust electron-builder's own rebuild step**: on 2026-09-02 it treated a system-Node build as up to date and shipped an installer whose bridge died on `require` (NODE_MODULE_VERSION 127 vs 145)
- `npm run build` — must pass before committing (`tsc -b` catches noUnusedLocals errors that plain `tsc --noEmit` misses)
- Key test files: `store.test.ts` (core actions), `history.test.ts` (checkInKR, setMonitor, monitoring sync), `clients.test.ts` (client CRUD, templates, materialization), `progress.test.ts` (krProgress direction/hold-the-line)

## Build
- `npx vite build` — production web build to `dist/`
- `npm run electron:build` — Electron packaged app
- `npm run bridge` — Start Express bridge on localhost:3001

## Current State (2026-06-04)

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

### Next steps
1. Export history to file (if localStorage gets tight)
2. TD-1: bridge writes for setMonitor/toggleSubtask/addBulkTasks + persisting live-KR sync results (see docs/gpm/state/hardening-backlog-2026-08-31.md)
3. Phase 3 offline mutation queue (deferred — server convergence; note: first-connect migration now protects local data)
4. (Longer-term, shared suite asset with WHATS'ON Insights) Adopt the ChartConfig/ChartRenderer contract from the Insights prototype (`../whatson-insights.jsx` — chartType/title/insight/xKey/yKey/data/highlights; kept at repo root as a design asset) if AI query → chart ever lands in BrOKR; rewrite to BrOKR conventions, don't merge the prototype
