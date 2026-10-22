# Changelog

All notable changes to BroadcastOKR will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Releases are cut by CI from a `v*` tag (`.github/workflows/release.yml`); the GitHub Release page
carries the per-release notes. This file keeps the short version.

## [Unreleased]

### Added

- Connector agent: opt-in instance pinning. `pins` in `agent-config.json` takes one or two SPKI hashes;
  `agent.cjs pin` reads and stores the instance's pin, `enroll --pin` pins a hosted tenant from the start,
  and `caFile` adds a private CA.
- Agents: owners can remove a revoked agent (`DELETE /api/agents/:id/purge`, **Remove** in the panel).
  Revoked agents are purged automatically after 30 days. Revoke itself still keeps the audit trail.

### Changed

- Repository cleanup (2026-09-07): stale plan drafts, mockups and orphaned files removed; line endings
  normalised; dead code and copied helpers consolidated. The WHATS'ON Insights evaluation moved to
  `../whatson-insights/`.

### Fixed

- Imports now persist all selected categories in one owner-authorized transaction, with retry receipts,
  licence/tenant checks, history preservation and deletion propagation. Replace affects only selected categories.
- Goal create/edit and setup now wait for accepted saves; refused edits roll back and forms remain available for retry.
- SQL NULL/blank measurements stay unavailable; nonfinite values are refused. PostgreSQL named-bind conversion preserves quoted text, comments and casts.
  Dashboard KPIs (`/api/kpi/execute`, `/api/kpi/poll`) follow the same rule instead of recording a fabricated 0.
- Imports and the first-connect migration accept bodies up to 20 MB (exports with KR history exceeded the 100 KB default).
- A goal or task create retried after a lost response is accepted when the bridge already holds it, instead of failing and inviting a duplicate.
- Browser regressions now cover reload persistence, save refusal/retry, import and two-browser check-in/deletion convergence; test ports and credentials are isolated.
- Client edition: channels pulled from the Settings page now get palette colours like everywhere else.

## [0.9.2] - 2026-09-04

First release produced by CI alone: Windows/Linux installers, `ghcr.io/polycarpustack/broadcastokr-instance:0.9.2-{client,cockpit}`, `brokr-agent-0.9.2.tgz`.

### Added

- **Licence tiers** (R3): starter / pro / enterprise with channel, seat and agent caps; server-side gates
  (`403 entitlement`), usage report and cockpit aggregate; the UI degrades per tier.
- **Release engineering** (R7): the instance Dockerfile, the agent bundle, protocol-fixture capture, the
  desktop update signal.
- **Fleet board** (R6-2), **period archive** (R6-5), edition labels (R6-6).

## [0.9.1] - 2026-09-03

- First build after the R1 rig's day one; ships the right native ABI for the packaged bridge.

## [0.9.0] - 2026-09-02

- Desktop punch list; the two-edition split (client instance / MGX cockpit), OIDC sign-in, the operator
  channel (R6-1), connections and Dashboard KPIs stored in the tenant database (D-3).

## Earlier

The production-readiness pass of 2026-04 (shared SQLite data layer on the bridge, credential encryption,
request logging, retry/offline handling, accessibility, CI) is recorded in `docs/PRODUCTION-READINESS.md`.
