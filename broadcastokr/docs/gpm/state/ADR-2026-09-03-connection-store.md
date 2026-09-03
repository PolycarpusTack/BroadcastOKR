# ADR — Connection store (D-3 / ST0) · 2026-09-03

**Status:** accepted (Yannick, 2026-09-03 evening, in conversation). Closes the
D-3 ST0 decision spike and R6 item 4 (KPI-vs-LiveKR consolidation).

## Context

WHATS'ON connections and Dashboard KPI definitions lived in `bridge/config.json`,
outside SQLite: no migrations, no version column, no tenant scoping, and a backup
that had to copy a second file next to the database snapshot to be complete.
R1 findings 27 and 29 were symptoms. `DELETE /api/connections/:id` performed no
referential check, so a client's `connectionId` and every live KR's
`liveConfig.connectionId` dangled until the next sync said "Connection not found".

`DECISIONS-2026-09-03.md` took the top-level decision: connections move into the
tenant SQLite database. Two sub-decisions were left to this ADR.

## Decisions

1. **Store.** Migration `007-connection-store.sql` adds three additive tables:
   `connections` (one column per `DBConnection` field, password column holds the
   `enc:v1:` ciphertext exactly as the JSON did), `kpi_definitions`, and
   `bridge_settings` (key/value; today only `poll_interval_ms` and the import
   marker). No DROP, no RENAME — FF-6 is untouched and `MIN_SUPPORTED` does not
   move. The store keeps the `createConfigStore` interface (`loadConfig`,
   `saveConfig`, `loadHistory`, `saveHistory`), so `routes/whatson.cjs`,
   `utils/credentials.cjs` and the sync loop are unchanged in shape.

2. **Delete semantics: refuse while referenced.** Deleting a connection that a
   client, a live KR, or a KPI definition still names answers
   `409 {error: 'connection_in_use', detail, clients[], keyResults[], kpiDefinitions[]}`
   and changes nothing. The operator rebinds first (`updateClient` already rebinds
   live KRs when a client's connection changes). The alternative — a forced
   delete that marks KRs `disconnected` — adds a sync status, UI states, and a
   step a restore cannot undo, for a case (a decommissioned database) that the
   refuse-and-rebind path also covers. `POST /api/config` with a connection list
   that drops a referenced connection is refused the same way.

3. **`kpiDefinitions` move with the connections.** Same weakness, same fix, one
   migration. `kpi-history.json` stays a file: it is regenerable from the next
   poll and is not tenant data.

4. **Tenancy shape.** One SQLite database per instance *is* the tenant boundary
   (a client instance is pinned to one client row; the cockpit is Mediagenix's
   own instance). The connection rows therefore carry no `client_id`: a
   connection belongs to the instance whose database holds it, and two
   instances that happened to share a `BRIDGE_CONFIG_PATH` can no longer see
   each other's connections. R6-1 (cockpit binds a connection to a client) may
   add a column when it needs one — additively.

5. **One-time import.** On the first start after 007 the bridge imports
   `config.json` from `BRIDGE_CONFIG_PATH` (rows inserted, existing ids win),
   records the outcome in `bridge_settings.legacy_config_imported`, and renames
   the file to `config.json.migrated` — left in place as the operator's backup
   for one release. `BRIDGE_CONFIG_IMPORT=dry-run` prints what would be
   imported and writes nothing. The D-2 rewrap runs after the import, so a
   pre-marker password is sealed in the same start; nothing plaintext is moved
   without being encrypted when a key is configured.

6. **Backups.** The scheduler snapshots the database only; the connections are
   inside it. The `.config.json` half of the pair is gone; old pairs still
   restore (drop the `.db` in, start, and the import picks up a `config.json`
   if one is placed at `BRIDGE_CONFIG_PATH`).

## R6 item 4 — KPI vs live KR: name the difference, do not merge

Two subsystems query WHATS'ON: **Dashboard KPIs** (`kpi_definitions`, polled by
`GET /api/kpi/poll`, history in `kpi-history.json`, shown in the Dashboard's
live panel, no target semantics beyond a number) and **live Key Results**
(`key_results.live_config`, synced by `liveSync.cjs` and `execute-batch`,
history in `kr_history`, progress via `krProgress`, sharable to the cockpit).
They share the connection store, the SELECT-only guard, `executeScalarQuery`
and the preset templates. They differ in *what the number means*: a KPI is an
operational gauge with no owner or period; a KR is a commitment inside a goal.
Merging them would give every gauge a goal or every KR a dashboard tile.
Decision: **keep both, share the store (done here), and name them consistently**
— "Dashboard KPI" in UI and docs, "live KR" for the other. The small end of
consolidation (shared config store) is executed by this story.

## Deliberate v1 boundary — scalar queries (D-7)

Every KR and KPI query returns one scalar per round-trip. A per-channel
breakdown is a query per channel. This is deliberate: the contract keeps the
bridge, the agent and the cockpit payload trivial to reason about. It changes
only if AI-query-to-chart (CLAUDE.md Next steps, item 5) lands in BrOKR.

## Consequences

- `BRIDGE_CONFIG_PATH` stays as the *import source* only; `provision-instance.mjs`
  and `electron/main.cjs` keep setting it so an upgraded install finds its file.
- `bridge/config.json` is no longer read at runtime; the dev tree's copy becomes
  `config.json.migrated` on the first dev start.
- Frontend: `bridgeFetch` must stop treating every 409 as a version conflict —
  only `error: 'version_conflict'` is one.
