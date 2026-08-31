# Phase Summary — Tier 1: Client Edition Complete (2026-08-31)

Branch `feature/tier1-client-edition`, 12 commits, all 11 stories of
`tier1-backlog-2026-08-31.md`. Tier exit met: a broadcaster's team signs in
with their own IdP on a dedicated, script-provisioned instance with
server-enforced roles, a session-actor audit trail, and the sharing flag in
place. Desktop behavior unchanged throughout.

## Delivered
- T1-1 `19bca86` — protocol v1 contract: X-BrOKR-Protocol header, 426 floor, FF-6 additive-migration scan, CJS/ESM mirror test.
- T1-2 `ac82dd1` — cloud bridges serve dist/ with SPA fallback; auth guards /api/* only.
- T1-3 `9b09980` — per-KR `shared_with_mediagenix` flag (migration 004), full round-trip, owner-gated toggle in cloud editions.
- T1-4 `f6240ea` — OIDC code+PKCE via openid-client; SQLite sessions (8h/7d), HttpOnly cookies; users↔(issuer,sub) (migration 005); first-SSO-user-owner; mode-conditional auth middleware; fail-closed cloud startup (BRIDGE_INSECURE_NO_AUTH=1 test escape); mock-IdP e2e tests; permissions mirror test.
- T1-5 `b7725a2` — declarative RBAC policy over all route families; role escalation owner-only; UI-bypass battery.
- T1-6 `e263c3b` — AuthContext consumes /api/auth/me in cloud builds; sign-in gate + SSO button; 401 → bridge-unauthenticated event; credentials on the unified client; VITE_EDITION=internal → cockpit mode.
- T1-7/T1-8 `7300a6d` — session-keyed rate limiting behind trust proxy; anonymous health trimmed; server-side audit (sign-in/out, role changes, connection/config, sharing flips); cloud ignores client actor claims.
- T1-9 `b391942` — slim ClientSettingsPage in client builds (inverse tree-shake); Settings nav in both shapes.
- T1-10 `e4564c1` — provision-instance.mjs: 0600 env, migrated DB, seeded pinned client, fail-closed placeholders; boot-tested.
- T1-11 `507683e` — evidence pack (control mapping + regenerable proofs).

## Verification at close
210 vitest (39 files) + 93 bridge tests + 3 E2E green; lint 0; desktop/client
builds sentinel-checked.

## Architecture memory
- Auth strategy switches on BRIDGE_MODE inside ONE middleware; the auth router
  mounts in every mode (/me and /logout are OIDC-independent).
- openid-client v6 is ESM — dynamic import() from the CJS bridge; tests run
  against bridge/__tests__/helpers/mockIdp.cjs (discovery/JWKS/token, RS256).
- The route-contract extractor skips literals ending in '/' (startsWith
  prefixes are not routes).
- RBAC additions belong in bridge/middleware/rbac.cjs POLICY — new sensitive
  routes must be listed there (default is authenticated-only).

## Open
Tier 2 (agent + cockpit channel + fleet board). MFA/pen-test/SOC2-umbrella
items tracked in evidence/control-mapping.md residuals. TD-2 unchanged.
