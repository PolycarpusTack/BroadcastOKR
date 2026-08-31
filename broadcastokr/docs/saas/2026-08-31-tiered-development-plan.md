# Tiered Development Plan — Finishing Each Deployment Form (2026-08-31)

**Status:** PLAN OF RECORD — synthesized from three specialist investigations run 2026-08-31:
implementation seams (software architect), security design review
(`2026-08-31-security-design-review.md`), and evolutionary-architecture guardrails.
**Builds on:** `2026-08-31-two-edition-amendment.md` (direction), the 2026-06-01 migration plan
(phases S1–S5), and the completed 2026-08-31 hardening pass (`docs/gpm/state/`).
**Principle:** one codebase, three deployment forms. Each tier *finishes* one form:
Tier 0 → Desktop, Tier 1 → Client Edition, Tier 2 → Internal Cockpit.

Sizes: XS &lt; S &lt; M &lt; L &lt; XL (relative). Origin tags: [arch] implementation-seams plan,
[sec] security review, [evo] evolutionary guardrails.

---

## Standing architecture decisions (from the investigations)

1. **Tenancy mode is bridge-authoritative:** `BRIDGE_MODE=desktop|client|cockpit` served via
   `/api/health` (frontend already polls it); `VITE_EDITION` is the build-time default/fallback.
   Mode is not a secret; entitlements are enforced server-side.
2. **One gating mechanism:** `src/editions/entitlements.ts` (frontend) + `bridge/editions.cjs`
   (bridge) are the ONLY places that read the mode. Everything gates through `hasFeature()`.
   Enforced by lint/test (FF-7). No `*.client.tsx` / `*.internal.tsx` files, ever.
3. **Gate at three depths:** nav (Sidebar NAV filter), route (`App.tsx` → redirect), and
   store/server (early-return in store actions + 403 on fleet routes in client mode). UI-only
   hiding is not a boundary (HashRouter deep links, curl).
4. **The fleet code ships everywhere, dead where ungated.** Never excise store actions per
   edition — that is the fork. Client-mode builds tree-shake the fleet *pages* (lazy chunks
   behind a statically-analyzable env check); the store stays whole.
5. **Auth is mode-conditional in one middleware factory:** desktop keeps today's API-key check
   verbatim (no IdP, no network dependency); cloud modes get OIDC + SQLite-backed server
   sessions. The current key path is **replaced, not evolved** [sec A1].
6. **Progress stays client-owned** (hardening Assumption 4 holds): the bridge/agent writes raw
   facts; `_mergeChanges` recomputes progress via `krProgress`.
7. **Cockpit channel is push-only with allowlist projection** at the client instance's egress;
   the cockpit holds no credentials against client instances [sec D].
8. **Monorepo split is premature.** Two triggers, either fires → split then: (a) a second
   runtime needs the domain math (cloud-side progress), (b) S3 ships the agent as a separately
   released artifact → `bridge/whatson/` becomes `packages/agent-core`. Until then,
   dependency-direction fitness functions do the boundary's job [evo §1].

## Fitness functions (the no-fork test suite) [evo §2]

| ID | Asserts | Lands in |
|---|---|---|
| FF-1 | Client build's `dist/` contains zero fleet sentinels ('FLEET AVG', 'Materialize', '/compare'); internal build contains them all | CI build matrix + scan script |
| FF-2 | `src/utils`, `src/types`, `src/store` import nothing from pages/components/editions | ESLint no-restricted-imports (already CI-gated at 0) |
| FF-3 | `BRIDGE_MODE=client` server 403s fleet routes; `fleet` mode 200s them | node:test, route-contract idiom |
| FF-4 | Non-opted-in KR content (planted sentinels) never serializes into the cockpit payload; even opted-in KRs omit sql/connectionId/notes | node:test, sentinel scan of the allowlist projector |
| FF-5 | Golden request fixtures from agent versions N-1/N-2 replay green against current cloud | node:test fixtures per release tag |
| FF-6 | New migrations newer than last tag contain no DROP/RENAME unless marked breaking + MIN_SUPPORTED bumped | node:test scan |
| FF-7 | Only `src/editions/` reads `VITE_EDITION`; only `bridge/editions.cjs` reads `BRIDGE_MODE`; no per-edition filenames | ESLint + fs-walk test |

