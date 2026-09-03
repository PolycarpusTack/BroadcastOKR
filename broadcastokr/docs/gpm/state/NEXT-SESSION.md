# Pickup Prompt — Next Session

## 2026-09-04 — D-3 then R6-1, with the rig ticking (paste this block)

We're continuing BroadcastOKR (app in `broadcastokr/`). Read, in order:
`docs/gpm/state/DECISIONS-2026-09-03.md` (five decisions taken at the end of day one —
they set today's order), `docs/gpm/state/dataplane-backlog-2026-09-02.md` story **D-3**
(the work), `docs/saas/2026-08-31-readiness-plan.md` §R6 item 1 (what follows it), and
`docs/saas/readiness/r1-findings.md` (34 findings, all fix-now shipped; daily log at the
bottom). `CLAUDE.md` is current.

**Where we are:** main is `850e5c4` (CI green). Day one of R1 shipped eight rig-found fixes
(rate-limit IPv6, same-origin bridge URL, execute-batch persistence, stored-secret
connection test, descriptive connection-test failures, modal focus steal, Postgres schema
case, constraint 400s / Postgres numbers / honest startup lines), the query-assist feature
(presets + guided builder in the live-KR panel; AI layer deferred to v1.1 by decision), and
release **0.9.1** (`installer/BroadcastOKR Setup 0.9.1.exe`, built from `850e5c4`). Suites:
271 vitest · 160 bridge (159 on Windows — the `0600` case) · lint 0 · build green.

**Decisions in force (DECISIONS-2026-09-03.md):** D-3 → connections move into the tenant
SQLite DB; R6-1's connection binding and token minting live on the **cockpit** (Mediagenix
onboards clients); AI query assist is a v1.1 investigation; Entra spot-check (R1b) parked;
Yannick reads the Dashboard himself during the unattended run and consults before entering
real OKRs on the cockpit.

**Today — D-3, then R6-1, on branch `feature/d3-connections-in-db`:**
1. Open by asking Yannick the two sub-decisions D-3's ST0 left open: (a) delete semantics —
   refuse while referenced (recommended) vs forced delete → KRs `disconnected`; (b) move
   `kpiDefinitions` with the connections (recommended), leave `kpi-history.json`. Record the
   answers as the ST0 ADR in `docs/gpm/state/` (it also closes R6 item 4).
2. D-3: migration 007 (additive `connections` table, tenant-scoped), one-time import of
   `config.json` on first start (file left in place, renamed `.migrated`), credential cipher
   on the column, referential check on delete, backups now cover connections, API shapes for
   `/api/connections` unchanged. FF-6 must stay green (additive, no `MIN_SUPPORTED` bump).
3. R6-1 on the cockpit: per client — bind/change connection, mint/re-mint share token, mint
   enrol token, list agents with last-seen, revoke. Exit: no operator action needs curl.
4. Then the rest of R6 (fleet board in Compare, TD-2 modals, period archive), R3, R7.

**Rig on this PC (gitignored `local-rig/`):** Keycloak 26.0.8 native on **8081** (no Docker
here); cockpit :3100, tenant0 :3101, agent `local-agent` every 60 s; Oracle 19c `LOCAL` is a
**real WHATS'ON PSI schema**, Postgres 17 `brokr_rig` :5433 has the test schema. Users
`owner`/`owner`, `member`/`member` (manager on tenant0). `scripts/local-rig/start-rig.ps1`
(idempotent, `-Stop`) runs from a Startup-folder shortcut; Oracle services need an elevated
`Start-Service` after a reboot. Bridges start with `node --env-file=local-rig/<inst>/.env
bridge/server.cjs`. Clock day 1 = 2026-09-03; Yannick logs the daily line.

**Parallel:** Yannick installs 0.9.1 on the remote desktop against populated support
databases — watch for Oracle **thin** mode working without a client (finding 16) and what
"Refresh from database" returns for channels on a real schema (finding 4). Findings from
that go in `r1-findings.md` as usual.

**Gotchas learned today:** `npm run electron:build` fails with EPERM while the rig's
bridges/agent run — `start-rig.ps1 -Stop`, build, `npm run rebuild:node`, start again.
Never name a PowerShell parameter `$args` (finding 34). Repo files are CRLF — match line
endings in scripted edits. Playwright on this PC is load-sensitive: give probes long
timeouts and hard `timeout` wrappers; a hung probe leaves nothing behind, but a busy
machine makes `newPage` take 30 s. Only `src/editions/` reads VITE_EDITION.

**Working discipline:** unchanged — GPM backlog per EPIC, branch per EPIC, commit per story,
suites + lint + build green before each commit, merge `--no-ff`, push, watch CI.

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
