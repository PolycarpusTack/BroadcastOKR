# Readiness Plan — The Final Third (2026-08-31)

**Status:** PLAN OF RECORD — successor to the tiered development plan (all three
deployment forms complete, `794da36`).
**Execution instructions:** `readiness-instructions.md` — per-EPIC prerequisites, steps, and done-when.
**Goal:** reach **95%**: everything Mediagenix-side is validated, operable, billable,
hardened, and documented, such that onboarding the first client is a purely commercial
act — contract, their IdP config, an agent install — with no engineering in the path.

## Closed scope

**In scope:** everything achievable on Mediagenix-controlled systems and infrastructure.
**Out of scope (the deliberate final 5% — requires a real client):** client IdP
federation quirks, client WHATS'ON schemas and SQL overrides, contracts and pricing
negotiation, client onboarding runs, marketing/sales collateral beyond the security
whitepaper. **Also out (unchanged deferrals):** the Insights AI engine; payment rails
(Stripe/Paddle) — Mediagenix invoices through existing contracts, so R3 implements
enforcement + metering, not payment processing.

Definition of 95%: every exit criterion below met; the residuals register empty or
carrying only accepted-with-date entries; a simulated "day-one client" walkthrough
(provision → IdP config → agent install → metrics on the cockpit) executable start to
finish by one operator following only the docs.

---

## R1 — Real-system validation rig · M · **first, everything else leans on it**

The entire build so far is proven against mocks. Cross the mock-to-real gap on
Mediagenix's own systems — no client needed.

- Staging stack on internal infra: one cockpit + one client-edition instance + one
  agent host, behind real TLS (reverse proxy), from the provisioning script.
- OIDC against a **real IdP**: an app registration in Mediagenix's own Entra tenant
  (login, claims, logout, session expiry, MFA policy interplay).
- Agent against a **real database**: an internal WHATS'ON test schema (Oracle and/or
  Postgres) — real drivers, real timeouts, real `PSICHANNEL`.
- **Internal dogfood:** Mediagenix's own OKRs live on the cockpit for 14 unattended
  days — the Internal Cockpit is itself the first tenant-zero user.

**Exit:** 14-day unattended run; every mock-vs-real discrepancy triaged to a fix or an
accepted residual; the OIDC and agent runbooks corrected from what staging taught.

## R2 — Fleet operations machinery · L (completes plan-S2)

One instance is provisioned by script; a fleet must be *operated*.

- Deployment manifests per instance (compose profile or k8s) generated from
  `provision-instance.mjs`; TLS/ingress standardized.
- **Upgrade path:** scripted per-instance upgrade (image pull → migrate → health check
  → rollback on failure), gated by the protocol floor and FF-6; fleet-wide rollout
  playbook (cockpit last).
- **Monitoring:** cross-instance health scraping with alerting (instance down, agent
  silent > interval×3, backup age); log retention baseline.
- **Backup discipline:** off-machine shipping of the snapshot directory; a **restore
  drill** executed and timed on staging (RPO/RTO written down from measurement, not
  aspiration).

**Exit:** provision → upgrade → break → restore executed end-to-end on staging by
following the runbook only.

## R3 — Entitlements & usage metering · M (the billable core of plan-S4)

- Entitlement tiers in the existing ENTITLEMENTS mechanism (e.g. base / pro /
  enterprise: live KRs, sharing channel, agent count, seat/channel caps), enforced
  **server-side** per instance (licence value in the provisioned env, RBAC-style
  policy), UI degrading gracefully.
- Usage metering per instance: active seats, channels, agents, live KRs — exposed as
  an owner/operator report endpoint the cockpit aggregates (invoicing input).
- FF-8 fitness function: a feature outside the instance's tier is refused server-side
  (the entitlement twin of FF-3).

**Exit:** a staging instance provisioned at each tier behaves per its entitlement;
one fleet usage report covers everything an invoice needs. **DONE 2026-09-04** (FF-8
`entitlements.test.cjs` spawns an instance per tier; `GET /api/cockpit/usage`;
`docs/gpm/state/r3-backlog-2026-09-04.md`).