Versioning contract [evo §3]: `PROTOCOL_VERSION`/`MIN_SUPPORTED` in `bridge/protocol.cjs`
(mirrored constant in `src/constants/config.ts`, equality-tested); `X-BrOKR-Protocol` header,
`426` below floor; N-2 support window, additive-only payloads/schema within it (expand →
migrate → contract). One repo version tags all three artifacts; agent request corpus captured
as golden fixtures at each tag.

---

## Tier 0 — Finish Desktop (core completion; benefits all forms)

**Definition of done for the Desktop form:** every store mutation reaches the bridge; live-KR
sync runs bridge-side (browser closed ≠ stale); activity log and backups survive restarts;
concurrent edits conflict loudly instead of silently losing; the edition seams and guardrails
exist so Tier 1 hangs off them.

| # | Item | Size | Origin |
|---|---|---|---|
| 0.1 | TD-1 small writes: `setMonitor`, `toggleSubtask`, `addBulkTasks` mirror the existing PUT/POST pattern | S | arch §4d |
| 0.2 | Bridge-side live-KR sync loop (`bridge/liveSync.cjs`: interval reads live KRs from SQLite, reuses the batch executor, writes values + `updated_at` + monitored history; frontend timer becomes desktop-offline fallback; `POST /api/kpi/sync-now` for manual sync; `_mergeChanges` recomputes progress client-side) | L | arch §4d |
| 0.3 | Persistent activity log: `activity_log` table + `/api/activity` routes; context hydrates from bridge, posts fire-and-forget | S | arch §4a, sec A4 |
| 0.4 | Automated backups: better-sqlite3 online `db.backup()` scheduler (daily, keep 14); `/api/sync/backup` serves a snapshot, not the live WAL-hot file | S | arch §4b |
| 0.5 | Version-checked PUTs (goals+tasks first): `version` column, compare-and-swap UPDATE, 409 → `_mergeChanges` + toast | M | arch §4c |
| 0.6 | Unify `apiFetch`/`bridgeFetch` into one client (the 401/409/credentials hook point) — do FIRST | S | arch |
| 0.7 | Tenancy plumbing: `BRIDGE_MODE` → health → `entitlements.ts` + `bridge/editions.cjs`; gates in App routes, Sidebar NAV, store actions, PersonaPanel (`DEV && desktop` only); client-mode 403s on fleet routes | M | arch §1, evo §4 |
| 0.8 | Guardrails first wave: FF-2 + FF-7 lint rules, CI build matrix (desktop/client/internal) + FF-1 sentinel scan, FF-3 test | S | evo |
| 0.9 | Quick security wins shippable now: default bind `127.0.0.1`, `timingSafeEqual` in auth.cjs, DB-side query cancellation (`callTimeout` / `statement_timeout`), genericized 500 bodies | S | sec A5/A6/E3 |
| 0.10 | Pull-forward: extract `bridge/whatson/` (pools, sqlSafety, queryRunner, schema, connectionStore) + `routes/whatson.cjs`; `server.cjs` becomes a composition root. Pure extraction pinned by the existing bridge suite + route contract test | M | arch §3 |

