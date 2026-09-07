# Changelog

All notable changes to BroadcastOKR will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Releases are cut by CI from a `v*` tag (`.github/workflows/release.yml`); the GitHub Release page
carries the per-release notes. This file keeps the short version.

## [Unreleased]

### Changed

- Repository cleanup (2026-09-07): stale plan drafts, mockups and orphaned files removed; line endings
  normalised; dead code and copied helpers consolidated. The WHATS'ON Insights evaluation moved to
  `../whatson-insights/`.

### Fixed

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
