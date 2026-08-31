# Tier 1 Backlog — Finish the Client Edition (2026-08-31)

Decomposition of Tier 1 from `docs/saas/2026-08-31-tiered-development-plan.md`.
Mode: **DELIVERY**. Branch `feature/tier1-client-edition`, commit per story, merge `--no-ff`.
Global DoD: vitest + bridge + lint + build (all editions) green; Two Hats; tests-first on behavior.

**Tier exit:** a broadcaster's team signs in with their own IdP on a dedicated instance,
manages their own OKRs/KPIs with server-enforced roles and a persistent audit trail, the
per-KR sharing flag exists, and the instance is provisioned by script — the Disney-bar
items 1–3 + 6(partial) + 7 demonstrably met (4/5 complete in Tier 2 with the agent/cockpit).

## Assumptions Ledger

| # | Assumption | Impact |
|---|---|---|
| 1 | OIDC via `openid-client` (Authorization Code + PKCE); tests run against an in-process mock IdP (discovery + JWKS + token endpoints) — no real Azure AD needed until a client onboards. | High |
| 2 | Sessions: opaque server-side session ids in a SQLite `sessions` table; HttpOnly/SameSite=Lax cookie; sliding 8h expiry, absolute 7d. Desktop mode keeps API-key auth verbatim — auth strategy switches on BRIDGE_MODE. | High |
| 3 | Cloud modes REFUSE to start without OIDC configured (fail-closed, sec A1); desktop keeps dev fail-open with the existing warning. | High |
| 4 | Roles: server `users.role` is authoritative; first provisioned user is owner; role changes owner-only. The frontend `ROLE_PERMS` map moves to a shared JSON consumed by both sides. | High |
| 5 | Protocol version starts at 1 with `MIN_SUPPORTED=1`; the mirror-equality test pins the two constants (bridge CJS ↔ src ESM). | Med |
| 6 | The opt-in flag ships as schema + store action + KR-form checkbox (owner-gated in UI); egress enforcement (FF-4, allowlist projector) is Tier 2 with the channel itself. | Med |
| 7 | "Slimmed Settings" for client mode = ClientsPage reduced to the pinned client's connection + channels (no add/delete client). Fleet surfaces stay tree-shaken out. | Med |

## Stories (execution order)

**T1-1 — Protocol version contract** · FEATURE · S
`bridge/protocol.cjs` (`PROTOCOL_VERSION=1`, `MIN_SUPPORTED=1`) + mirrored constants in
`src/constants/config.ts` with an equality test; clients send `X-BrOKR-Protocol`; middleware
426s below the floor with `{error, minSupported, current}`; health reports both. FF-6
migration scan (no DROP/RENAME newer than baseline without a breaking marker).

**T1-2 — Bridge serves the app** · FEATURE · S
In cloud modes (client/cockpit) the bridge statically serves `dist/` with an SPA fallback —
one container per instance. Desktop unaffected. AC: spawned bridge in client mode returns
the app shell at `/`; API routes unaffected; route-contract test still green.

**T1-3 — Per-KR sharing flag** · FEATURE · M
Migration 004: `key_results.shared_with_mediagenix INTEGER NOT NULL DEFAULT 0`. Type field
`sharedWithMediagenix?: boolean`; round-trips through DTOs/sync/PUT upserts; store carries
it; KR edit UI gets an owner-visible "Share with Mediagenix" checkbox (client/cockpit modes
only — hidden on desktop). Flag changes are audit-logged (T1-8 wires actor). Consumption
(egress projector + FF-4) is Tier 2 by design.

**T1-4 — Sessions + OIDC sign-in** · FEATURE · L · the gate
`openid-client` dep; migration 005: `sessions` table + `users.issuer/sub` (unique pair).
`bridge/routes/auth.cjs`: `/api/auth/login` (redirect, PKCE+state), `/api/auth/callback`
(code exchange, user upsert by issuer+sub, session create, cookie), `/api/auth/logout`,
`GET /api/auth/me` → `{user, role, permissions, mode}`. `createAuthMiddleware` becomes
mode-conditional per Assumptions 2–3; CORS `credentials:true` in cloud modes. Tests: mock
IdP end-to-end (login→callback→me→logout), fail-closed startup test, desktop regression.

**T1-5 — Server-enforced RBAC** · FEATURE · M · Pull gate: T1-4
Shared `ROLE_PERMS` (bridge-owned JSON, re-exported to src); `requirePerm()` middleware
reading `req.user.role`; applied per the seams table (goals/tasks CRUD, check-in
member-allowed, clients/connections/config/backup/migrate owner-only, users/teams manager+,
templates manager+, preview/tables/columns owner-only in cloud). Desktop mode: no-op
(single-user trust model unchanged). AC: **UI-bypass tests per role per route family**.

**T1-6 — AuthContext consumes the server identity** · FEATURE · M · Pull gate: T1-4
Cloud modes: on mount `GET /api/auth/me`; 401 → sign-in screen (no routes); `currentUser`
+ `permissions` from the server; persona switching dead. Desktop: current behavior verbatim.
The unified fetch client sends `credentials:'include'` and routes 401s to the sign-in state.

**T1-7 — Cloud SQL lockdown & exposure trim** · FEATURE · S · Pull gate: T1-5
In cloud modes: `preview-query`/`tables`/`columns` owner-only + per-query audit entries;
rate limiting keyed per-session behind `trust proxy`; unauthenticated `/api/health` returns
only `{status, mode, protocolVersion, minSupported}` (full stats when authenticated).

**T1-8 — Audit trail promotion** · FEATURE · S · Pull gate: T1-4
Server-side emission with session-derived actor for: auth events (login/logout/failed),
role changes, connection/config changes, sharing-flag changes. Client-supplied actor is
ignored in cloud modes. Desktop keeps client-posted entries.

**T1-9 — Single-tenant pinning completion** · FEATURE · S
Provisioning seed guarantees the one client row (T0-7 already refuses drift); client-mode
ClientsPage variant: pinned client's connection + channels only (no add/delete). Since
ClientsPage is tree-shaken from client builds, this ships as a slim `SettingsPage` chunk
gated the inverse way — present in client builds, hidden elsewhere.

**T1-10 — Instance provisioning script** · FEATURE · M
`scripts/provision-instance.mjs`: creates the instance env (mode, keys, OIDC config,
DB path), runs migrations, seeds the pinned client + owner user, prints the enrolment
summary. Docker image build via the existing Dockerfile; compose profile for a client
instance. AC: script → running instance → owner signs in (mock IdP) → seeded state present.

**T1-11 — Isolation evidence pack** · FEATURE · S
`docs/saas/evidence/`: the cross-tenant rejection test output, provisioning transcript,
FF-1 sentinel scan output, and a one-page control mapping to the Disney-bar list — the
security-questionnaire attachment, generated not hand-written where possible.

## Validator summary
Linear order with pull gates (T1-4 gates 5/6/7/8) ✓ · hats declared (all FEATURE; no mixed
refactors) ✓ · tests-first on auth/RBAC/flag ✓ · migrations additive (004, 005) ✓ ·
economy: no story spec longer than its code ✓.
