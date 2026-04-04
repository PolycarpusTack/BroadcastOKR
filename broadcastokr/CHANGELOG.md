# Changelog

All notable changes to BroadcastOKR will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.0.0] - 2026-04-04

### Added

- **Shared data layer** — SQLite database on bridge server replaces localStorage for multi-user collaboration
- **Bridge authentication** — API key auth on all bridge endpoints
- **Bridge logging** — Request logging with daily rotation (30 day retention)
- **DB credential encryption** — Passwords encrypted at rest with AES-256-GCM
- **Environment configuration** — All bridge settings configurable via .env file
- **Atomic file writes** — Config and history files written atomically to prevent corruption
- **SQL injection protection** — Stacked statement blocking added to SELECT-only guard
- **Frontend resilience** — Retry with exponential backoff, global error handlers, connection status indicator
- **Bridge sync** — Frontend fetches state from bridge on connect, polls for changes every 5 seconds
- **Optimistic updates** — Store mutations update locally first, sync to bridge async
- **Accessibility** — Focus indicators, skip-to-content link, aria-live toasts, WCAG AA contrast
- **Performance** — Zustand useShallow selectors, React.memo on list components, optimized KPI polling
- **Testing** — 46 bridge tests, page smoke tests, CRUD endpoint tests, store sync tests
- **CI/CD** — GitHub Actions pipeline (tsc, vitest, bridge tests, vite build)
- **Docker support** — Dockerfile and docker-compose.yml for bridge deployment
- **Documentation** — README, bridge API docs, operations guide
- **Structured logging** — Frontend logger utility with JSON output
- **Health dashboard** — Extended /api/health with DB stats and uptime
- **ErrorBoundary** — Reload App and Export Data recovery options

### Fixed

- SQL injection bypass via stacked statements in bridge
- Preview endpoint validates user SQL before wrapping
- Electron shell.openExternal now restricted to http/https URLs
- DevTools menu hidden in production builds
- KR matching by ID instead of index (prevents wrong KR updates after reorder)
- checkInKR no longer recalculates progress for live KRs
- updateClient rebinds KRs even when disconnecting (empty connectionId)
- deleteUser reassigns to first remaining user instead of -1 sentinel
- GoalsPage status filter uses computed goalStatus() instead of stale stored status
- TemplateForm and MaterializeModal now close after save/materialize
- Permission checks added to TemplateCard, ClientsPage, ImportExportModal
- CORS 'null' origin removed from defaults
- textFaint color contrast improved for WCAG AA

### Changed

- Bridge binds to 0.0.0.0 by default (was 127.0.0.1) for shared server deployment
- POST /api/config restricted to allowlisted keys only
- KPI poll timeout added (15s, matching batch endpoint)
