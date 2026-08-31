# Phase Summary — Tier 2: Internal Cockpit Complete (2026-08-31)

Branch `feature/tier2-cockpit`, 8 commits, all 7 stories of
`tier2-backlog-2026-08-31.md`. Tier exit met: the cockpit runs fleet mode
behind cloud auth with tenants as client rows fed by opt-in metrics pushed
from client instances; site agents feed instances outbound-only with no SQL
on the wire; v1-protocol clients are tripwired by golden fixtures.

## Delivered
- T2-1 `5470e83` — cockpit mode proven: fleet CRUD behind OIDC+RBAC, fail-closed.
- T2-2 `78fcccb` — FF-4 allowlist share projector, sentinel-proven, shipped BEFORE the channel.
- T2-3 `a9b887a` — push-only shared-metrics channel: per-tenant write-only tokens (hashed,
  owner-minted), strict ingest validation (audited rejections), landed metrics + fleet read;
  client-instance push loop. Two-server end-to-end test.
- T2-4 `6bf0a36` — connector agent v1: bridge/agent.cjs (enroll/run CLI; local operator-owned
  SQL config; AGENT_DATA_KEY option), one-time enrolment tokens, revocable hashed agent
  tokens, scalar-only ingest reusing liveSync semantics (applySyncedValue extraction).
- T2-5 `19bf0fc` — FF-5 golden v1 fixtures with a support-window check tied to MIN_SUPPORTED.
- T2-6 `781f3d1` — FleetMetricsPanel (cockpit runtime only) on the Dashboard.
- T2-7 — evidence rows 4–5 now implemented-with-residuals; this summary.

## Verification at close
212 vitest (40 files) + 108 bridge tests + 3 E2E green; lint 0; sentinel scans green.

## Decisions & residuals (from the backlog assumptions)
- Agent channel v1 = per-agent revocable bearer over platform TLS; cert-bound mTLS,
  OS-keystore keys, and per-client read-only DB accounts are recorded residuals.
- Cloud "sync now" waits for the agent's next push (no inbound commands, by design).
- Delete-on-revoke of previously shared cockpit rows: open contract question for legal.
- Package split (2.6): trigger NOT fired — agent ships from the same repo/image cadence.

## Open / next
All three deployment forms are finished per the tiered plan. Next horizons live in the
plan's out-of-scope list: billing/entitlements (S4), compliance depth (S5), Compare-grid
integration of shared metrics, mTLS hardening, TD-2.
