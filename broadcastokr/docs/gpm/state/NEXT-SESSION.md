# Pickup Prompt — Next Session

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
