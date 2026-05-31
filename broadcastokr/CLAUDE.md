# BroadcastOKR

## Project Overview
Broadcast Operations OKR Management Platform for VRT/Mediagenix WHATS'ON (PSI) environment. Manages Goals (OKRs), Tasks, KPIs, and Live database-backed Key Results via a bridge service. Multi-client architecture with goal templates materialized per client, historical KR tracking with check-in confidence/notes, monitoring mode, and three-view reporting.

## Tech Stack
- **Frontend**: React 19, TypeScript 5.9, Vite 7, Zustand 5, React Router 7 (HashRouter for Electron)
- **Desktop**: Electron 41 + electron-builder
- **Bridge**: Express.js on localhost:3001 — read-only Oracle/PostgreSQL proxy
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
```

## Utilities (src/utils/)
- `colors.ts` — goalStatus, progressColor, statusIcon, kpiStatus, roleColor
- `history.ts` — pruneHistory (100 cap, prune to 75)
- `reportHelpers.ts` — computeTrend, computePeriodDelta, computeGoalProgressTimeline
- `dates.ts` — daysUntil, getUrgencyBadge, formatTime
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

All SQL execution is SELECT-only (enforced at bridge level).

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
- `npx vitest run` — 105 tests across 15 test files
- `npx tsc --noEmit` — must compile clean before committing
- WSL2 worker timeouts affect some test files (safeGet, ids) — environment issue, not code bugs
- Key test files: `store.test.ts` (core actions), `history.test.ts` (checkInKR, setMonitor, monitoring sync), `clients.test.ts` (client CRUD, templates, materialization)

## Build
- `npx vite build` — production web build to `dist/`
- `npm run electron:build` — Electron packaged app
- `npm run bridge` — Start Express bridge on localhost:3001

## Current State (2026-03-18)

### What's done
- Full React app with Dashboard, Goals, Tasks, Team, Reports, Clients, Compare pages
- Bridge service with Oracle/PostgreSQL, connection CRUD, schema browser
- Live Key Results: manual/live toggle per KR, SQL editor, batch sync, auto-sync on create/edit
- Multi-client architecture: clients with connections, channels, SQL overrides
- Goal templates: materialization per client, full sync propagation
- KR history tracking: check-in with confidence + notes, monitoring mode per goal/client
- Three-view reporting: By Client, By Goal, By KR Template with sparklines, trends, drill-down
- Connection rebinding on client connection change
- MaterializeModal blocks clients without connections
- Health checks recompute on client list changes
- localStorage quota-exceeded handler

### Next steps
1. Extract SchemaExplorer component from KPIConfigModal (609 lines)
2. Add periodic auto-sync timer for live KRs
3. Code review pass (remaining hardcoded colors/fonts)
4. Date range filtering on report views
5. Export history to file (if localStorage gets tight)
