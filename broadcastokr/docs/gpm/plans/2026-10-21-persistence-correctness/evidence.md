# Persistence correctness — 2026-10-21

Branch: `fix/persistence-correctness`. Local implementation, not a published release.

## Contracts

- `POST /api/sync/import` is owner-only; the operator channel remains closed to imports.
  One transaction validates and writes selected goals, tasks, clients, templates and dashboard KPI values,
  including children and historical measurements. Accounts, roles, sessions and credentials cannot be imported.
- Append refuses identifier collisions atomically. Replace replaces only explicitly supplied categories;
  the UI selects non-empty file categories. Retained parent ids preserve operational metadata and bump goal/task versions.
  Unknown owners/assignees must be mapped to existing users. A pinned client cannot be replaced by another tenant.
- Licence checks cover templates, live values, sharing and channel caps. KR identifiers cannot be moved between parents.
- Migration 013 stores import receipts. Retries with the same operation id, principal and payload replay the result;
  reuse with changed input returns 409. Receipts are retained for 24 hours and pruned on successful imports.
  The import response contains authoritative state; success is never announced from browser-only writes.
- Replace publishes deletion markers, including the additive `deletions.kpis` field keyed by KPI name.
  Removed goal/template links invalidate their dependent parents so other sessions receive those changes.
- Goal create/edit return explicit success/failure outcomes. Forms wait for acceptance and preserve their input on failure.
  Refused optimistic changes roll back unless a newer edit/poll/conflict has already replaced them. Setup records a goal id only after acceptance.
- SQL NULL and blank scalars are `no_data`, genuine zero is valid, and nonfinite/non-numeric values are errors.
  Named-bind conversion shares the SQL envelope's lexical boundaries; literals, identifiers, comments and casts are preserved.

## Validation

Platform: Windows, Node 22.15. Final local logs are under ignored `broadcastokr/tmp/review-persistence/`
and `broadcastokr/test-results/e2e-final.log` (Playwright clears its output directory when a run starts).

| Check | Result |
|---|---|
| Frontend (`npx vitest run --maxWorkers=2`) | 325/325, 64 files; exit 0 (rerun 2026-10-22 after the review fixes) |
| Bridge (`node bridge/__tests__/run.cjs --test-concurrency=2 'bridge/__tests__/*.test.cjs'`) | 280/281; only the existing Windows POSIX `0600` assertion fails, no cancellations |
| Browser (`npm run test:e2e`, test ports 35173/33091) | 6/6, exit 0; two-context propagation bounded at ten seconds |
| TypeScript + production build, lint, `git diff --check` | Passed; exit 0. Existing lazy Excel import chunk warning remains |
| Edition bundle checks | Desktop, client and internal builds/checks passed |

The Windows permission assertion remains visible and is not waived for Linux CI.
Windows sandboxed runner attempts stalled in child/worker teardown; the successful full frontend
and browser verifications used the approved runner outside that process sandbox. Initial concurrent
frontend runs had timing failures; the fixed cloud-test setup and final bounded-worker run are the acceptance evidence.

New regression coverage includes late-failure rollback, replay and operation conflicts, append collisions,
invalid history/users, owner/operator restrictions, tenant/licence caps, KR ownership, KPI removals,
scalar and bind boundaries, save rollback/conflict outcomes, and real browser persistence/retry/convergence.

The browser convergence test uses two desktop contexts. It does not close authenticated cloud-session gate B-6.
The test harness uses an in-memory SQLite database, isolated config/history/log paths, explicit test auth settings
and the configured web origin/bridge ports. Cloud identity component tests use a fixed build seam instead of
reloading the module graph inside a five-second test deadline.

## Review 2026-10-22

Independent review of the working tree (security boundaries, replay, binds, scalars, save outcomes) found no
authorization or injection issue. Fixed before commit, each with a regression test:

- Dashboard KPI routes still turned SQL NULL into 0 and wrote it to the KPI history; they now use `scalarResult`
  (`dashboard-kpi-nodata.test.cjs`).
- body-parser's 100 KB default refused realistic imports with 413; `/api/sync/import` and
  `/api/sync/migrate-from-local` accept 20 MB, every other route keeps the default (`body-parsers.test.cjs`).
- A create retried after a lost response met its own committed row as `409 duplicate` and reported failure, inviting a
  second goal under a new id; a duplicate on a retry attempt is now success with the server row
  (`createRetryDuplicate.test.ts`).
- A refused edit was not rolled back when an earlier write had bumped the version meanwhile; the rollback compares
  content without `version` and keeps the newer version (`goalSaveResults.test.ts`).

Accepted as known, not fixed here: imported `history[].actor` is free text supplied by the owner; a replace may rewrite
the pinned client's own `connection_id` without an existence check; booleans and dates as KR scalars are now `error`
where they used to coerce to numbers.

## Remaining gates and next actions

1. Real PostgreSQL 17 and Oracle 19c acceptance with disposable, write-capable test schemas, including a granted write function.
   Unit/scanner tests do not establish real-driver enforcement.
2. Fresh client and cockpit container OIDC journeys against a test IdP, then a publication gate in the release workflow.
   No Docker executable was available in this local environment during the review. The existing runtime-import job is not this gate.
3. Two authenticated cloud browser sessions: member check-in and deletions converge within ten seconds.
4. Staging provision/upgrade/failure/restore drill, off-machine backups, key recovery, measured recovery times,
   and completion of the existing hardening/evidence residuals. The historical desktop verdict does not waive them.
5. Validate the usage-metrics Oracle script and semantic meanings on representative approved environments before promoting the spike.

The general offline mutation queue and equivalent save-result UX for other entity forms remain separate work.
No remote deployment, customer-database writes, release tag or publication is part of this patch.
