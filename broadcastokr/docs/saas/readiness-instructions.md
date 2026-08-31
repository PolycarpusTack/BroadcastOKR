# Readiness Plan — EPIC Instructions

Executable instructions for the seven EPICs of `2026-08-31-readiness-plan.md`.
Each section: what you need first, the steps in order, and how you know it's done.
File paths are real; commands run from `broadcastokr/` unless noted. Execute an EPIC
as a GPM story sequence (branch `feature/r<N>-<slug>`, commit per step-group,
merge `--no-ff`, suites green before every commit).

---

## R1 — Real-system validation rig

**You must provide (nothing starts without these):**
- An app registration in Mediagenix's Entra tenant: redirect URI
  `https://<staging-host>/api/auth/callback`, scopes `openid profile email`,
  a client secret. Note the issuer URL (`https://login.microsoftonline.com/<tenant>/v2.0`).
- A host (VM or k8s namespace) with a DNS name and the ability to terminate TLS.
- Access to an internal WHATS'ON test database (Oracle or Postgres) with a
  read-only account granted SELECT on the PSI tables you'll query.

**Steps:**
1. Provision the two instances on the host:
   `node scripts/provision-instance.mjs --dir /srv/brokr-cockpit --name "Mediagenix" --mode cockpit --base-url https://cockpit.<host>`
   and the same with `--mode client --name "Tenant Zero" --base-url https://t0.<host>`.
   Fill the OIDC values in each generated `.env` (both instances refuse to start until you do — that's correct).
2. Build the edition bundles: `VITE_EDITION=internal npx vite build` → serve from the
   cockpit instance (`BRIDGE_APP_DIR`), `VITE_EDITION=client npx vite build` → the
   client instance. Put both behind the TLS proxy (Caddy/Traefik/nginx), routing each
   hostname to its instance's port 3001.
3. Sign in to each with your Entra account. **Expect real-IdP friction here** — claim
   names, `email` vs `preferred_username`, tenant-restricted consent. Fix what breaks
   in `bridge/routes/auth.cjs` (`upsertSsoUser` claims mapping) and record each fix.
4. On the cockpit: create the Tenant Zero client row, mint a share token
   (`POST /api/cockpit/tenants` via the UI once R6-1 lands, curl until then), set
   `BRIDGE_COCKPIT_URL` + `BRIDGE_SHARE_TOKEN` in the client instance's `.env`, restart.
5. Enroll an agent against the client instance on a machine that can reach the test DB:
   mint (`POST /api/agents/enrol-token`), then
   `node bridge/agent.cjs enroll --instance https://t0.<host> --token <T> --name "staging-agent" --dir /etc/brokr-agent`.
   Edit `/etc/brokr-agent/agent-config.json`: add the test-DB connection and 2–3
   `bindings` with real PSI queries (start from the presets in
   `bridge/whatson/templates.cjs`). Run `node bridge/agent.cjs run --dir /etc/brokr-agent`
   under systemd.
6. Seed real content: put Mediagenix's actual quarterly OKRs on the cockpit; on Tenant
   Zero create goals whose KR ids match the agent bindings; flip 1–2 KRs to
   "Shared with Mediagenix".
7. **Dogfood for 14 days.** Keep a `docs/saas/readiness/r1-findings.md` log: every
   mock-vs-real discrepancy, UX papercut, and silent failure, each triaged to
   fix-now / backlog / accepted.

**Done when:** 14 unattended days; agent values visible on Tenant Zero and its shared
metrics on the cockpit fleet panel; findings log fully triaged; the OIDC and agent
sections of `docs/operations.md` corrected from what staging taught.

---

## R2 — Fleet operations machinery

**Needs:** the R1 rig (drills run against it), a container registry.

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
