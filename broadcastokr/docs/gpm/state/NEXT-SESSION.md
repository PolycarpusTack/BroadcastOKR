# Pickup Prompt — Next Session

## 2026-09-04 (day) — R6 done; next R7 (0.9.2 release cut) then R3 (paste this block)

We're continuing BroadcastOKR (app in `broadcastokr/`). Read, in order:
`docs/gpm/state/r6-backlog-2026-09-03.md` (R6-1..R6-5 all DONE with their decisions),
`docs/gpm/state/DECISIONS-2026-09-03.md` (day-one decisions plus the D-3, R6-1 and R6-2
sub-decisions), `docs/saas/2026-08-31-readiness-plan.md` §R7 and §R3 (what is next),
`docs/saas/readiness/r1-findings.md` (37 findings; 35–37 from last night's rig work; daily
log at the bottom — day 2 line is Yannick's). `CLAUDE.md` is current.

**Where we are:** main is `4ca2635`, CI green (all four jobs). The R6 list is closed:
- **R6-1** operator channel (cockpit → tenant) — bridge `d24a3b0`, UI `73f9de4`, **rig exit
  passed through the real cockpit UI** (finding 35): register, bind, channels, share token,
  enrol an agent from the shown command, revoke. Findings 36 (health table count) and 37
  (re-minting the share token cuts the running channel — now warned in the modal) fixed.
- **R6-2** fleet board (merge `dba61de`): share payload carries `krTemplateId` (id, not
  title — FF-4 stands); cockpit keeps `shared_metric_history` (newest 100), labels columns on
  its own side (`fleet_labels`); Compare opens on the board in cockpit mode.
- **R6-3** TD-2 closed (merge `9232bbe`): modals remount by key, zero
  `set-state-in-effect` suppressions.
- **R6-5** period archive (merge `46dff3c`): `Goal.archived` (migration 010), Active/Archived
  filter, owner Archive/Restore period selects, read-only cards, loop + payload skip archived.
- **FF-1 lesson** (merge `4ca2635`): the R6-2 and R6-3 merges went red on CI — a literal
  `#/compare` href in the runtime-gated `FleetMetricsPanel` reached the client bundle. Any
  fleet route literal must sit behind `FLEET_IN_BUILD` (build-time constant, folded away).
  Run `node scripts/check-edition-bundle.mjs client <dist>` locally before pushing fleet UI.
Suites: 293 vitest · 199 bridge (198 on Windows — the `0600` case) · lint 0 · build green.
Migrations now go to 010.

**Rig (this PC, gitignored `local-rig/`):** running the working tree at each bridge's start
time — cockpit started on the R6-2 merge, tenant0 on the R6-3 merge, so **migration 010 is
not applied on the rig yet**; both `config.json` are `.migrated`; tenant0's `.env` holds
`BRIDGE_OPERATOR_TOKEN` and a re-minted `BRIDGE_SHARE_TOKEN` (channel healthy again since
00:39). Cockpit has tenant0 registered at `http://localhost:3101`; Oracle bound, 4 channels;
throwaway agents revoked. To bring the rig to `4ca2635`: `scripts/local-rig/start-rig.ps1
-Stop`, rebuild both bundles (`VITE_EDITION=internal npx vite build --outDir
local-rig/cockpit/app`, `VITE_EDITION=client … local-rig/tenant0/app`), start again, read
the startup logs. Then look at the fleet board on the cockpit (Compare) — tenant0 pushes every
minute, so the sparkline has points by now; name the column (`tpl:` label) as owner.

**Next — R7, release engineering (M):** 0.9.2 carries D-3, R6-1..R6-5 and three migrations
(007–010); a tagged release is the natural cut. Decompose R7 at kickoff (`r7-backlog-…`):
`release.yml` on `v*` tags (full CI → desktop installers via `electron:build*` with the
better-sqlite3 rebuild order → instance image → agent bundle → GitHub Release with notes),
version on health + in-app + desktop upgrade signal, FF-5 golden fixtures captured at tag
time. Remember the 2026-09-02 gotcha: force the Electron rebuild, never trust electron-builder's
"up to date". Then **R3** entitlements (server-side tiers per instance).

**Parallel:** Yannick installs 0.9.1 on the remote desktop against populated support
databases (its `config.json` becomes the import source under 0.9.2). Watch findings 16 (thin
mode) and 4/15 (channels on a real schema). Yannick logs the day-2 line and checks the
backups directory for the first scheduled `.db` snapshot.

**Gotchas learned last night:** the Bash tool collapses `\` to `\` — use the Edit tool
for source lines that need backslashes (finding 36's `ESCAPE '\'`). Python scripted edits:
`encoding='utf-8'`, detect the file's line ending (`TeamPage.tsx` is LF; most files CRLF),
and remember each `rep()` writes immediately — a later assertion failure leaves earlier
edits applied. PowerShell calls that wait on the rig go to the background past 180 s; read
their output file. Playwright drivers live in the scratchpad and need
`NODE_PATH=<repo>/node_modules`. `react-hooks/set-state-in-effect` is enforced: kick loads
off in a `setTimeout(…, 0)` or `.then`. After a `--no-ff` merge, branch again before the
next story (R6-1 landed as direct commits on main for that reason).

**Working discipline:** unchanged. GPM backlog per EPIC, branch per EPIC, commit per story,
suites + lint + build green before each commit, merge `--no-ff`, push, watch CI.

---

## 2026-09-04 — rig restart on the new main, R6-1 exit on the rig, then R6-2/3/5 (paste this block)

We're continuing BroadcastOKR (app in `broadcastokr/`). Read, in order:
`docs/gpm/state/DECISIONS-2026-09-03.md` (day-one decisions plus the D-3 and R6-1
sub-decisions taken that evening), `docs/gpm/state/ADR-2026-09-03-connection-store.md`
(D-3 ST0 ADR — also closes R6 item 4), `docs/gpm/state/r6-backlog-2026-09-03.md` (R6
backlog; R6-1a/b DONE, ST0 ADR for the operator channel; R6-2/3/5 not started),
`docs/saas/readiness/r1-findings.md` (34 findings; 29 closed by R6-1; daily log at the
bottom). `CLAUDE.md` is current.

**Where we are:** main is `73f9de4` (pushed; check CI first thing). Late on day one, two
EPIC stories shipped:
- **D-3** (merge `e06548b`): connections + Dashboard KPI definitions moved from
  `config.json` into the tenant database (migration 007, additive). One-shot import on
  first start (`config.json` → rows → renamed `.migrated`; `BRIDGE_CONFIG_IMPORT=dry-run`
  previews), refuse-while-referenced delete (`409 connection_in_use`), backups are the
  `.db` alone, `bridgeFetch` treats only `error: 'version_conflict'` 409s as CAS conflicts.
- **R6-1** (`d24a3b0` bridge, `73f9de4` UI — **landed as direct commits on main, not a
  `--no-ff` merge**: the session stayed on main after the D-3 merge; content is complete,
  the branch `feature/d3-connections-in-db` is stale at `833e939` and can be deleted):
  operator channel cockpit → tenant. Client instances get `BRIDGE_OPERATOR_TOKEN`
  (provisioned); the cockpit stores URL + token per tenant (migration 008) and forwards a
  closed list of calls. Cockpit Clients page → **Tenant** button → `TenantModal`
  (register, reachability, share token, bind/add/test connection, channels, agents);
  `AgentsPanel` also on the client edition's Settings page.
Suites: 279 vitest · 192 bridge (191 on Windows — the `0600` case) · lint 0 · build green.

**Rig state to fix first (this PC, gitignored `local-rig/`):** both bridges and the agent
are still running the pre-D-3 code from the Startup shortcut. On the new main: stop the rig
(`scripts/local-rig/start-rig.ps1 -Stop`), add `BRIDGE_OPERATOR_TOKEN=<random hex>` to
`local-rig/tenant0/.env`, start again. First start of each bridge imports its `config.json`
(tenant0 has the two rig connections; the cockpit has whatever was saved there) and
renames it `.migrated` — read both startup logs for the `Imported N connection(s)` line
and `credentials: {unreadable: 0}` on `/api/health`. Then the **R6-1 exit on the rig**: on
the cockpit as owner, Clients → Tenant Zero → Tenant: register `http://localhost:3101` +
the token, expect "Reachable · v0.9.1 · operator token accepted", see the two connections,
bind Oracle, pull channels (finding 4/15 still apply: bare ids on the real schema), mint an
enrol token and enrol a throwaway agent from it, revoke it. No curl anywhere. Findings go in
`r1-findings.md`; Yannick logs the daily line (day 2 = 2026-09-04) and checks the backups
directory for the first scheduled `.db` snapshot.

**Then, on a fresh branch per story family (`feature/r6-2-fleet-board` etc.), commit per
story, `--no-ff` merge, push, watch CI:** R6-2 fleet board in Compare (tenants × KRs with the
sparkline/trend vocabulary, replacing the v1 dashboard panel as primary), R6-3 TD-2 modal
remount-by-key (removing the three lint suppressions), R6-5 period archive. Decompose each
at pull time in `r6-backlog-2026-09-03.md`. After R6: R3 (entitlements), R7 (release
engineering — 0.9.2 carries D-3 + R6-1, so a tagged release is the natural next cut).

**Decisions in force:** connections live in the tenant DB (D-3); delete refuses while
referenced; kpiDefinitions moved, kpi-history.json stays a file; one DB per instance is the
tenant boundary (no `client_id` on connections); operator channel is the cockpit's write
path into a tenant (closed allowlist, audited as `Mediagenix operator`); the client edition
keeps its "contact your Mediagenix operator" message; AI query assist v1.1; Entra (R1b)
parked; Yannick reads the Dashboard himself during the unattended run and consults before
entering real OKRs on the cockpit.

**Parallel:** Yannick installs 0.9.1 on the remote desktop against populated support
databases (0.9.1 predates D-3 — its `config.json` becomes the import source when 0.9.2 is
installed over it). Watch for Oracle thin mode without a client (finding 16) and what
"Refresh from database" returns on a real schema (finding 4).

**Gotchas:** `npm run electron:build` fails with EPERM while the rig runs — `-Stop`, build,
`npm run rebuild:node`, start again. Never name a PowerShell parameter `$args`. Repo files
are CRLF — new files written by tooling arrive LF; normalise before committing. Python
scripted edits must open files with `encoding='utf-8'` (em dashes). Playwright on this PC is
load-sensitive; so is the bridge suite (two spawn-heavy suites printed `not ok` headers under
the full parallel run and pass in isolation — rerun before believing a failure). Only
`src/editions/` reads `VITE_EDITION`. `react-hooks/set-state-in-effect` is enforced: kick
async loads off with a `setTimeout(…, 0)` or `.then`, never call a state-setting function
synchronously in an effect. **After a `--no-ff` merge, check out the feature branch again
before the next story.**

**Working discipline:** unchanged. GPM backlog per EPIC, branch per EPIC, commit per story,
suites + lint + build green before each commit, merge `--no-ff`, push, watch CI.

---

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
