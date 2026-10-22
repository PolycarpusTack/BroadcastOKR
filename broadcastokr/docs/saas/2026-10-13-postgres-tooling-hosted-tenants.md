# Idea — PostgreSQL tooling for the tenants Mediagenix hosts

**Status:** idea, not planned. Written 2026-10-13 from the Calcar unlock review
(`C:\whatsOn\ideas\unlock\calcar.html`), where four repos turned out to fit BrOKR's
questions better than Calcar's. **Owner:** Yannick.
**Owner input (2026-10-13):** in Mediagenix's cloud only PostgreSQL databases run, and
Mediagenix hosts them. So every cloud tenant can use PostgreSQL-only tools, and
server-side tools are possible there.
**Question:** which of PoWA, pgbadger, pghero and pm4py add something to the cockpit
and the usage-metrics work, and in what shape?

## Short answer

- **PoWA is the main one, for hosted tenants.** It gives per-tenant query history,
  the filters the workload really uses, and index suggestions tested with hypothetical
  indexes. It is a hosting-operations tool. BrOKR reads its numbers; it does not
  embed it.
- **pghero:** take its health-check SELECTs as presets; don't run the app.
- **pgbadger:** reports from the server logs, for incidents and weekly reviews on
  hosted tenants. It overlaps PoWA; second priority.
- **pm4py:** one-off process-mining studies on usage and status logs. It is not a
  cockpit feature, and it is AGPL.
- On-premise tenants (Oracle or PostgreSQL, a read-only account) keep the SELECT-only
  presets. Nothing below changes that model.

## The tools

