# Remediation evidence — 2026-09-07

Branch `fix/review-remediation-a` (Epic A and Epic B, one session). Platform for every row below:
Windows 11, Node 22.15, better-sqlite3 in-memory databases, mock OIDC IdP (`__tests__/helpers/mockIdp.cjs`).
"Bridge suite" = `npm run test:bridge`; the one standing failure on Windows is the documented `0600`
identity-file assertion in `agent.test.cjs` (passes on Linux CI). Spawn-heavy suites occasionally show
`cancelled` under load and pass alone — rerun before believing a cancellation.

| Finding | Fix (commit) | Regression evidence | Permitted-path control | Persisted-state assertion | Status |
|---|---|---|---|---|---|
| F1 role change via `%32` | A-1 `dc921e1` | `review-remediation-a.test.cjs` F1 ×3 (encoded, double-encoded, non-numeric, unknown, case/slash variants) — 3/3 fail on pre-fix code | owner changes role; manager edits profile through the encoded id | role read back after every refusal | **closed locally** |
| F5 member task fields | A-3 `dc921e1` | same file F5 ×5 (12 forbidden edits incl. mixed) — 3/5 fail pre-fix | full-DTO move + subtask tick; restricted body; owner/manager edits | full task DTO equal after every refusal | **closed locally** |
| F2 SQL guard bypass | A-2 `850b40c` | `sql-envelope.test.cjs`: 31 negatives incl. the reported payload on every entry point; fake-driver lifecycle (BEGIN READ ONLY / SET TRANSACTION READ ONLY, rollback, destroy on error) | repository corpus (both dialects), builder shapes, quoting corpus | driver never called for a refused statement | **scanner closed; real-driver acceptance pending** (A-2-T3/T4: PostgreSQL 17 + Oracle 19c on the R1 rig with a disposable write-capable account) |
| F3 image lacks openid-client | A-4-T1 `7e5def2` | `runtime-deps.test.cjs` (4 cases; 2 fail with the manifest entry removed); CI job `bridge-runtime` installs from manifest+lockfile in an empty dir and imports every runtime module | — | — | **dependency closed; image journey pending** (A-4-T2/T3 need Docker + test IdP: login/callback/me/logout/restart, then gate publication) |
| F7 partial aggregate writes | B-1/B-2 `c2f5982` | `review-remediation-b.test.cjs` F7 ×6; `aggregate-atomicity.test.cjs` ×4 injected late failures | valid update commits parent+KRs once; task create with subtasks | full snapshot (goals, KRs, history, tasks, subtasks, operation records) equal before/after each failure | **closed locally** |
| F4 member check-in lost | B-3 `c2f5982` | same file F4 ×5 (attribution, replay, operation conflict, live-KR annotation, invalid input, stale-write no-rollback); `checkInBridge.test.ts` (one command, no PUT, response adopted) | owner sees the member's value without any PUT | history rows counted after replay; value read by another session | **closed locally; two-session browser convergence pending** (B-6) |
| F6 deletions never reach clients | B-4/B-5 (this branch) | `sync-deletions.test.cjs` ×5 (every kind, parent invalidation, delete+recreate, stale update 404, retention reset + prune); `mergeDeletions.test.ts` ×4 | rows still delivered; recreated row wins | tombstone count; sync response shape | **closed locally; 10 s convergence bound pending** (B-6) |

## Suite totals on the branch

| Gate | Result |
|---|---|
| `npm run build` | green |
| `npm run lint` | 0 errors |
| `npm test` (vitest) | 314 / 314 |
| `npm run test:bridge` | 246 / 247 on Windows (the `0600` case; 0 cancelled) |

## Unresolved gates (not passed, not waived)

1. **Real-driver read-only enforcement** (A-2-T3/T4). Needs the R1 rig's PostgreSQL 17 and Oracle 19c
   with a disposable schema and a write-capable test account: run the corpus, then a granted
   `f_write()` function, and prove the read-only transaction refuses the write the scanner cannot see.
2. **Fresh client/cockpit image SSO journey** (A-4-T2) and **publication gate** (A-4-T3). Needs a
   Docker host and a test IdP. Until then a green `bridge-runtime` CI job proves the dependency graph,
   not the sign-in.
3. **Two-session convergence** (B-6-T1): member check-in and a deletion observed from a second
   authenticated browser session within 10 s at the 5 s poll. Needs the A-4-T2 fixture or the rig.
4. **Linux run of the bridge suite** (the `0600` case) — CI on merge.
5. **Performance fixture** (1,000 goals / 1,000 tasks, p95 < 250 ms) — not measured; the transaction
   change adds one read per aggregate write.

## Compatibility notes for release

- App and bridge ship together. Older apps still work (versionless PUTs stay last-write-wins; the
  `deletions` field is ignored) but do not get F4's replay guarantee or F6's removals — minimum safe
  client for those is this build.
- Migrations 011 and 012 are additive; binary rollback keeps the tables.
- Containment per finding is in the ADRs (`ADR-A1`, `ADR-A2`, `ADR-B1-B3`, `ADR-B4`).
