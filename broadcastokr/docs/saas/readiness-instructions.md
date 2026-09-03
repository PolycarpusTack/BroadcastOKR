# Readiness Plan — EPIC Instructions

Executable instructions for the seven EPICs of `2026-08-31-readiness-plan.md`.
Each section: what you need first, the steps in order, and how you know it's done.
File paths are real; commands run from `broadcastokr/` unless noted. Execute an EPIC
as a GPM story sequence (branch `feature/r<N>-<slug>`, commit per step-group,
merge `--no-ff`, suites green before every commit).

---

## R1 — Real-system validation rig (LOCAL variant — Windows PC)

Runs entirely on your machine: local Oracle + Postgres are the real-driver test,
Keycloak (Docker) is the real-OIDC test. The corporate Entra tenant is only a short
spot-check at the end (R1b) — testing stays local.

**You must provide:** Docker Desktop running — or, when Docker cannot be installed
(no admin rights: the case on 2026-09-03), a JDK 17+ on PATH and the Keycloak zip;
your local Oracle and Postgres credentials; Node 22. Nothing corporate.

**Ports on this PC (2026-09-03):** Keycloak **8081** (8080 is taken by an Apache
`httpd`), cockpit 3100, tenant0 3101, Oracle 1521 (service `local`), Postgres 17
on 5433 (`brokr_rig`). Treat the IdP port as a variable: `KC_PORT` below.

**Steps:**
0. **Prerequisites, in the shell you will actually use:** `docker info` succeeds
   (2026-09-02: the CLI was not on the Git-Bash PATH); `node --version` ≥ 22;
   `npm run rebuild:node` if the dev bridge fails on the better-sqlite3 ABI;
   `git check-ignore local-rig` prints the path. Day-by-day plan and the
   "verify last review's fixes on the rig" checklist:
   `docs/gpm/state/r1-backlog-2026-09-03.md`; findings go to
   `docs/saas/readiness/r1-findings.md` as they happen.
