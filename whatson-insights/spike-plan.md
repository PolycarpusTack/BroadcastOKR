# WHATS'ON Insights — Validation Spike (Sister Product)

**Status:** 📋 PROPOSED
**Created:** 2026-05-31
**Type:** SPIKE — timeboxed, 1–2 weeks
**Depends on:** None (greenfield, separate from BrOKR codebase)
**Decides:** Go / No-Go on standing up WHATS'ON Insights as a Mediagenix sister product to BrOKR

---

## Context

WHATS'ON Insights is proposed as a **Mediagenix commercial suite product** (multi-broadcaster): natural-language querying + pre-built dashboards + OKR tracking over WHATS'ON broadcast data. It is a *sister* to BroadcastOKR (BrOKR), not a module inside it — Insights needs a multi-tenant cloud backend, which contradicts BrOKR's deliberately local-first design (Electron, localStorage, no backend auth).

Source artifacts (repo root, untracked): `whatson-insights-solution-design.md` (full backlog/design) and `whatson-insights.jsx` (visual prototype — reference only; violates BrOKR conventions).

**What's already de-risked** (verified against `C:\whatsOn\corpus-archive\base\2026r3` + `REPORTING_ANALYSIS_2026r3.md`):
- The design's #1 risk — "does WHATS'ON expose a reporting API?" (assumption A1) — is **resolved: yes.** WHATS'ON 2026r3 ships a modern **BAPI2 REST API** (`application/json`; `BAPIRESTInterface` + per-domain sub-APIs). Verified from corpus:
  - **Auth:** `POST /login` (BAPI login, `isBAPILogin: true`) returns a session token — NOT a pre-shared Bearer key. Connector must do a login handshake first.
  - **Discovery:** `GET /api` (per sub-api) returns an **OpenAPI YAML** definition (`application/yaml`, or `application/json` via `.json` subtype) — the machine-readable, **site-specific** attribute schema including custom attributes.
  - **Query:** REST query parameters with typed retrieval (date as `[yyyy]-[mm]-[dd]`, LOT/enum by `apiReference`, references), plus get / search / **expand** handlers.
  - **A dedicated Rights/Contract sub-API exists** (corpus: JOS-51530 "Create Rights API", JOS-51564 "API2.0 GET contract call") — i.e. the amortisation/rights/contract data Insights needs is a first-class API surface, not just a DB table. This sharply lowers the Task 1 field-coverage risk.
- The OKR auto-population engine is **already built** in BrOKR (Live KRs via SQL bridge). Insights should reuse/embed it, not rebuild design Story B-3.
- Chart rendering is proven both sides (Recharts).

**What remains unproven** — this spike targets exactly these three:
1. **Product value (the real bet):** does NL-query→chart actually cut rights-managers' time-to-insight (hypothesis VH-1: ~30 min → <2 min)? No API confirmation de-risks this; only users do.
2. **Field coverage:** the corpus confirms the *surfaces* exist but contains **no captured table/column schema**. We must confirm BAPI2 actually exposes the rights/amortisation fields Insights needs (runs licensed/used, total cost, residual, rights window, schedule fill).
3. **Production LLM approval:** Anthropic API for production use (design assumption A4) — procurement/legal, started in parallel.

## Goal

Produce a **Go/No-Go decision** backed by evidence on all three unknowns, plus a thin end-to-end tracer (BAPI2 → Claude → chart) running against real or staging WHATS'ON data. No multi-tenant backend, no Postgres, no auth system is built in this spike — those come only if the decision is Go.

## Decision target (target connector: BAPI2 REST)