| Tool | What it does | Where it runs | Shape in BrOKR | Licence |
|---|---|---|---|---|
| [PoWA](https://github.com/powa-team/powa) (+ archivist, collector) | Snapshots of `pg_stat_statements`, `pg_qualstats`, `pg_stat_kcache` (and optionally `pg_wait_sampling`) into a repository database; web UI; index advice with HypoPG | Extensions on each tenant server; one central repository; `powa-collector` snapshots remote servers listed in `powa_servers` | A connector agent pointed at the repository pushes per-tenant scalars | PostgreSQL |
| [pghero](https://github.com/ankane/pghero) | Dashboard with health checks: cache hit rate, unused/duplicate indexes, bloat, long-running queries, slow statements | Any server | Its checks as preset SELECTs, dialect-filtered | MIT |
| [pgbadger](https://github.com/darold/pgbadger) | HTML/JSON report from PostgreSQL logs: slowest and most frequent queries, locks, temp files, checkpoints, autovacuum, errors | Needs the server's log files | Not in the cockpit; ops report per tenant | PostgreSQL |
| [pm4py](https://github.com/process-intelligence-solutions/pm4py) | Process mining: flows, rework loops and waiting time from event logs | Python, offline | The resulting numbers (cycle time, rework rate) as live KRs written in SQL | AGPL-3.0 |

Repo check 2026-10-13: all four active, none archived. pg_qualstats, pg_stat_kcache and
HypoPG show no SPDX id on GitHub; their licence files are PostgreSQL-style.

## PoWA, in more detail

**Why it fits once we host.** The blocker was installing extensions on a client's
server. On our own servers it is a configuration choice:
- `shared_preload_libraries` gets `pg_stat_statements`, `pg_qualstats` and
  `pg_stat_kcache`, which takes a restart;
- HypoPG goes in with `CREATE EXTENSION`.

**What it adds** over a SELECT on `pg_stat_statements`:
- **History.** The raw view is cumulative since the last reset; PoWA keeps snapshots over time.
- **The filters each statement uses** (`pg_qualstats`).
- **CPU and disk reads per statement** (`pg_stat_kcache`).
- **Index suggestions from the real workload**, checked with hypothetical indexes before
  anyone creates one.

**One repository for the whole fleet.** `powa-collector` works in remote mode: one
repository database snapshots every tenant server. That is the cross-tenant view the
cockpit has for KRs, but for database health.

**Overhead.** `pg_qualstats` samples by default: `sample_rate` -1 means
1/`max_connections` of the queries. The snapshots need repository storage and a
retention setting. Measure both on the rig before production.

**The data-protection catch.**
- `pg_qualstats.track_constants` is **on** by default. It keeps each constant value
  individually and stores example query texts, so client business values (titles,
  names, contract numbers in a WHERE) land in the repository.
- A fleet-wide repository holding them would undo two choices for tenant data:
  - schema-per-tenant isolation, chosen to avoid cross-tenant leakage of
    commercially sensitive data (`2026-06-01-saas-migration-plan.md`, ADR-005);
  - FF-4: only values and ids leave a tenant.
- Options, in order of preference:
  1. `track_constants = off` and no example queries. The statement shapes remain
     (WHATS'ON sends parameterised SQL, `$1 …`).
  2. One repository per tenant, inside its dedicated data plane
     (`2026-08-31-two-edition-amendment.md`). The fleet view then comes from the
     scalars BrOKR pulls.
  3. A fleet repository with constants on, only with a DPA clause and restricted
     access. Not recommended.

**How BrOKR uses it.**
- A connector agent with SELECT-only rights on the repository pushes numbers per tenant:
  - statements over 1 s per day;
  - the mean time of the ten heaviest statements;
  - the cache hit rate;
  - the number of index suggestions open.
- These are ordinary live KRs on the fleet board ("platform health" next to the
  usage metrics' "Platform" group in `usage-spike/metrics.py`).
- No SQL text crosses the tenant boundary.

## A link with Calcar (unverified)

Calcar's screen atlas records, for every traced action on the demo image, each SQL
statement with its Smalltalk caller. Since 2026-10-13, `python atlas.py repeats` lists
the statements one action runs many times (N+1 leads), in
`C:\whatsOn\guide-capture-data\atlas\REPEATS.md`. Examples:
- one `WONDAYSCHEDULE` SELECT 1,400 times in "Enter announced time and PDC";
- product parts loaded one by one when paging the transmission plan.

Both sides keep `$1` placeholders:
- WHATS'ON sends its SQL parameterised;
- `pg_stat_statements` normalises constants the same way.

**So a heavy statement in a hosted tenant's PoWA could be matched by text to the screen,
action and Smalltalk method in the atlas.** That gives production weight to the
demo-data findings, and a code location to production hot spots. Not tested: the texts
may differ in whitespace or casing, and the atlas covers base-2026r7 only.

## pgbadger, pghero and pm4py

- **pgbadger.** On hosted servers we have the logs.
  - It needs logging settings: `log_min_duration_statement` (e.g. 250 ms), a parseable
    `log_line_prefix`, `log_lock_waits`, `log_temp_files`, `log_autovacuum_min_duration`.
    Incremental mode suits a weekly report per tenant.
  - It shows what PoWA does not: locks, errors, checkpoints, autovacuum.
  - The same data-class care applies: logged statements can carry bind values.
- **pghero.** Its checks are SELECTs on the statistics views. They are candidates for
  the PostgreSQL presets (`GET /api/kpi/templates`) on hosted and on-premise
  PostgreSQL alike.
  - The reader account needs `pg_read_all_stats` for other sessions' statistics.
  - Note: `bridge/whatson/core.cjs` turns NULL into 0 (usage spike finding). A check
    whose extension is missing must stay "no data", not 0.
- **pm4py.** The usage spike found real event logs:
  - `T3TMETRIC` has one row per save, with session, timestamp and the tables touched;
  - 13 status logs (`PSIPRDSTATLOG`, `CM2CONTRACTSTATUSLOG`, `WONDAYSTATUSLOGENTRY` and
    others).

  They hold what process mining needs: a case, an activity and a timestamp. pm4py would
  show how products and contracts really move through their statuses.
  - It needs event rows, not scalars, so it is a study on one tenant's data with
    consent, not a cockpit feature.
  - Pseudonymise `T3TMETRIC`'s user names first.
  - Hosting the database does not settle consent. Analysing a client's usage for
    Mediagenix's own purposes is a separate purpose from hosting it.
  - AGPL: internal analysis only, never shipped in the SaaS cockpit.
  - What survives into the cockpit is the numbers (median cycle time, rework rate),
    which plain SQL with window functions can usually compute.

## Open questions

1. Self-managed PostgreSQL or a managed service? Managed services do not offer every
   extension. Check `pg_qualstats`, `pg_stat_kcache` and HypoPG against the provider's
   list before planning PoWA. Self-managed has no such limit.
2. Who owns hosting operations? PoWA and pgbadger belong to them, not to the BrOKR team.
3. Does the hosting contract or DPA cover performance telemetry and its retention?
4. PostgreSQL version of the hosted tenants (the local rig runs 17).

## If picked up — first step

On a local PostgreSQL 17 with a WHATS'ON schema (the `wonpoc` rig on :5433, or a
container if the extensions don't build on Windows):
1. Install `pg_stat_statements`, `pg_qualstats` (with `track_constants = off`) and HypoPG.
2. Drive one Calcar course or a few atlas actions against it.
3. Look at what PoWA shows.
4. Try the text match with Calcar's `REPEATS.md` on the same statements.
