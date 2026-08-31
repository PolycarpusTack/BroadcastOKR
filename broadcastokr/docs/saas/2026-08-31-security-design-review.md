# Security Design Review — Two-Edition Cloud Architecture (2026-08-31)

**Scope:** the decided direction in `2026-08-31-two-edition-amendment.md` reviewed against the
actual code (`bridge/middleware/auth.cjs`, `rateLimit.cjs`, `bridge/utils/crypto.cjs`,
`bridge/server.cjs`, `bridge/routes/sync.cjs`, `src/context/AuthContext.tsx`,
`src/constants/config.ts`). STRIDE-tagged, fix-first ordered per trust boundary.
**Produced by:** secure-design-reviewer agent, synthesized 2026-08-31.

**Overall verdict:** the architecture decisions are sound — dedicated instance per client,
outbound-only agent, push-based opt-in — but the current code has exactly one security control
between the internet and everything: a single shared bearer key that is also the encryption-key
source and is baked into the frontend bundle. It must be **replaced, not evolved**.

---

## Boundary A — Browser ↔ Client Instance (highest priority)

- **A1 [S] Baked-in `VITE_BRIDGE_API_KEY` is unacceptable in any cloud form. Fix.**
  One leaked bundle = full instance compromise (the key authenticates all calls AND derives the
  AES key for WHATS'ON credentials). Replace with OIDC/SSO (client's Azure AD/Okta), MFA,
  short-lived server-side sessions (HttpOnly/Secure/SameSite). Also fix `auth.cjs` fail-open
  (no key configured = auth disabled): cloud instances must refuse to start unconfigured.
- **A2 [E] Frontend-only personas: every mutation route has zero authorization. Fix (gating).**
  `POST /api/sync/migrate-from-local` uses `INSERT OR REPLACE INTO users` — a literal
  self-service privilege-escalation endpoint once roles are real. Server-enforced RBAC on every
  mutation, role from session never request body; restrict `migrate-from-local` and
  `GET /api/sync/backup` to owner/operator in cloud builds. The `ROLE_PERMS` matrix ports
  server-side; the React context remains UX gating.
  Validation: UI-bypass tests per role per route.
- **A3 [T/I] Arbitrary SQL flows from the browser. Avoid in steady state.**
  In cloud: SQL definitions live server-side; the instance sends the agent KR *references*.
  Ad-hoc SQL (preview, schema browser) is admin-only, audited per query.
- **A4 [R] Actor identity is client-supplied; audit trail is in-memory. Fix (prerequisite).**
  Persistent append-only audit log, server-derived actor + timestamps: auth events, role
  changes, SQL config changes, opt-in changes, every cockpit export.
- **A5 [I] Unauthenticated `/api/health` leaks DB stats; 500 bodies leak `err.message`. Fix (cheap).**
  Trim health for unauthenticated callers in cloud builds; genericize error bodies; use
  `crypto.timingSafeEqual` wherever a static token comparison survives.
- **A6 [D] Rate limiting keyed per-IP breaks behind a load balancer. Fix.**
  Set `trust proxy` correctly, re-key per session/user. Middleware otherwise reusable.

## Boundary B — Instance ↔ Control Plane

- **B1 [E/S] Control-plane compromise must not become fleet compromise. Design constraint.**
  Tenant ID pinned in every issued credential (token claims, agent cert SAN); instances validate
  issuer + own tenant ID; the control plane never stores or proxies WHATS'ON-derived data —
  metrics flow agent → tenant instance only. Stated invariant + cross-tenant rejection test.
- **B2 [T] Provisioning supply chain:** signed images, reviewed IaC, audited provisioning runs.

## Boundary C — Agent ↔ Gateway

- **C1 [S]** Enrolment token: one-time-use, short TTL, exchanged for per-agent client cert bound
  to the tenant; revocation must exist and be tested.
- **C2 [E/T] The command channel must never carry SQL. Avoid by design.**
  The agent executes only locally-stored, approved SQL; the cloud sends KR IDs and schedules.
  Config changes arrive via an explicit, audited update flow the on-prem operator can review
  (also a selling point: "your DBA can read every query we will ever run").
- **C3 [I] Only numeric scalars leave the site. Fix (cheap, high leverage).**
  Outbound payload schema is `{krId, value:number, timestamp}` and nothing else, enforced
  structurally at the agent. Even malicious SQL config then cannot exfiltrate row data through
  the metrics channel.