Per decision on 2026-05-31, the spike targets **BAPI2 REST** as the primary read surface (permissioned, JSON, version-stable, multi-tenant-friendly — strongest fit for a cloud product and it reinforces the design's tenant-isolation/STRIDE story). SOAP `GetProgramChangeLogsSince` is noted as the future delta path but is **out of scope** for the spike. The BrOKR direct-DB bridge is the documented fallback if BAPI2 field coverage proves insufficient (see Task 1 exit branch).

## Constraints

- **Timebox: 10 working days.** If field coverage (Task 1) fails, stop and report — do not pivot into a DB-bridge build within the spike.
- Throwaway-quality is acceptable for the tracer; this is a learning exercise, not delivery. Mark all code `SPIKE — not for production`.
- Keep BrOKR untouched. The spike lives in a scratch dir / separate repo, not in `broadcastokr/`.
- Secrets (Anthropic key, BAPI token) never reach the browser — proxied server-side. The prototype's browser-side `api.anthropic.com` call is the explicit anti-pattern to avoid.
- Reuse BrOKR's conventions for any UI kept beyond the spike (theme-as-prop, `PRIMARY_COLOR`, named fonts, no default exports) — but don't over-invest in polish during the spike.

---

## Tasks

### Task 1 — BAPI2 field-coverage check (Day 1–2) — GATING

**Goal:** Confirm BAPI2 exposes the fields Insights needs, on a real site.

**Steps:**
1. Obtain a BAPI2 base URL + login credentials for a test/staging WHATS'ON site. `POST /login` to get a session token (BAPI login handshake — not a pre-shared key).
2. `GET /api` (`.json`) on each candidate sub-API to pull its **OpenAPI definition** — start with the **Rights/Contract API** (confirmed to exist) plus programme/transmission/schedule APIs. Discover exact object/attribute names from the definitions (they're site-specific, incl. custom attributes).
3. Map design fields → BAPI2 attributes:
   - runs licensed / runs used / runs remaining
   - total cost / cost per run / residual value (amortisation) ← **check the Rights/Contract API first**
   - rights window (start/end), title, channel, genre, territory
   - schedule fill (per channel × daypart) ← most likely from planning/schedule API, may need derivation
4. Pull a real sample (get/search with query params, `expand` where needed) and confirm values are present and sane — not just declared in the OpenAPI.

**Exit / branch:**
- ✅ **Full coverage** → proceed to Task 2 with BAPI2.
- ⚠️ **Partial** (e.g. amortisation/residual not in BAPI2) → record which fields are missing; check whether the **reporting engine** (XPath→JSON) or **direct DB** exposes them. If a documented fallback covers the gap, note it for the design and proceed with the fields BAPI2 does cover. If core rights/cost fields are unreachable by any surface → **No-Go signal**, stop and report.

**Deliverable:** `bapi2-field-map.md` — design field → BAPI2 attribute (or gap + fallback), with one captured sample payload.

**Pre-mapped from corpus (2026-05-31) — verify these live rather than discover from scratch.** A corpus search of `BAPIRights_v1_*` and `BAPILinearSchedule_v1_Transmission` already produced this map; Task 1 is now *confirm on a live site*, not *discover*:

| # | Analytics field | Status | BAPI class · attribute (JSON path) |
|---|---|---|---|
| 1 | runs licensed | ✅ confirmed | `BAPIRights_v1_NumberOfRunsFormula` · `numberOfRuns.value` (+ `countType`: Count/Cumulative/Unlimited) |
| 2 | runs used | ⚙ derive | count `BAPILinearSchedule_v1_Transmission` where `runType`/date ≤ today (`runNumber`/`calculatedRunNumber`) |
| 3 | runs remaining | ⚙ derive | (1) − (2) |
| 4 | total cost | ✅ confirmed | `BAPIRights_v1_Contract` · `contractCost` (+ `currency`) |
| 5 | cost per run | ⚙ derive | (4) ÷ (1) |
| 6 | residual / amortisation | ⚠ **not exposed** | no amortisation schedule in BAPI; only single `contractCost`. **Compute Insights-side** from cost + runs (design's own formula). Confirm during Task 1 whether any cost-allocation field exists; else this is an Insights-computed metric, not a WHATS'ON read. |
| 7 | rights window start/end | ✅ confirmed | `BAPIRights_v1_ExploitationWindow` · `startDate`/`endDate` (+ `*DateFormula`) |
| 8 | title / programme | ✅ confirmed | transmission `title` (`calculatedMainTitle`) + `contentId`; `BAPIContent_v1_ProductTitle` for variants |
| 9 | channel | ✅ confirmed | `BAPILinearSchedule_v1_Transmission` · `channel` (LOT) |
| 10 | genre | ◐ partial | not on transmission; via Content/Product API (`PSIGenre` LOT) — needs a second call/expand |
| 11 | territory | ✅ confirmed | `BAPIRights_v1_ExploitationWindow` · `regionGroups` |
| 12 | transmissions/airings | ✅ confirmed | `BAPILinearSchedule_v1_Transmission` (`GET /transmissions`, has SearchObject for filtering) |
| 13 | schedule fill | ⚙ derive | count transmissions ÷ available slots (template/daypart) — no direct metric |
| 14 | daypart | ⚙ derive | classify transmission `startTime` against daypart bands client-side |

**Scorecard:** 8 confirmed in BAPI · 5 derivable from confirmed data · 1 partial (genre, second call) · **1 genuine gap (residual/amortisation — compute Insights-side).** No field is unreachable. Core entities: `BAPIRights_v1_Contract`, `BAPIRights_v1_ExploitationRight_basic`, `BAPIRights_v1_ExploitationWindow`, `BAPILinearSchedule_v1_Transmission`.

So Task 1's live work shrinks to: (a) log in, (b) pull `GET /api` for the Rights + LinearSchedule sub-APIs and diff against the table above (attribute names are version/site-specific), (c) sample a real contract + its transmissions to confirm the derive-chain (1→2→3, 4→5) produces sane numbers, (d) settle the residual/amortisation gap.

### Task 2 — Server-side connector + LLM proxy (Day 3–5)

**Goal:** A minimal backend (single tenant, no auth system) that: reads from BAPI2, and resolves an NL query to a `ChartConfig` via Claude — both with secrets server-side.

**Steps:**
1. Tiny service (Node/Express — mirror BrOKR's bridge style) with two endpoints:
   - `GET /insights/data` — calls BAPI2 with the Bearer token (from env), returns normalized records.
   - `POST /insights/query {query}` — builds a broadcast-domain prompt (glossary from the design + a **summary** of the tenant data, not the full dump — avoid design TD-001), calls Claude with **structured output** for the `ChartConfig` schema, returns validated JSON or a graceful error.
2. Use the current model (`claude-sonnet-4-6` or latest) with the Anthropic SDK + **prompt caching** on the static system prompt. (The design's pinned `claude-sonnet-4-20250514` is stale.)
3. `ChartConfig` shape per the design (`chartType`, `title`, `insight`, `xKey`, `yKey`, `data[]`, `highlights[]`). Validate at the tool-call layer so the model retries on mismatch.

**Deliverable:** running service + a short `connector-notes.md` (latency observed, prompt structure, failure modes).

### Task 3 — Thin UI tracer (Day 6–7)

**Goal:** One screen: query box + suggestion pills + `ChartRenderer`, calling the Task 2 endpoint.

**Steps:**
1. Reuse the prototype's `ChartRenderer` switch (bar/hbar/line/area/pie) **rewritten to BrOKR conventions** (theme-as-prop, named exports, `PRIMARY_COLOR`/Space Grotesk/IBM Plex/JetBrains Mono — not the prototype's amber/inline `C`).
2. Wire the 5–6 PILL queries from the design to real BAPI2-backed data.
3. Loading / empty / error states (no key in the browser).

**Deliverable:** clickable tracer (BAPI2 → Claude → chart) on real/staging data.

### Task 4 — VH-1 user test (Day 8–9) — the actual bet

**Goal:** Evidence on whether this saves time, not just whether it runs.

**Steps:**
1. Recruit 2–3 rights/scheduling people (internal VRT or Mediagenix domain staff).
2. Timed task: answer 3 realistic questions (e.g. "which titles are within 2 runs of their limit?", "residual value by title", "off-track OKRs") — first via their **current** method (Excel/WHATS'ON reports), then via the tracer.
3. Capture: time-on-task delta, query success rate (did the chart answer the question?), where Claude misread the domain, trust/qualitative reaction.

**Deliverable:** `vh1-findings.md` — baseline vs tracer times, success rate, top failure patterns.

### Task 5 — Go/No-Go writeup (Day 10)

**Goal:** Decision + evidence + next-step shape.

**Contents:**
- Field coverage verdict (Task 1) and chosen connector posture (BAPI2 ± fallback).
- VH-1 result vs the <2 min target.
- LLM quality notes (structured-output reliability, domain accuracy, latency vs the design's p95 < 8s SLO).
- Anthropic procurement status (A4).
- **Recommendation:** Go (→ stand up the sister product on the design's EPIC-A tracer, connector retargeted to BAPI2) / No-Go / Iterate.
- If Go: confirm what's reused from BrOKR (OKR engine, ChartConfig/ChartRenderer contract, component library) vs net-new (multi-tenant Postgres, AuthGateway, scheduled refresh).

**Deliverable:** `go-no-go.md`.

---

## Out of scope (deferred to product build, only if Go)

- Multi-tenant Postgres + schema-per-tenant (design ADR-001/005)
- AuthGateway / RBAC / rate limiting (design Story A-3, A-2 limits)
- Scheduled refresh + staleness (design Story B-1)
- InsightStory save/share (design Story B-4)
- SOAP delta integration (`GetProgramChangeLogsSince`)
- OKR tracker rebuild — **reuse BrOKR instead**, do not implement design Story B-3

## Risks

| Risk | Level | Mitigation |
|---|---|---|
| BAPI2 lacks amortisation/residual fields | Low (was Med) | **Confirmed in corpus: not exposed.** Mitigation: compute Insights-side from `contractCost` + runs (design's own residual formula). This is a known design decision now, not a discovery risk. |
| No staging site / login access | High | Confirm BAPI2 base URL + `POST /login` credentials **before** day 1; this blocks the whole spike |
| Schedule-fill not a direct field | Med | Likely derived (programmed slots ÷ available slots) from planning API — flag in Task 1, derive in connector if needed |
| Claude misreads broadcast domain | Med | Glossary in system prompt + structured output + VH-1 captures failure patterns |
| Can't recruit domain testers | Med | Line up 2–3 participants during Task 1–2, not at day 8 |
| Anthropic prod approval slow (A4) | Med | Start procurement in parallel day 1; spike can use dev key, product build cannot |

## Success criteria

The spike succeeds (regardless of Go/No-Go) if it produces, with evidence: (1) a BAPI2 field-coverage verdict, (2) a measured VH-1 time delta, (3) LLM quality/latency observations, and (4) a clear recommendation. A "No-Go, here's why" outcome on real evidence is a successful spike.
