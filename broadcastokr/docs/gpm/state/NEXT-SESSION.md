# Pickup Prompt — Next Session

## 2026-09-04 — R1 day two (paste this block)

We're continuing BroadcastOKR (app in `broadcastokr/`). R1's local rig is **up and
the 7–14-day clock started 2026-09-03**. Read, in order:
`docs/saas/readiness/r1-findings.md` (29 findings, the R1-5 checklist all ticked,
daily log), `docs/gpm/state/r1-backlog-2026-09-03.md` (R1-6/R1-7 remain), then
`docs/saas/readiness-instructions.md` §R1 (corrected from the rig). `CLAUDE.md` is
current.

**Where we are:** branch `readiness/r1-local-rig`, not yet merged. Day one shipped
three fix-now commits from the rig — rate-limit IPv6 keying, cloud editions calling
the bridge same-origin (the UI could not reach its own bridge before), and
execute-batch persisting a KR's own result (a user's sync vanished at the next
change poll) — plus the runbook corrections. Suites: 255 vitest · 144 bridge (143 on
Windows — the `0600` case) · lint 0 · build green.

**Rig on this PC:** Keycloak 26.0.8 native on **8081** (Docker cannot be installed);
cockpit :3100, tenant0 :3101 started with `node --env-file=local-rig/<inst>/.env
bridge/server.cjs`; Oracle 19c `LOCAL` holds a **real WHATS'ON PSI schema** (agent
reads it via `brokr_reader`); Postgres 17 `brokr_rig` on :5433 with the test schema;
agent `local-agent` every 60 s. `scripts/local-rig/start-rig.ps1` (idempotent,
`-Stop`) is wired to a user Startup-folder shortcut; Oracle services need an elevated
`Start-Service` after a reboot. Users: `owner` (owner), `member` (promoted to
manager on tenant0).

**Today:** (1) daily-log line in `r1-findings.md` — values still arriving, staleness
honest, first backup pair in `local-rig/*/backups/`, `bridge.log` size; (2) merge
`readiness/r1-local-rig` `--no-ff`, push, watch CI; (3) finding 27 (re-testing a
stored connection sends `***`) is the one backlog-high item — small, do it first;
(4) then the parallel work named in the backlog: D-3's decision spike and R6-1
(admin UIs — finding 29 shows why: the client edition cannot bind its own
connection). R1-6 content still needs Mediagenix's real OKRs on the cockpit — that
is Yannick's, not the assistant's.

---

## 2026-09-03 — R1 day one (superseded — kept for context)

