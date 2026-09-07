# Access Request — WHATS'ON Staging for Insights Spike

**Date:** 2026-05-31
**Requested by:** Yannick Verrydt
**Blocks:** WHATS'ON Insights validation spike (`2026-05-31-whatson-insights-spike.md`) — Task 1 cannot start without this
**Needed by:** Before spike Day 1 (this is the critical-path dependency)

---

## What I need

1. **A staging / test WHATS'ON site** (2026r3 or close) with realistic broadcast data — rights contracts, transmissions, schedule. Not production (this is throwaway spike work; no production data should be touched).
2. **BAPI2 REST access to that site:**
   - Base URL of the BAPI2 REST endpoint
   - **Login credentials** for the `POST /login` handshake (BAPI2 auth is a login → session token flow, not a pre-shared key)
   - Confirmation the account has **read permission** on the Rights/Contract, Programme, Transmission, and Schedule sub-APIs (BAPI2 enforces per-object-type permissions server-side)
3. **A pointer to the OpenAPI definitions** if available offline — BAPI2 exposes `GET /api` per sub-API returning OpenAPI YAML; having these up front lets me pre-map fields before touching the live endpoint.

## Why

We're evaluating **WHATS'ON Insights** as a potential Mediagenix sister product to BroadcastOKR: natural-language querying + dashboards over broadcast rights/scheduling data. Before committing to a multi-tenant backend, a 10-day spike validates two unknowns: (a) does BAPI2 actually expose the rights/amortisation fields we need, and (b) does NL-query→chart save rights managers real time.

Read-only. No writes to WHATS'ON. Spike-quality, isolated from the BrOKR codebase.

## Scope of use

- Read calls only (get / search / expand) against Rights/Contract, Programme, Transmission, Schedule object types.
- Duration: ~2 weeks.
- Data classified COMMERCIAL SENSITIVE (deal cost / rights) stays within the staging boundary — not copied out, not sent anywhere except the spike's own server-side LLM proxy for chart generation. (Confirm whether even that is acceptable for staging data, or whether synthetic/seeded data is preferred.)

## Open questions for the env owner

- Is there a staging site with representative rights + schedule data, or should we seed synthetic data?
- Any rate limits / quiet hours I should respect?
- Is sending staging field values to an external LLM (Anthropic) acceptable for this environment, or must the spike use synthetic data for the LLM path?

## Who I think owns this

_(fill in: WHATS'ON core/platform team, or the Mediagenix env owner for test sites)_