Sequencing: 0.6 → 0.5; 0.1 before 0.2 (0.2 subsumes sync-result persistence); 0.7 + 0.8
early (everything in Tier 1 hangs off them); 0.10 any time (de-risks Tier 2's XL item).

## Tier 1 — Finish the Client Edition

**Definition of done:** a broadcaster's team logs in with their own SSO, manages their own
OKRs/KPIs against their own WHATS'ON data on a dedicated instance, with server-enforced roles,
audit, and the opt-in flag in place — and the Disney-grade minimum bar items 1–3, 5(partial),
6–8 demonstrably met.

| # | Item | Size | Origin |
|---|---|---|---|
| 1.1 | OIDC/SSO (`openid-client`) + SQLite session store + `bridge/routes/auth.cjs` (`login/callback/logout/me`); mode-conditional `createAuthMiddleware` (desktop = today's key check; cloud = sessions, fail-closed when unconfigured); users table gains `(issuer, sub)` | L | arch §2, sec A1 |
| 1.2 | Server-side RBAC: `requirePerm()` from a server-owned `ROLE_PERMS`; per-route-family checks (goals/tasks/clients/users/teams/templates/connections/kpis/preview/sync per the seams table); `migrate-from-local` + `backup` owner-only; **UI-bypass tests per role per route** | M | arch §2, sec A2 |
| 1.3 | `AuthContext` as server-identity consumer (`/api/auth/me`; 401 → login screen); desktop persona fallback verbatim; existing `permissions.canX` gates become UX hints | M | arch §2 |
| 1.4 | Single-tenant pinning: provisioning-seeded client row; reject second client / last-client delete in client mode; slimmed Settings surface (connection + channels for the pinned client) | S | arch §1 |
| 1.5 | Scripted per-instance provisioning: env, migrations, seed client + owner, OIDC config, image build (Dockerfile exists); signed images + audited runs | M | arch, sec B2 |
| 1.6 | Bridge serves `dist/` statically — cloud instance is one container | S | arch |
| 1.7 | Per-KR `shared_with_mediagenix` flag: migration + owner-only KR-edit checkbox + audit on change (flag only; consumption is Tier 2) | M | arch, sec D |
| 1.8 | Audit trail promotion: server-side emission inside mutation handlers (session-derived actor), covering auth events, role changes, SQL config changes, opt-in changes | S | sec A4 |
| 1.9 | Cloud-mode SQL lockdown: preview/schema-browser admin-only + per-query audit; rate-limit re-keyed per session behind `trust proxy`; `/api/health` trimmed for unauthenticated callers | S | sec A3/A5/A6 |
| 1.10 | Protocol version module + `X-BrOKR-Protocol` header + 426 floor + health version report; FF-6 migration scan | S | evo §3 |
| 1.11 | Isolation evidence pack: cross-tenant rejection test + provisioning proof, packaged for security questionnaires | S | sec §7 |

Critical path: 0.7 → 1.1 → 1.2 → 1.3; 1.4–1.11 parallel after 1.1.

## Tier 2 — Finish the Internal Cockpit

**Definition of done:** Mediagenix runs one fleet-mode instance where every tenant is a client
row; internal OKRs track live, opt-in metrics pushed from client instances; agents at customer
sites feed their own instances outbound-only; a 2-versions-old agent still works.

| # | Item | Size | Origin |
|---|---|---|---|
| 2.1 | Cockpit mode wiring: fleet surfaces visible behind Tier-1 auth (largely today's app) | XS | arch |
| 2.2 | Connector agent: `bridge/agent.cjs` entrypoint over `bridge/whatson/` (0.10); one-time enrolment token → per-agent mTLS cert bound to tenant, with revocation; outbound-only channel; cloud gateway shim implementing `execute-batch` by forwarding (frontend contract unchanged); **no SQL on the command channel** — agent executes locally-stored approved SQL, config changes via audited update flow; numeric-scalar-only egress schema; per-agent random data key replaces API-key-derived encryption; read-only WHATS'ON account documented as install requirement | XL | arch §3, sec C1–C3/E1–E2 |
| 2.3 | Shared-metrics channel: client instances push opted-in KR values to the cockpit ingest (per-tenant write-only token); allowlist projection function is the single source for both export and the client-visible "what Mediagenix sees" preview; cockpit-side schema validation as backstop; values land as `source:'sync'` history under the tenant's client row; FF-4 sentinel test ships BEFORE the channel | L | arch, sec D, evo FF-4 |
| 2.4 | Fleet board: tenant registry → client rows; fleet templates + Compare over live tenants; opt-out contract question resolved (delete-on-revoke or retain, decided with legal) | M | arch |
| 2.5 | FF-5 golden fixtures per release tag; `MIN_SUPPORTED` advance discipline; agent version telemetry on health | S | evo |
| 2.6 | Trigger check: if 2.2 ships the agent as a separate artifact → execute the `packages/agent-core` split per the evo triggers | M (conditional) | evo §1 |

Split-out of 2.2 if it needs de-risking: extraction is already done (0.10); enrolment/mTLS
(L), gateway shim (M), agent hardening bundle (M) can land as separate stories.

## Out of scope of all tiers (explicitly deferred)

Billing/entitlement tiers (plan S4), SOC2/ISO certification itself (verify Mediagenix umbrella),
SIEM export/anomaly detection, customer-managed keys, DLP tooling, external pen test
(schedule before the first Disney-class client), KPI-vs-LiveKR subsystem consolidation
(evaluate after 0.2, which removes most of the duplication pressure).

## Process

Execute under GPM: each tier gets a backlog-builder decomposition into stories at kickoff
(this document is the EPIC-level plan, deliberately not pre-decomposed — Core §5.3). Mode
stays DELIVERY; two-hats and the hardening-era test discipline apply. Security review
re-runs at Tier 1 exit (pre-first-client) and Tier 2 exit (pre-cockpit-live).
