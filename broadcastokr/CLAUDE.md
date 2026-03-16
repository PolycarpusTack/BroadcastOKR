# BroadcastOKR

## Project Overview
Broadcast Operations OKR Management Platform for VRT/Mediagenix WHATS'ON (PSI) environment. Manages Goals (OKRs), Tasks, KPIs, and Live database-backed Key Results via a bridge service.

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

## Key Patterns
- Zustand `persist` middleware with localStorage for goals/tasks/kpis
- `structuredClone` for immutable state updates in store actions
- `goalStatus()` is the single source of truth in `src/utils/colors.ts`
- `recalcGoal()` helper in store for DRY progress recalculation
- All bridge API calls go through `apiFetch()` in `useBridge.ts`
- Oracle `:named` binds auto-converted to PostgreSQL `$1` positional via `convertBinds()`
- Live KR toggle: presence/absence of `liveConfig` on a KeyResult (no separate boolean)
- Constants in `src/constants/config.ts` (PRIMARY_COLOR, BRIDGE_URL, fonts, etc.)
- Shared form styles in `src/styles/formStyles.ts`

## Code Conventions
- No default exports except `App.tsx`
- Inline styles (no CSS modules) — theme object passed as prop
- Font families: Space Grotesk (headings), IBM Plex Sans (body), JetBrains Mono (code)
- Brand color: `#3805E3` (use `PRIMARY_COLOR` constant)
- All SQL execution is SELECT-only (enforced at bridge level)

## Testing
- `npx vitest run` — all tests should pass
- `safeGet.test.ts` may timeout on WSL2 (Vitest worker issue, not a code bug)
- `npx tsc --noEmit` — must compile clean before committing

## Build
- `npx vite build` — production web build to `dist/`
- `npm run electron:build` — Electron packaged app

## Current State (2026-03-13)
All work is **staged but not committed** — git user identity needs configuring first.
Run `git config --global user.email/name` then commit the staged changes.

### What's done
- Full React app with Dashboard, Goals, Tasks, Team, Reports pages
- Bridge service with Oracle/PostgreSQL, connection CRUD, schema browser
- Live Key Results: Manual/Live toggle per KR, SQL editor, batch sync, auto-sync on create/edit
- Tech debt cleanup: deduplicated goalStatus, centralized constants/styles
- End-to-end audit passed with 4 gap fixes (startup retry, stale connections, auto-sync on edit, bridgeRunning reset)

### Next steps
1. Configure git identity and commit staged changes
2. Add tests for syncLiveKR/syncLiveKRBatch store actions
3. Extract SchemaExplorer component from KPIConfigModal (609 lines)
4. Add periodic auto-sync timer for live KRs
5. Code review pass (remaining hardcoded colors/fonts)