1. **IdP:** `docker compose -f scripts/local-rig/keycloak-compose.yml up -d` — a
   Keycloak with realm `brokr` pre-imported: client `brokr-local` (secret
   `brokr-local-dev-secret`, redirect URIs for ports 3100/3101) and users
   `owner`/`owner`, `member`/`member`. Issuer: `http://localhost:<KC_PORT>/realms/brokr`
   (the bridge's `allowInsecure` path accepts http:// issuers for exactly this).
   **Without Docker** (what actually ran): download `keycloak-26.0.x.zip` from the
   GitHub releases into `local-rig/keycloak/`, unzip, copy
   `scripts/local-rig/brokr-realm.json` to `<kc>/data/import/`, then with
   `JAVA_HOME` set and `KC_BOOTSTRAP_ADMIN_USERNAME/PASSWORD=admin`:
   `bin\kc.bat start-dev --import-realm --http-port <KC_PORT>`. Same realm, same
   behaviour; ~30 s to first `/.well-known/openid-configuration`. The compose file
   pins 8080 — change the port mapping if that port is busy.
2. **Test schemas:** load `scripts/local-rig/psi-test-schema.postgres.sql` into your
   Postgres and `psi-test-schema.oracle.sql` into your Oracle (header comments carry
   the exact commands, including creating a **read-only** `brokr_reader` account for
   the agent — use it, that's part of what R1 validates).
   **If your Oracle already holds a real WHATS'ON `PSI` schema** (it did on this PC:
   `LOCAL`, non-CDB), do **not** load the Oracle test schema — it collides on
   `CREATE TABLE PSITRANSMISSION`. Create `brokr_reader` with `CREATE SESSION` and
   `SELECT` on `PSITRANSMISSION`, `PSISCHEDULE`, `PSIMATERIALPART` and run against the
   real data (the better test). Note `PSICHANNEL` does not exist there and dated
   presets return 0 for old data — findings 3–5.
3. **Instances:** provision two —
   `node scripts/provision-instance.mjs --dir ./local-rig/cockpit --name "Mediagenix" --mode cockpit --base-url http://localhost:3100 --oidc-issuer http://localhost:8080/realms/brokr --oidc-client-id brokr-local --oidc-client-secret brokr-local-dev-secret`
   and the same with `--dir ./local-rig/tenant0 --name "Tenant Zero" --mode client --base-url http://localhost:3101`.
   Build the app bundles (`VITE_EDITION=internal npx vite build --outDir local-rig/cockpit/app`,
   `VITE_EDITION=client npx vite build --outDir local-rig/tenant0/app`), set
   `BRIDGE_APP_DIR` to each in the generated `.env`s plus `BRIDGE_PORT=3100`/`3101`,
   `BRIDGE_HOST=127.0.0.1` (the script writes 3001 / 0.0.0.0), and start each bridge
   with **its own env file** — the bridge only auto-loads `bridge/.env`:
   `node --env-file=local-rig/cockpit/.env bridge/server.cjs` (and `tenant0`). A dev
   `bridge/.env` is still merged underneath (dotenv never overrides), so keep it free
   of instance-shaped values. Since 2026-09-02 the script also emits a dedicated
   `BRIDGE_ENCRYPTION_KEY`; read the startup lines **on both stdout and stderr** —
   re-encrypted counts go to stdout, unreadable/unprotected warnings to stderr.
   `scripts/local-rig/start-rig.ps1` does all of this idempotently (and `-Stop`).
4. **Sign in** at http://localhost:3100 and :3101 with `owner` — first sign-in
   becomes instance owner (verify), then `member` (verify member role). Any claim
   mapping fixes go in `upsertSsoUser` (bridge/routes/auth.cjs).
5. **Channel:** on the cockpit create the Tenant Zero client row and mint a share
   token (`POST /api/cockpit/tenants` — curl until R6-1's UI lands); put
   `BRIDGE_COCKPIT_URL=http://localhost:3100` + `BRIDGE_SHARE_TOKEN=<token>` in
   tenant0's `.env`, restart it.
6. **Agent:** mint an enrol token on tenant0 (`POST /api/agents/enrol-token` as
   owner — 15-minute, single-use), then
   `node bridge/agent.cjs enroll --instance http://localhost:3101 --token <T> --name "local-agent" --dir ./local-rig/agent`.
   Edit `local-rig/agent/agent-config.json`: add BOTH local connections (Oracle via
   `brokr_reader`, Postgres) and bindings using the preset queries from
   `bridge/whatson/templates.cjs` (e.g. Transmissions This Month against each DB).
   `node bridge/agent.cjs run --dir ./local-rig/agent`. Bindings are
   `{ krId, connectionId, sql, timeframeDays? }`; the `krId` must already exist on
   the instance (create the goal first — the bridge answers `unknown: [krId]`
   otherwise). Passwords may be plaintext or `enc:v1:` from `encrypt()` with
   `AGENT_DATA_KEY` in the agent's environment. Set `intervalMs` to 60000 for the
   rig so staleness and backups are observable. (Windows note: file-mode 0600 is a
   no-op on NTFS — acceptable locally, noted as a rig limitation.)
7. **Content:** cockpit gets Mediagenix's real OKRs; tenant0 gets goals whose KR ids
   match the agent bindings; flip one KR to Shared. Verify: agent values land on
   tenant0, the shared value appears on the cockpit fleet panel, direction/staleness
   render sanely.
8. **Dogfood 7–14 days** on your PC. Startup: Task Scheduler was denied on the
   corporate PC, so a user Startup-folder shortcut (`shell:startup`) runs
   `scripts/local-rig/start-rig.ps1` hidden at logon; Oracle's Windows services
   still need an elevated `Start-Service` after a reboot. Log every
   mock-vs-real discrepancy in `docs/saas/readiness/r1-findings.md`, triaged
   fix-now / backlog / accepted. Expect the interesting findings in Oracle driver
   behavior and Keycloak claim names.

**R1b — corporate Entra spot-check (half a day, later, before any client demo):**
register one app in Mediagenix's Entra tenant (redirect
`http://localhost:3101/api/auth/callback` works for a spot-check), point tenant0's
OIDC env at it, and verify sign-in, claims (`name`/`email` vs `preferred_username`),
logout, and an MFA-policy login end-to-end. Fixes discovered here are almost always
claim-mapping lines in `upsertSsoUser`.

**Done when:** the 7–14-day local run completes with findings triaged; both DB
dialects exercised through the agent via a read-only account; R1b passes against the
real Entra tenant; the OIDC and agent sections of `docs/operations.md` corrected from
what the rig taught.

## R2 — Fleet operations machinery

**Needs:** the R1 local rig (drills run against it), a container registry. Cloud/VM hosting can come later — the drill mechanics validate locally first.

**Steps:**
1. Make the instance a first-class image: extend `bridge/Dockerfile` (or a new
   `Dockerfile.instance` at repo root) to bundle bridge + the built edition `dist/`;
   `provision-instance.mjs` gains `--emit compose|k8s` writing a per-instance manifest
   that mounts the instance dir and pins the image tag.
2. Write `scripts/upgrade-instance.mjs`: pull new image → run migrations against a
   **copy** of the DB first (abort on failure) → stop → migrate real DB → start →
   poll `/api/health` for mode + protocol → automatic rollback to the previous image
   + the pre-upgrade snapshot on red. Refuse to upgrade across a `MIN_SUPPORTED` bump
   unless `--acknowledge-floor` is passed.
3. Monitoring: stand up a scraper (uptime-kuma is enough at this fleet size) hitting
   each instance's `/api/health`; alert on: instance down, `protocolVersion` mismatch
   after a rollout, backup dir age > 26h, agent `last_seen_at` > 3× its interval
   (expose the latter: add `agents_stale` count to the authenticated health payload).
4. Backup shipping: a cron/systemd timer rsyncing each instance's `backups/` off-machine
   (or to object storage); retention 30 days off-machine.
5. **Run the drill on staging and time it:** upgrade Tenant Zero → deliberately corrupt
   its DB → restore from the latest snapshot → verify data. Write the measured RPO/RTO
   into `docs/operations.md` and the drill transcript into `docs/saas/evidence/`.

**Done when:** provision → upgrade → break → restore executed start-to-finish by
following `docs/operations.md` only, and the alerting fired for each induced failure.

---

## R3 — Entitlements & usage metering

**Needs:** a tier/pricing sketch from you (which features sit in which tier, and the
cap dimensions — seats? channels? agents?). Steps below assume base/pro/enterprise.

**Steps:**
1. Define the tier map in ONE place: extend `bridge/editions.cjs` with
   `TIER = process.env.BRIDGE_TIER || 'enterprise'` (desktop unrestricted) and a
   `TIER_FEATURES` map (e.g. base: manual KRs only; pro: + live KRs + agents;
   enterprise: + sharing channel). Mirror the type into `src/editions/entitlements.ts`
   the way FEATURES already works; equality-test the mirror (pattern:
   `src/editions/__tests__/permissionsMirror.test.ts`).
2. Enforce server-side where each feature enters: live-KR execution
   (`/api/kpi/execute-batch`, the sync loop), agent enrolment (`/api/agents/enrol-token`),
   the sharing flag PUT and push loop. Return `403 {error:'entitlement'}`; the UI reads
   the tier from `/api/health` (add `tier`) and hides gated affordances.
3. Caps: on the capped dimensions, refuse creation past the cap (same 403 shape) —
   count queries live in the relevant routers.
4. Metering: `GET /api/usage` (owner/operator) returning
   `{tier, seats, channels, agents, liveKRs, sharedKRs, period}` computed from the DB;
   the cockpit aggregates its tenants' reports into `GET /api/cockpit/usage`
   (extend `bridge/routes/cockpit.cjs`; tenant instances push usage alongside metrics
   in `bridge/cockpit/pushLoop.cjs` — extend the ingest contract additively and the
   FF-4 allowlist deliberately).
5. FF-8 fitness function: `bridge/__tests__/entitlements.test.cjs` — spawn an instance
   per tier, assert each gated route 403s below its tier and 200s at it (pattern:
   `tenancy-mode.test.cjs`). Add `provision-instance.mjs --tier`.

**Done when:** three staging instances at three tiers behave per the map; FF-8 in CI;
one cockpit usage report contains everything an invoice needs.

---

## R4 — Security hardening residuals

**Needs:** budget/vendor selection for the external pen test (commission at R1 exit —
lead time). Everything else is internal.

**Steps:**
1. Agent channel pinning: add optional `instanceCaFingerprint` to the agent config;
   the agent verifies the TLS cert fingerprint on every push (Node `checkServerIdentity`
   hook in an https agent) — cert-pinning first, full mTLS only if the platform's
   ingress supports client certs cleanly (decide once, record the ADR).
2. Agent key handling: `agent.cjs enroll` generates `AGENT_DATA_KEY` itself, writes it
   0600 next to the identity, loads it automatically (env override remains); add an
   `agent.cjs encrypt-password` helper so operators never store plaintext; document in
   the agent section of `docs/operations.md`.
3. Delete-on-revoke: implement `DELETE /api/cockpit/tenants/:clientId/metrics`
   (owner-only, audited) and a `--purge` flag semantics on unshare; **you decide the
   default** (recommend: retain on unshare, purge on explicit request) — wire it,
   test it, record the decision in the amendment doc.
4. Dependency hygiene: add a scheduled CI workflow (`schedule:` weekly) running
   `npm audit --audit-level=high` as a failing gate + enable Dependabot auto-merge for
   patch/minor on green CI.
5. Pen test: hand the vendor the staging rig + `docs/saas/evidence/` + scope (instances,
   cockpit channel, agent ingest; NOT the WHATS'ON DB itself). Triage findings into
   fix-now (criticals/highs — fix before closing R4) and register the rest.
6. Re-run the security design review against the delta (the standing instruction in the
   tiered plan) and refresh `docs/saas/2026-08-31-security-design-review.md`.

**Done when:** pen-test report archived with criticals/highs closed;
`control-mapping.md` residuals column empty or accepted-with-date; the weekly audit
gate has run green at least once.

---

## R5 — Compliance & documentation depth

**Needs:** one conversation you must have internally: what Mediagenix's existing
vendor/security framework (SOC2/ISO umbrella) covers — get it in writing.

**Steps:**
1. Data map: one table in `docs/saas/compliance/data-map.md` — every store (SQLite
   entities, sessions, audit, KPI history files, backups, logs, agent config) ×
   what's in it × where it lives × retention × lawful basis. Derive it from
   `bridge/migrations/` so it can't drift silently (a test that fails when a new table
   isn't in the map is cheap and worth it).
2. Enforce the stated retentions where not already enforced: audit log has 90d;
   add session purging (expired rows), backup pruning is done, decide KR-history and
   log retention numbers and implement the missing pruners.
3. Incident response: `docs/saas/compliance/incident-response.md` — detection sources
   (R2's alerts), severity ladder, containment steps per scenario (leaked share token →
   re-mint; leaked agent token → revoke; instance compromise → isolate + restore),
   tenant notification template, post-mortem template.
4. DPA/GDPR pack: processor/subprocessor roles, data-subject request handling (export
   exists — `/api/sync/backup` + importExport; deletion procedure per entity), EU
   residency statement per instance.
5. Security whitepaper: `docs/saas/brokr-security-whitepaper.md` assembled from
   `evidence/control-mapping.md` + the architecture decisions — client-agnostic,
   the standing questionnaire answer. Regenerate the evidence pack
   (`bash scripts/generate-evidence.sh`) and reference it.
6. Dry run: answer a public SIG-Lite/CAIQ-style questionnaire using only the pack;
   every question that needs an engineer becomes a gap to close in the pack.

**Done when:** the mock questionnaire passes the no-engineer test; retentions are
enforced by code, not prose; the umbrella-coverage statement is written and filed.

---

## R6 — Product completeness (closed five-item list)

**Steps (one story each, in this order):**
1. **Admin UIs for tokens and agents.** Cockpit: a Tenants panel (on ClientsPage in
   cockpit mode) — per client: mint/re-mint share token (shown once), last metric
   received. Client Settings (`src/pages/ClientSettingsPage.tsx`): an Agents section —
   mint enrol token (shown once, 15-min note), agent list with last-seen (verbatim
   from `GET /api/agents`), revoke button. All owner-gated via existing `permissions`.
2. **Fleet board in the Compare grid.** Extend `src/pages/ComparePage.tsx` (cockpit
   mode): a data source toggle "materialized goals | shared metrics"; shared mode maps
   `GET /api/cockpit/metrics` into the existing grid vocabulary (tenants as rows,
   krIds as columns, value/target chips, staleness). Retire `FleetMetricsPanel` to a
   dashboard summary linking here.
3. **TD-2.** Remount-by-key: parents render `<ClientModal key={editingClientId ?? 'new'} …>`
   (same for TeamModal, UserModal), initial state moves to `useState(initialFrom(props))`,
   delete the three `eslint-disable react-hooks/set-state-in-effect` blocks. Existing
   modal tests are the net; behavior must not change.
4. **KPI-vs-LiveKR decision.** Write the ADR (`docs/gpm/state/adr-001-kpi-vs-livekr.md`):
   recommend absorbing dashboard KPIs as goal-less live KRs OR naming the split
   permanently. Execute only the small end this EPIC: shared config storage or renamed
   routes — the full merge (if chosen) is its own future plan entry.
5. **Period archival minimum.** `Goal.archived?: boolean` (+ column, additive
   migration), an "Archive period" bulk action on GoalsPage (owner), archived goals
   excluded from active views and dashboards, visible under a filter, read-only in the
   UI. Reports keep seeing them.

**Done when:** the five are merged; **nothing else is added** — new discoveries go to
the next plan's backlog file, by name.

---

## R7 — Release engineering

**Steps:**
1. Release workflow `.github/workflows/release.yml` on `tag: v*`: run the full CI
   suite, then build desktop installers (linux + windows via the existing
   `electron:build*`; remember the `npm rebuild better-sqlite3` step order), the
   instance image (push to the registry, tagged), and an agent bundle
   (`bridge/whatson/ + agent*.cjs + package manifest`, tar). Attach installers + agent
   bundle to a GitHub Release with generated notes (commit log since last tag).
2. Version surfacing: inject the tag into the build (`VITE_APP_VERSION`, and
   `appVersion` on `/api/health`); desktop compares its version against the newest
   GitHub release on health poll and shows a passive "update available" toast.
3. FF-5 automation: a release-workflow step that boots the freshly built image and
   re-captures `bridge/__tests__/fixtures/protocol-v1/requests.json`-style fixtures
   for the *new* protocol version when `PROTOCOL_VERSION` changed, committing them via
   PR — fixture capture stops being manual.
4. Cut `v1.1.0` as the first fully automated release and verify all three artifacts
   from a clean machine.

**Done when:** one `git tag` yields installers + image + agent bundle + notes with no
manual steps, and the staging rig runs the released image (not a hand-built one).