## Boundary E — Agent ↔ WHATS'ON DB

- **E1 [E/T] `assertSelectOnly` is defense-in-depth, not the boundary.** Primary control: a
  dedicated read-only WHATS'ON account with SELECT grants only on the PSI tables the templates
  use (deal-cost/rights tables excluded unless the client configures them). Known heuristic
  gaps: doubled-quote escapes, Oracle `q'[...]'`, side-effectful functions — keep the guard,
  don't rely on it.
- **E2 [I] API-key-derived AES-256-GCM is NOT acceptable for agent credentials in the cloud
  model.** The GCM code (`crypto.cjs`) is competent and reusable; the key source is not (same
  secret as the bearer header + bundle constant; static source-public salt). Replace with a
  per-agent random 256-bit data key generated at enrolment, kept in the OS keystore / 0600
  root-owned file, never a network credential.
- **E3 [D] Timeouts don't cancel the underlying query.** Set `oracledb` `callTimeout` and PG
  `statement_timeout` so the *database* cancels. A runaway KR query on a broadcaster's
  production scheduling DB is a relationship-ending incident.

## Boundary D — Client Instance ↔ Cockpit (the opt-in channel)

Enforcement lives at the **client instance's egress, in a single allowlist-projection
function**, with the cockpit holding no credentials to ask for anything:

1. **Push, never pull.** The cockpit has zero credentials against client instances; instances
   push opted-in metrics to a cockpit ingest endpoint with a per-tenant write-only token.
   Non-opted data structurally has no path.
2. **Server-side allowlist projection at the instance.** `shared_with_mediagenix` is a KR
   column, mutable only by the client's Owner, audited. The exporter selects `WHERE shared`
   with an explicit field allowlist (id, value, target, direction, timestamp). Titles shared
   only if separately flagged; notes/confidence/history **never** in v1. The client-visible
   "what Mediagenix sees" preview renders from the *same* projection function.
3. **Cockpit-side ingest schema validation** as backstop: reject and log any payload with
   fields outside the contract.

Validation to write early: sentinel-based export test (non-shared KR content never appears in
the payload), opt-out flip test (and surface the contract question: must previously shared
history be deleted cockpit-side?), export-field-list contract test in the
`route-contract.test.cjs` style.

## What desktop may keep that cloud must not

| Desktop keeps (accepted: single user, single machine, localhost) | Cloud must not have |
|---|---|
| Shared API key incl. baked `VITE_BRIDGE_API_KEY` | Any shared static credential in the browser path |
| Frontend persona switch (UX affordance) | Client-side authorization of anything |
| API-key-derived credential encryption | Auth-credential-derived encryption keys |
| Open `/api/health`, `backup`, `migrate-from-local` | All three |
| Fail-open auth when unconfigured (dev) | Fail-open anything |
| Client-supplied `actor`; in-memory ActivityLog | Client-supplied identity claims |
| Ad-hoc SQL from the UI for the local operator | Non-admin, unaudited SQL paths |

**Not accepted even for desktop:** the `0.0.0.0` default bind (`server.cjs`) — flip the default
to `127.0.0.1`, make LAN exposure opt-in. One line.

## Minimum bar before the first external client ("Disney-grade")

1. SSO federation to the client's IdP + MFA + server-side sessions; no shared/baked credentials.
2. Server-enforced RBAC on every mutation, proven by UI-bypass tests.
3. Persistent append-only audit trail (server-derived actor/timestamps).
4. Agent hardening bundle: one-time enrolment → per-agent mTLS with revocation; read-only DB
   account as primary control; agent-local credential key; no ad-hoc SQL from the cloud;
   numeric-scalar-only egress.
5. Opt-in egress enforcement at the instance with bypass tests; push-only cockpit channel;
   same-code-path preview.
6. TLS 1.2+/HSTS everywhere, encryption at rest (instance Postgres + agent config), EU region
   for VRT.
7. Isolation evidence: scripted provisioning + repeatable cross-tenant rejection test.
8. Backups/DR with stated RPO/RTO; incident-response and vuln-management written into the
   Mediagenix partnership scope (transfer must be explicit, not assumed).

**Can follow:** SOC2/ISO certification itself (verify Mediagenix umbrella coverage), billing
gates, SIEM export/anomaly detection, customer-managed keys, DDoS beyond provider defaults,
formal DLP, external pen test (schedule before Disney; a design partner can start on the eight
above).