## R4 — Security hardening residuals · L

Close the recorded residuals; commission what needs commissioning.

- Agent channel: mTLS or certificate pinning on top of the bearer token; agent
  identity/key handling moved to 0600-file-plus-optional-OS-keystore, documented.
- **Delete-on-revoke decided and implemented** (both behaviors exist; the default is a
  product/legal decision — make it, wire it, document it).
- **External penetration test** commissioned against the staging rig (needs no client),
  criticals/highs fixed, report archived in the evidence pack.
- Dependency hygiene automation: scheduled audit gate in CI, Dependabot policy
  (auto-merge patch/minor on green), monthly floor review.

**Exit:** pen-test report with all critical/high findings closed; residuals register in
`control-mapping.md` empty or accepted-with-date.

## R5 — Compliance & documentation depth · M (plan-S5, client-independent part)

- Data map + retention policy implemented (KR history, audit log, backups, sessions —
  each with a stated and enforced retention).
- Incident-response runbook (detection → containment → tenant notification template);
  DPA/GDPR pack drafted from the data map.
- SOC2/ISO umbrella scoping settled **internally** with Mediagenix (what the vendor
  framework covers vs. what BrOKR must evidence itself) — the transfer in writing.
- **Security whitepaper** generated from the evidence pack: the standing,
  client-agnostic answer to questionnaires.

**Exit:** a mock security questionnaire (standard SIG-Lite-style) answerable start to
finish from the pack without engineering involvement.

## R6 — Product completeness · L (closed list — no additions without re-scoping)

1. **Admin UI for what is API-only today:** tenants (mint/re-mint share tokens) and
   agents (enrol-token, list with last-seen, revoke) on the cockpit and client
   Settings surfaces respectively.
2. **Fleet board, full version:** shared metrics integrated into the Compare grid
   (tenants × KRs with the existing sparkline/trend vocabulary), replacing the v1
   dashboard panel as the primary surface.
3. **TD-2 closed:** modal remount-by-key refactor, removing the three lint
   suppressions.
4. **KPI-vs-LiveKR consolidation decision** (the evaluation's parallel-subsystem
   finding): decide merge-or-name-the-difference, execute the small end of it
   (shared config store or explicit naming), record the ADR. **DONE 2026-09-03**
   — `docs/gpm/state/ADR-2026-09-03-connection-store.md`: keep both, share the
   store (D-3), name them "Dashboard KPI" vs "live KR".
5. **Period lifecycle minimum:** archive a goal period (read-only past quarters) —
   the smallest slice of the rollover gap flagged in the evaluation. **DONE 2026-09-04** (R6-5).

**Exit:** no operator action requires curl; the five items closed; anything else
discovered goes to the next plan, not this one.

## R7 — Release engineering · M

- One `git tag vX.Y.Z` builds and publishes all three artifacts: desktop installers,
  instance image (client+cockpit), agent bundle — with generated release notes and
  the golden-fixture capture for FF-5 automated at tag time.
- Version surfaced in-app and on health; upgrade-available signal for desktop.

**Exit:** a tagged release produced end-to-end by CI alone; FF-5 fixtures for the new
version exist without manual work. **DONE 2026-09-04** — `v0.9.2`, run 33835056555
(`docs/gpm/state/r7-backlog-2026-09-04.md`).

---

## Sequencing & effort

R1 first (M) — it de-risks everything and feeds R2/R4 with real findings. Then two
parallel tracks: **ops track** R2 → R7 (L+M) and **hardening track** R4 → R5 (L+M),
with R3 (M) and R6 (L) slotted after R1 on the product side. Total ≈ 2 L-equivalents
per track; the pen test (R4) has external lead time — commission it the day R1's rig
stands.

Each EPIC gets a backlog-builder decomposition at kickoff (GPM, as before). Mode stays
DELIVERY; the security review re-runs after R4.

## What 95% leaves for the final 5%
First-client IdP federation and schema mapping, contract/pricing execution, client
onboarding itself, and the feedback only a paying tenant generates. All commercial,
zero engineering — which is the point.
