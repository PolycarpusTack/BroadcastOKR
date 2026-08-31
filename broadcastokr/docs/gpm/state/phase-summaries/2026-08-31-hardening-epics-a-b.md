# Phase Summary — Hardening EPICs A + B (2026-08-31)

Branch: `hardening/2026-08-31-sync-trust` (11 commits). All stories of the
2026-08-31 hardening backlog complete.

## Delivered

**EPIC A — sync layer trust:**
- A-1 `ef01f23` — goal-template routes fixed (`/api/goal-templates`), phantom
  materialize/sync endpoints removed in favor of persisting outputs; route
  contract test (`bridge/__tests__/route-contract.test.cjs`) walks every
  frontend `/api/*` literal against mounted routes.
- A-2 `fcd4b7e` + `00b003b` — `performInitialSync`: empty-bridge + non-empty-local
  → migrate up (fixes the connect-time data wipe and the users/owner FK
  hazard); operations.md migration runbook corrected.
- A-3 `9392573` — bridge ships in packaged Electron builds (asar, fork from
  inside archive — verified empirically; unpacked-path resolution does NOT
  work), writable paths env-overridable → userData; Linux icon + deb metadata
  fixed. **Gotcha:** electron-builder rebuilds better-sqlite3 for Electron's
  ABI; run `npm rebuild better-sqlite3` afterwards for the dev bridge.
- A-4 `e882a80` — check-in endpoint records history + bumps `updated_at` only
  (client-authoritative progress via `krProgress`); **found & fixed during the
  story:** `/api/sync/changes` compared sqlite-format `updated_at` against ISO
  `since` byte-wise — same-day changes NEVER propagated. Normalized (minus 1s,
  at-least-once).
- A-5 `a3eeefc` — 23 `.catch(console.error)` → `bridgeWriteFailed` (logger +
  `bridge-write-failed` event → debounced App toast).

**EPIC B — hygiene:**
- B-1 `b39778e` — npm audit 24 → 0 (semver bumps + scoped brace-expansion
  override under minimatch@>=10).
- B-2 `0b605f6` — eslint 17 errors → 0; lint now a CI gate. Six justified
  suppressions of react-hooks v7 compiler rules (see TD-2).
- B-3 `ee6b3e4` — try/finally in /api/test-connection (connection leak).
- B-4 `474ce67` — ComparePage fleet average colored via `krProgress`.
- B-5 `7b9da05` — `src/utils/liveSync.ts` replaces 4 copies of the batch-query
  builder; characterization tests pin the contract (true krIndex).

## Verification state at close
189 vitest (32 files) + 52 bridge tests green; build green; lint 0; audit 0;
AppImage + deb build; packaged bridge serves health and accepts writes.

## Architecture memory updates
- The batch contract lives in `src/utils/liveSync.ts`; results match to KRs by
  krId, positionally re-attached from the query list.
- The bridge stores timestamps as sqlite `datetime('now')` (UTC, no 'T');
  anything comparing frontend ISO strings against them must normalize.
- Packaged Electron: fork bridge from INSIDE app.asar; all writable paths via
  env (`BRIDGE_DB_PATH`, `BRIDGE_CONFIG_PATH`, `BRIDGE_HISTORY_PATH`,
  `BRIDGE_LOG_DIR`).

## Open debt
TD-1 (store mutations without bridge writes: setMonitor, toggleSubtask,
addBulkTasks, live-KR sync results) and TD-2 (modal reset-on-open suppressions)
— see the backlog file. Out-of-scope items listed there remain candidates for
the next refinement.