We're continuing BroadcastOKR (app in `broadcastokr/`). Today is **R1, the local
validation rig** — the first time the product runs against a real database and a real
IdP. Read, in order: `docs/gpm/state/r1-backlog-2026-09-03.md` (today's plan, stories
R1-0 → R1-7, with what to verify from yesterday's review fixes), then
`docs/saas/readiness-instructions.md` §R1 (the exact commands). Log every discrepancy
in `docs/saas/readiness/r1-findings.md` as it happens. `CLAUDE.md` is current.

**Where we are:** main is `8ca9140` (CI green): the 2026-09-02 data-plane hardening,
the setup wizard, 0.9.0, and the adversarial review's nine findings all merged —
`docs/gpm/state/REVIEW-FINDINGS-2026-09-02.md` has the findings and their commits.
Suites: 252 vitest · 140 bridge (139 on Windows — the `0600` case) · lint 0.
Branch for today: `readiness/r1-local-rig` (already carries the provisioning fix and
these docs). Rig state under `./local-rig/` is gitignored — verify at R1-0.

**Target for the day:** R1-0 through R1-4 — one real login on each instance, one real
number per dialect pushed by the agent. R1-5 (yesterday's fixes exercised through the
real UI) if the afternoon allows. The 7–14-day clock starts the day the agent pushes
its first value; D-3's decision spike and R6-1 (admin UIs) are the parallel work.

**Known before starting:** Docker CLI was not on the assistant shell's PATH last night
— check Docker Desktop first. The provisioning script writes port 3001 / host 0.0.0.0;
set 3100/3101 and 127.0.0.1 by hand in each `.env`. Oracle Instant Client on this PC
has never been exercised by the bridge; Postgres-only is a legitimate day one (R1-4b).
Run `npm run rebuild:node` if the dev bridge complains about the better-sqlite3 ABI.

**Working discipline:** unchanged — GPM, commit per story on the branch, suites +
lint + build green before each commit, findings logged as found, not at the end.

---

## 2026-08-31 pickup (superseded — kept for context)

Paste (or point Claude at) the block below to resume exactly where 2026-08-31 ended.

---

We're continuing BroadcastOKR (repo: this one, app in `broadcastokr/`). Read, in
order: `broadcastokr/docs/gpm/state/mode.md` (execution mode + active roadmap),
`broadcastokr/docs/saas/2026-08-31-readiness-plan.md` (plan of record: "the final
third", closed scope to 95%), and `broadcastokr/docs/saas/readiness-instructions.md`
(per-EPIC runnable instructions). `broadcastokr/CLAUDE.md` is the living architecture
doc and is current.

**Where we are:** All three deployment forms are complete, merged, and CI-green on
main — Desktop (Tier 0), Client Edition (Tier 1: OIDC/PKCE + server sessions,
server-enforced RBAC, provisioning, evidence pack), Internal Cockpit (Tier 2:
connector agent v1, push-only shared-metrics channel behind the FF-4 allowlist
projector, fleet panel). One codebase, three deployment forms, guarded by fitness
functions FF-1..FF-7 in CI plus golden protocol-v1 fixtures (FF-5). Suites at close:
~212 vitest + ~108 bridge + 3 Playwright, lint 0, audit 0. Phase summaries and
backlogs for everything are in `docs/gpm/state/`.

**The active plan is the readiness plan (R1–R7).** R1 is now the LOCAL variant
(rewritten in readiness-instructions.md): everything runs on Yannick's Windows PC —
Keycloak in Docker as the IdP (`scripts/local-rig/keycloak-compose.yml`, realm
pre-imported), his local Oracle + Postgres with the PSI test schemas in
`scripts/local-rig/`, two provisioned instances on ports 3100/3101, and the agent
against a read-only DB account. Only prerequisites: Docker Desktop + local DB
credentials. The corporate Entra tenant is a half-day spot-check (R1b) later, not a
blocker. The code-heavy EPICs can also run in parallel: R3 (entitlements + usage metering,
incl. the FF-8 fitness function), R6 (closed 5-item product list: admin UIs for
tokens/agents, fleet board in the Compare grid, TD-2 modal refactor, KPI-vs-LiveKR
ADR, period archival), and R7 (one-tag release engineering). Ask which to start,
or default to R6-1 (admin UIs) — it unblocks R1's manual steps too.

**Working discipline (proven across four merged plans):** GPM — decompose the EPIC
into a backlog file in `docs/gpm/state/` at kickoff; feature branch per EPIC,
commit per story, tests-first on behavior, all suites + lint + build + edition
sentinel scans green before each commit; merge `--no-ff`, push, watch CI (jobs:
check, e2e, editions client/internal). Check exit codes explicitly — never let a
pipe mask a failure before committing.

**Standing gotchas:** after `npm run electron:build*`, run `npm rebuild
better-sqlite3` or the dev bridge fails on ABI mismatch. The route-contract test
extracts `/api/...` string literals — hoist path prefixes to literals, no inline
ternaries in template paths. Only `src/editions/` reads VITE_EDITION and only
`bridge/editions.cjs` reads BRIDGE_MODE (guardrail-tested). New sensitive routes
must be added to `bridge/middleware/rbac.cjs` POLICY. Migrations are additive
unless marked `-- BREAKING:` with a MIN_SUPPORTED bump. openid-client is ESM —
dynamic import from the CJS bridge; auth tests use
`bridge/__tests__/helpers/mockIdp.cjs`.

**Open decisions parked for Yannick:** delete-on-revoke default for shared cockpit
history (legal), tier/pricing sketch for R3, pen-test vendor for R4, the
SOC2-umbrella statement from Mediagenix for R5.

**Deferred cleanup findings (from the 2026-08-31 closing smell scan — pick up on next
touch of these files):** MEDIUM: scalar-query execution triplicated (server.cjs
executeKrQuery / agent.cjs / whatson.cjs execute-batch — extract
`executeScalarQuery` into whatson/core.cjs); sharePayload.cjs falls back to
"now" for never-synced KRs, structurally defeating cockpit staleness (needs a real
last-change timestamp or a null-timestamp contract change). LOW: getSession's hidden
slide side effect (rename or split; /api/health slides sessions), expired
sessions/enrol-tokens never purged (sweep alongside the backup scheduler), interval
default literal repeated (agent.cjs/liveSync.cjs/server.cjs), agent ingest key list
should be a named contract constant like SHARE_FIELDS, whatson.cjs KPI history cap
magic 100 vs liveSync's named constants.
