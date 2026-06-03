# WHATS'ON Insights — Solution Design & Development Backlog
**Produced by:** Backlog Builder Agent v2 · GPM Partner Agent v2  
**References:** Core Specification v1.0 · Backlog Builder v5.1 · GPM v2.1  
**Date:** 2026-05-20

---

## ── BACKLOG BUILDER: SOLUTION DESIGN QUALITY GATE ──

**Health Score:**

| Dimension        | Score (1–3) | Notes |
|---|---|---|
| Clarity          | 3 | Domain context established across multiple prior sessions; personas clear |
| Feasibility      | 3 | Technology stack validated in prototype; broadcast data schema confirmed |
| Completeness     | 2 | APIs/interfaces partially specified; external WHATS'ON connector contract to be confirmed |

**Total: 8/9 → PROCEED**

**Unmitigated High Risks:**  
→ WHATS'ON internal API availability for reporting data (see Risk Assessment, EPIC A)

> **⚠ REVIEW 2026-06-04 (yannick):** The high risk above is **resolved**. WHATS'ON 2026r3 exposes four integration surfaces, including a permissioned BAPI2 REST API with a dedicated Rights/Contract sub-API (corpus investigation 2026-05-31 — see Spike A-0 re-scope and Assumption A1 below). Remaining unmitigated high risk is **A4 (Anthropic API procurement)** only. Second standing-decision conflict: Story B-3 rebuilds OKR tracking that BrOKR already provides — flagged for rework at the story (see B-3).

**STRIDE Threat Assessment:**

| Threat | Finding |
|---|---|
| Spoofing | WHATS'ON session token must be validated on every query; AI query endpoint requires auth |
| Tampering | Read-only data access to WHATS'ON — no write paths in scope |
| Repudiation | AI query log required for audit trail |
| Info Disclosure | Amortisation/deal cost data is commercially sensitive — tenant isolation mandatory |
| Denial of Service | AI query endpoint must be rate-limited; Claude API calls are expensive |
| Elevation of Privilege | OKR edit path requires role check; viewer cannot modify targets |

**Compliance Audit:** No PII in scope. Deal cost and rights data classified as COMMERCIAL SENSITIVE — must not leave tenant boundary. No cross-tenant data access permitted.

**Declared Execution Mode: PROTOTYPE**  
Rationale: Architecture is validated by the prototype; glossary is stable; tracer bullet works. We are not yet in DELIVERY because the WHATS'ON connector contract is unconfirmed and one high-risk assumption (internal API shape) is unvalidated.

Mode exits to DELIVERY when: tracer bullet deploys end-to-end with live WHATS'ON data and the connector contract is confirmed.

---

## ── DOMAIN GLOSSARY (v1 — Required, Enforced from PROTOTYPE) ──

| Term | Definition | Code Name |
|---|---|---|
| **Transmission** | A single airing of a licensed title on a channel | `Transmission` |
| **Run** | Synonym for Transmission — use `Transmission` in code | `Transmission` (not `Run` in code) |
| **Runs Licensed** | Total number of airings permitted under a rights contract | `runsLicensed` |
| **Runs Used** | Number of airings that have occurred | `runsUsed` |
| **Runs Remaining** | `runsLicensed − runsUsed` | `runsRemaining` |
| **Amortisation** | Spreading acquisition cost across licensed runs. Residual = `(runsRemaining / runsLicensed) * totalCost` | `Amortisation` |
| **Cost Per Run** | `totalCost / runsLicensed` | `costPerRun` |
| **Residual Value** | Uncommitted rights value remaining in contract | `residualValue` |
| **Rights Window** | The contractual period during which a title may be aired | `RightsWindow` |
| **At-Risk Title** | A title with `runsRemaining ≤ 2` within an active `RightsWindow` | `AtRiskTitle` |
| **Schedule Fill** | Percentage of available slots that are programmed, per daypart per channel | `scheduleFillRate` |
| **Daypart** | Time band: Prime (18:00–23:00), Daytime (06:00–18:00), Overnight (23:00–06:00) | `Daypart` enum |
| **OKR** | Objective and Key Result — a goal with a measurable target | `Objective`, `KeyResult` |
| **Key Result** | A measurable outcome tied to an Objective, auto-populated from WHATS'ON data | `KeyResult` |
| **Insight Story** | A named, saved collection of charts — shareable via link | `InsightStory` |
| **Tenant** | A WHATS'ON customer organisation — all data is scoped to a Tenant | `Tenant` |
| **AI Query** | A natural-language question submitted by a user, resolved to a chart | `AIQuery` |
| **Chart Config** | The structured output of an AI Query — chart type, data, keys, highlights | `ChartConfig` |
| **WHATS'ON Connector** | The internal API adapter that reads from WHATS'ON modules | `WOConnector` |

**Synonym Flag:** "Run" and "Transmission" are synonyms in broadcast parlance. Code uses `Transmission` exclusively. "Runs" appears in UI labels only.

---

## ── ARCHITECTURE MEMORY (v0 — Initial) ──

```
System: WHATS'ON Insights
Version: 0.1 (PROTOTYPE)
Mode: PROTOTYPE → target DELIVERY

COMPONENTS:
  WOConnector       - Reads from WHATS'ON Rights Manager, Schedule Grid, Contract Engine
                      Output: TransmissionRecord[], AmortisationRecord[], ScheduleFillRecord[]
                      Pattern: Repository. Read-only. Tenant-scoped.

  InsightsDataStore - Cached/transformed broadcast data per tenant
                      Storage: PostgreSQL (one schema per tenant)
                      Pattern: Query store — no write paths from user actions

  AIQueryEngine     - Accepts natural language, returns ChartConfig JSON
                      LLM: claude-sonnet-4-20250514 via Anthropic API
                      System prompt: broadcast-domain-aware (Glossary baked in)
                      Pattern: Stateless request/response

  ChartRenderer     - React component — renders ChartConfig to visual output
                      Library: Recharts
                      Pattern: Pure presentational; receives ChartConfig as props

  InsightStoryStore - Persists named InsightStories (chart collections) per tenant
                      Storage: PostgreSQL
                      Pattern: CRUD repository

  OKRStore          - Persists Objectives and KeyResults per tenant
                      Auto-population: KeyResult.actual pulled from InsightsDataStore on schedule

  AuthGateway       - WHATS'ON session token validation; tenant resolution; role check
                      Roles: VIEWER (read), EDITOR (OKR targets), ADMIN (all)

DEPENDENCY RULE:
  Domain (Transmission, Amortisation, OKR) ← Use Cases ← Adapters (WOConnector, ChartRenderer) ← Framework
  AIQueryEngine is an adapter — it never imports domain entities directly; receives/returns plain DTOs

INTEGRATION PATTERN:
  WOConnector → WHATS'ON internal API (REST, sync, read-only)
  AIQueryEngine → Anthropic API (REST, sync, per-query)
  InsightsDataStore ← WOConnector (scheduled refresh, default: hourly)
  OKRStore ← InsightsDataStore (scheduled KR population, daily)

ADRs:
  ADR-001: PostgreSQL for all persistence (multi-tenant schema isolation)
  ADR-002: Recharts for chart rendering (already in WHATS'ON frontend stack)
  ADR-003: claude-sonnet-4-20250514 for AI queries (balance capability/cost)
  ADR-004: Read-only WHATS'ON connector — no write-back in v1
  ADR-005: Tenant isolation via schema-per-tenant (not row-level security — avoids accidental leakage)
  ADR-006: AI query rate limiting at 30 queries/user/hour (cost control)

OPEN QUESTIONS (High-Impact):
  Q1: Shape of WHATS'ON internal reporting API — REST or direct DB? Auth mechanism?
      → ANSWERED 2026-05-31 (corpus 2026r3): BAPI2 REST exists — domain-object JSON API,
        session-token auth (POST /login handshake), per-sub-api OpenAPI discovery (GET /api),
        exchange-type read permissions. Plus: SOAP delta pulls (GetProgramChangeLogsSince),
        reporting-engine JSON push, and direct DB (BrOKR bridge pattern) as fallback.
        Remaining question is narrower: BAPI2 vs reporting-export vs direct DB per data type,
        and live verification of site-specific attribute names. See Spike A-0 (re-scoped).
  Q2: Hosting — embedded in WHATS'ON monolith or separate service?
  Q3: White-label theming — per-tenant or per-channel?
```

---

## ── ASSUMPTIONS LEDGER ──

| ID | Assumption | Impact | Flag |
|---|---|---|---|
| A1 | WHATS'ON exposes an internal REST API for reporting data | HIGH — if false, must negotiate with WHATS'ON core team | ✅ RESOLVED 2026-05-31 — BAPI2 REST confirmed (Rights/Contract sub-API exists); attribute names are site/version-specific, verify live in A-0 |
| A2 | Recharts is already in the WHATS'ON frontend dependency tree | Med — if false, add as dependency | Verify |
| A3 | PostgreSQL is available in the WHATS'ON infrastructure | Med — standard assumption per Core Spec | Reasonable |
| A4 | Anthropic API access approved for production use | HIGH — procurement/legal may need to approve | ⚠ VERIFY |
| A5 | AI query rate of 30/user/hour is sufficient for editorial workflows | Low — adjust based on usage data post-launch | Accepted |
| A6 | WHATS'ON session token is passed in Authorization header | Med — standard assumption | Verify with auth team |
| A7 | OKR targets are set manually by EDITOR role; actuals auto-populate | Low — confirmed in product conversations | Accepted |

---

## ── VALUE HYPOTHESES (GPM Phase 0) ──

**VH-1:** We believe that a natural-language AI query interface for transmission and amortisation data will reduce time-to-insight for rights managers from ~30 minutes (manual Excel) to under 2 minutes. Measured by: time-on-task in usability test with 3 rights managers.

**VH-2:** We believe that an always-current At-Risk Titles dashboard will reduce missed run-limit incidents by >80%. Measured by: count of titles exceeding run limits in the 3 months before vs after launch.

**VH-3:** We believe that embedding OKR tracking inside WHATS'ON (rather than a spreadsheet) will increase OKR review frequency from monthly to weekly for Heads of Programming. Measured by: OKR dashboard view frequency in analytics.

---

## ── SMOKE TEST OUTLINES (GPM Phase 0) ──

**ST-1: AI Query → Chart (Core Flow)**
1. Log in as rights manager (VIEWER role)
2. Type: "Show me which titles are within 2 runs of their limit"
3. Expect: horizontal bar chart rendered, "At-Risk" titles highlighted, insight text visible
4. Type: "Show amortisation residual value by title"
5. Expect: different chart rendered with correct residual values from WHATS'ON data

**ST-2: Dashboard Auto-Refresh**
1. Confirm a transmission occurs in WHATS'ON (simulate via test data)
2. Wait up to 1 hour (or trigger manual refresh)
3. Expect: transmission count updates in dashboard without page reload

**ST-3: OKR Progress**
1. Log in as EDITOR
2. Set a Key Result target for "Drama run utilisation ≥ 85%"
3. Log in as VIEWER
4. Navigate to OKR Tracker
5. Expect: KR shows actual value auto-populated from live data and correct on/off-track status

**ST-4: Tenant Isolation**
1. Log in as Tenant A rights manager
2. Query transmission data
3. Log in as Tenant B viewer
4. Confirm Tenant A data is not visible

---

## ════════════════════════════════════════════════
## BACKLOG
## ════════════════════════════════════════════════

---

# EPIC A — Tracer Bullet: End-to-End AI Query

**Objective:** Deliver a working end-to-end slice from WHATS'ON data → AI natural language query → chart rendered in browser, with auth, tenant isolation, and CI passing.

**Tracer Bullet? YES**  
**Mode: PROTOTYPE**  
**Definition of Done (EPIC-specific):**
- [ ] One AI query resolves to a correct chart using live (or seeded) WHATS'ON data
- [ ] Auth validates WHATS'ON session token; unauthenticated requests return 401
- [ ] CI pipeline runs: lint + unit tests + integration test for query endpoint

**Business Value:** Validates all architectural assumptions in one deployable slice. Enables VH-1 stakeholder demo. Unblocks EPIC B.

**Risk Assessment:**

| Risk | Level | Mitigation |
|---|---|---|
| WHATS'ON internal API shape unknown | ~~HIGH~~ Med (2026-06-04) | API existence confirmed (BAPI2 REST — see A1). Residual risk = site-specific attribute names + auth handshake; A-0 (re-scoped) verifies live before A-1 executes |
| Anthropic API procurement not confirmed | HIGH | Accepted until 2026-06-01 — Owner: Product Lead |
| claude-sonnet-4 returns invalid ChartConfig JSON | Med | Retry with structured output prompt; fallback error state |

**SLO Definitions:**
- `AIQueryEngine – response_time_p95 < 8000ms over 1h` (LLM latency is inherently variable)
- `WOConnector – error_rate < 1% over 24h`

**Runbook Link:** See A-RUNBOOK below.

---

### SPIKE A-0: WHATS'ON Internal API Investigation

> **⚠ REVIEW 2026-06-04 (yannick): RE-SCOPED.** The original question ("does an internal API exist? REST or DB?") is answered by the 2026-05-31 corpus investigation (WHATS'ON 2026r3) and BrOKR's working bridge. Known facts the spike no longer needs to discover:
>
> 1. **Four integration surfaces exist:** (a) **BAPI2 REST** — domain-object JSON API, session-token auth (`POST /login` handshake, not pre-shared Bearer), OpenAPI discovery at `GET /api`, exchange-type read permissions, dedicated Rights/Contract sub-API; (b) **SOAP** (`GetProgramChangeLogsSince` et al.) for change/delta pulls; (c) **reporting engine** with scheduled JSON push to REST endpoints; (d) **direct DB read** (Oracle/PG) — proven today by BrOKR's read-only SELECT-only bridge.
> 2. **Field coverage (corpus-derived BAPI2 map):** 8 fields confirmed (runs licensed via `NumberOfRunsFormula`, total cost via `Contract.contractCost`, rights window via `ExploitationWindow.startDate/endDate`, title, channel, territory, transmissions), 5 derivable (runs used/remaining, cost per run, schedule fill, daypart), 1 partial (genre — needs Content/Product API expand), 1 compute-side (**residual value is NOT exposed as a field** — only `contractCost`; compute via the Glossary formula `(runsRemaining/runsLicensed) × totalCost`). Nothing unreachable. Detail: `broadcastokr/docs/superpowers/plans/2026-05-31-whatson-insights-spike.md`.
>
> **Re-scoped goal:** Live verification + surface selection, not discovery.
>
> **Re-scoped deliverables:**
> - Live-verify corpus-derived BAPI2 attribute names against a real instance (names are site/version-specific)
> - Verify the `POST /login` session-token handshake and read permissions for the Rights/Contract sub-API
> - Decision **per data type**: BAPI2 REST vs reporting-export vs direct DB (recommendation: BAPI2 for structured reads, SOAP deltas for refresh, BrOKR-bridge direct DB as fallback/local path)
> - Confirm genre retrieval cost (second call / expand) is acceptable for the dashboard
> - Contract Snapshot: `WOConnector` interface (unchanged deliverable)
>
> Original spike text retained below for the record.

**ID:** A-0  
**Type:** SPIKE — timeboxed M → **timebox reduced to S (re-scope: verification, not discovery)**  
**Goal:** ~~Determine the exact shape, auth mechanism, and availability of the WHATS'ON internal API~~ Live-verify the BAPI2 contract and select integration surface per data type, for: (1) transmission records, (2) amortisation/rights data, (3) schedule fill.

**Deliverables:**
- API shape document: endpoints, auth, response schemas for all 3 data types
- Decision: REST or direct DB access?
- Contract Snapshot: `WOConnector` input interface (what we call; what we receive)
- Go/No-Go for EPIC A proceeding on current assumptions

**Follow-up:** Story A-1 (WOConnector) OR revised approach if API shape differs significantly.

**Model: Opus** (architectural judgment required) → **Sonnet sufficient post-re-scope (verification against known map)**

**DoR Status:** READY

---

### Story A-1: WOConnector — WHATS'ON Data Adapter

**ID:** A-1  
**Persona Narrative:** As a WHATS'ON Insights system, I want to fetch transmission, amortisation, and schedule fill data from WHATS'ON, so that the Insights layer has current broadcast data without requiring users to export CSVs.

**Business Value:** HIGH (3) — foundational; nothing else works without it  
**Priority Score:** 5/5  

**Acceptance Criteria:**
```gherkin
Given a valid tenant ID and WHATS'ON auth token
When WOConnector.fetchTransmissions(tenantId, dateRange) is called
Then it returns TransmissionRecord[] with: titleId, title, channel, runsUsed, runsLicensed, totalCost, genre, territory

Given an invalid or expired auth token
When any WOConnector method is called
Then it throws UnauthorisedError with message "WHATS'ON token invalid or expired"

Given the WHATS'ON API returns a 5xx error
When WOConnector.fetchTransmissions is called
Then it throws WOConnectorError with upstream status code and retries once before throwing

Given a tenantId that does not match the token's tenant claim
When any WOConnector method is called
Then it throws TenantMismatchError (tenant isolation enforcement)
```

**INVEST:** I✓ N✓ V✓ E✓ S✓ T✓  
**Size:** M  
**External Dependencies:** WHATS'ON internal API (availability confirmed in A-0)  
**Idempotency:** Read-only — not applicable  
**DoR Status:** HOLD pending A-0 — interfaces not yet confirmed  

---

#### Task A-1-T1: WOConnector Interface + Tests

**Hat:** FEATURE  
**Goal:** Define and test the WOConnector interface against the WHATS'ON API contract confirmed in A-0.

**TDD Execution Order:**
1. Write failing tests: happy path fetch, auth error, 5xx retry, tenant mismatch
2. Write WOConnector implementation against confirmed API shape
3. Refactor: extract HTTP client; extract error mapping

**Required Interfaces:**
```typescript
// Contract Snapshot: WOConnector v0.1
interface WOConnector {
  fetchTransmissions(tenantId: TenantId, range: DateRange, token: WOToken): Promise<TransmissionRecord[]>
  fetchAmortisation(tenantId: TenantId, range: DateRange, token: WOToken): Promise<AmortisationRecord[]>
  fetchScheduleFill(tenantId: TenantId, range: DateRange, token: WOToken): Promise<ScheduleFillRecord[]>
}

type TransmissionRecord = {
  titleId: string; title: string; channel: string;
  runsUsed: number; runsLicensed: number; totalCost: number;
  genre: string; territory: string;
}

type AmortisationRecord = TransmissionRecord & {
  runsRemaining: number; residualValue: number; costPerRun: number;
}

type ScheduleFillRecord = {
  channel: string; daypart: Daypart; fillRate: number;
}

enum Daypart { PRIME = 'PRIME', DAYTIME = 'DAYTIME', OVERNIGHT = 'OVERNIGHT' }
```

**Deliverables:** `wo-connector.test.ts` → `wo-connector.ts` → `CONTRACT-SNAPSHOT-WO-CONNECTOR.md`  
**Pull Gate:** A-0 Contract Snapshot confirmed  
**Unblocks:** A-1-T2  
**Confidence:** Med (2) — API shape unconfirmed until A-0  
**Model: Sonnet**

---

#### Task A-1-T2: InsightsDataStore — Seeded Query Layer

**Hat:** FEATURE  
**Goal:** Build the PostgreSQL-backed store that caches WOConnector data per tenant and serves query results.

**TDD Execution Order:**
1. Tests: store + retrieve TransmissionRecord[], AmortisationRecord[], ScheduleFillRecord[] by tenant
2. Implementation: schema migration, repository methods
3. Refactor: extract BaseRepository

**Schema (initial migration):**
```sql
-- Per-tenant schema: insights_[tenant_id]
CREATE TABLE transmissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title_id TEXT NOT NULL, title TEXT NOT NULL, channel TEXT NOT NULL,
  runs_used INT NOT NULL, runs_licensed INT NOT NULL,
  total_cost NUMERIC NOT NULL, genre TEXT, territory TEXT,
  refreshed_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE amortisations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title_id TEXT NOT NULL, runs_remaining INT NOT NULL,
  residual_value NUMERIC NOT NULL, cost_per_run NUMERIC NOT NULL,
  refreshed_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE schedule_fill (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel TEXT NOT NULL, daypart TEXT NOT NULL, fill_rate NUMERIC NOT NULL,
  refreshed_at TIMESTAMPTZ DEFAULT now()
);
```

**Rollback:** Migration numbered; `DOWN` script drops tables and schema.  
**Pull Gate:** A-1-T1 Contract Snapshot for TransmissionRecord/AmortisationRecord/ScheduleFillRecord  
**Unblocks:** A-2-T1  
**Confidence:** High (3)  
**Model: Sonnet**

---

### Story A-2: AIQueryEngine — Natural Language to ChartConfig

**ID:** A-2  
**Persona Narrative:** As a rights manager, I want to type a question about my transmission and amortisation data in plain English, so that I receive a relevant chart without needing to know SQL or pivot tables.

**Business Value:** HIGH (3)  
**Priority Score:** 5/5  

**Acceptance Criteria:**
```gherkin
Given a user submits the query "Which titles are within 2 runs of their limit?"
When AIQueryEngine.resolve(query, tenantId) is called
Then it returns a ChartConfig with chartType "horizontal_bar",
  data containing only titles where runsRemaining ≤ 2,
  and highlights listing each at-risk title with its runsRemaining

Given the Anthropic API returns a non-JSON response
When AIQueryEngine.resolve is called
Then it returns { error: "Could not generate chart — please rephrase" }
  and logs the raw response for debugging

Given a user submits 31 queries in one hour
When the 31st query is submitted
Then the endpoint returns HTTP 429 with message "Query limit reached. Resets in [minutes]."

Given a query referencing data not in the tenant's dataset
When AIQueryEngine.resolve is called
Then it returns a ChartConfig with an empty data array
  and an insight string noting "No data matches this query"
```

**INVEST:** I✓ N✓ V✓ E✓ S✓ T✓  
**Size:** M  
**External Dependencies:** Anthropic API (claude-sonnet-4-20250514)  
**DoR Status:** READY (interfaces confirmed from prototype)

---

#### Task A-2-T1: AIQueryEngine — Prompt + Response Parser

**Hat:** FEATURE  
**Goal:** Implement the AIQueryEngine that sends broadcast-domain-aware prompts to Claude and parses ChartConfig JSON responses.

**TDD Execution Order:**
1. Tests: valid ChartConfig parse, malformed JSON fallback, empty data handling, rate limit enforcement
2. Implementation: prompt builder (injects Glossary + tenant data), Anthropic API call, JSON parser
3. Refactor: extract ChartConfigValidator, extract PromptBuilder

**System Prompt Strategy:**
```
The system prompt MUST include:
- Full Domain Glossary (Glossary terms as defined above)
- Tenant's current data summary (transmission counts, channels, titles)
- ChartConfig JSON schema (strict shape)
- Instruction: "Return ONLY valid JSON. No markdown. No explanation."
```

**Required Interfaces:**
```typescript
// Contract Snapshot: AIQueryEngine v0.1
interface AIQueryEngine {
  resolve(query: string, tenantId: TenantId): Promise<ChartConfig | QueryError>
}

type ChartConfig = {
  chartType: 'bar' | 'horizontal_bar' | 'line' | 'area' | 'pie'
  title: string
  insight: string
  xKey: string
  yKey: string
  data: Record<string, unknown>[]
  highlights: string[]
}

type QueryError = { error: string }
```

**Feature Flag:** `insights.ai_query.enabled` default: `true`  
**Pull Gate:** A-1-T2 InsightsDataStore contract (data format for prompt injection)  
**Unblocks:** A-3-T1  
**TD Created:** TD-001 — System prompt bakes in full dataset; will degrade at scale (> 500 titles). Mitigation: vector search retrieval. Interest: Med. Service in EPIC B.  
**Confidence:** Med (2)  
**Model: Sonnet**

---

### Story A-3: Auth Gateway + Query Endpoint

**ID:** A-3  
**Persona Narrative:** As a WHATS'ON session-authenticated user, I want my Insights queries to be automatically scoped to my tenant's data, so that I never see another organisation's commercially sensitive information.

**Business Value:** HIGH (3) — security gate; nothing ships without this  
**Priority Score:** 5/5  

**Acceptance Criteria:**
```gherkin
Given a request with a valid WHATS'ON session token
When POST /api/insights/query { query: "..." } is called
Then the tenant is resolved from the token and the query executes against that tenant's data only

Given a request with no Authorization header
When any /api/insights/* endpoint is called
Then HTTP 401 is returned with body { error: "Unauthenticated" }

Given a valid token for Tenant A
When the query endpoint is called
Then only Tenant A's data is included in the AI prompt context
  and no Tenant B data appears in the ChartConfig response
```

**Size:** S  
**DoR Status:** READY

---

#### Task A-3-T1: Auth Middleware + Query Endpoint

**Hat:** FEATURE  
**Goal:** Wire AuthGateway middleware to POST /api/insights/query; validate WHATS'ON token; resolve tenantId; call AIQueryEngine; return ChartConfig.

**TDD Execution Order:**
1. Integration tests: valid token → chart, missing token → 401, cross-tenant data → absent from result
2. Middleware: token validation, tenant resolution
3. Endpoint: call AIQueryEngine, return ChartConfig or error

**Pull Gate:** A-2-T1 AIQueryEngine contract  
**Unblocks:** A-4-T1 (CI), END OF STORY SEQUENCE  
**Feature Flag:** `insights.query_endpoint.enabled` default: `true`  
**Confidence:** High (3)  
**Model: Sonnet**

---

### Story A-4: CI Pipeline + Tracer Bullet Smoke Test

**ID:** A-4 (Smoke Test Story)  
**Persona Narrative:** As a developer, I want the CI pipeline to verify the end-to-end query flow on every commit, so that regressions are caught before they reach staging.

**Acceptance Criteria:**
```gherkin
Given any commit to the main branch
When CI runs
Then: lint passes, unit tests pass, integration test for POST /api/insights/query passes with seeded data
  and the pipeline completes in < 5 minutes

Given seeded tenant data (10 titles, mix of at-risk and healthy)
When the query "Which titles are within 2 runs of their limit?" is submitted (mocked LLM)
Then the response ChartConfig contains only at-risk titles
```

**Size:** S  
**DoR Status:** READY

---

#### Task A-4-T1: CI + Integration Smoke Test

**Hat:** FEATURE  
**Goal:** GitHub Actions pipeline: lint → unit tests → integration test (mocked Anthropic API, seeded PostgreSQL) → report.

**Deliverables:** `.github/workflows/ci.yml`, `test/integration/query-smoke.test.ts`, seed data fixture  
**Pull Gate:** A-3-T1 endpoint confirmed  
**Unblocks:** END OF EPIC A  
**Confidence:** High (3)  
**Model: Sonnet**

---

### EPIC A Runbook (A-RUNBOOK)

**Symptoms / Checks / Rollback:**

| Symptom | Check | Action |
|---|---|---|
| AI query times out | Check Anthropic API status; check p95 latency metric | Enable `insights.ai_query.enabled = false`; return static fallback message |
| WHATS'ON connector returns 5xx | Check WHATS'ON API health endpoint | Serve cached InsightsDataStore data; surface staleness warning in UI |
| Wrong tenant data in chart | Check AuthGateway tenant resolution log | Immediately disable query endpoint; escalate to security; audit query logs |
| Database connection failure | Check PostgreSQL connection pool metrics | Auto-restart; if persistent, serve degraded (static last-known data) |

---

# EPIC B — Broadcast Dashboard + OKR Tracker

**Objective:** Deliver the pre-built dashboard (transmission trends, run utilisation, schedule fill, at-risk panel) and the OKR tracker with auto-populated Key Results from WHATS'ON data.

**Tracer Bullet? NO**  
**Mode: PROTOTYPE → target DELIVERY**  
**Definition of Done (EPIC-specific):**
- [ ] Dashboard renders with live data and refreshes on configured schedule
- [ ] OKR tracker displays on-track/off-track status using auto-populated actuals
- [ ] InsightStory can be saved and accessed via shareable link

**Business Value:** Enables VH-2 (at-risk tracking) and VH-3 (OKR frequency). Direct client demo value.

**Risk Assessment:**

| Risk | Level | Mitigation |
|---|---|---|
| Scheduled data refresh conflicts with WHATS'ON load | Med | Schedule refresh at off-peak hours; configurable interval |
| OKR metric mapping ambiguity | Med | Stakeholder sign-off on KR-to-data mapping before B-2 executes |

**SLO Definitions:**
- `InsightsDataStore – data_freshness < 60min over 24h` (hourly refresh)
- `Dashboard – render_time_p95 < 2000ms over 1h`

**TD Items carried forward:**  
- TD-001: System prompt full dataset injection (from A-2-T1) — service in this EPIC via data summarisation

---

### Story B-1: Scheduled Data Refresh

**ID:** B-1  
**Persona Narrative:** As a rights manager, I want the dashboard to reflect the current state of WHATS'ON data without me having to manually refresh, so that my at-risk alerts are always current.

**Acceptance Criteria:**
```gherkin
Given the refresh schedule is set to hourly
When the scheduler triggers
Then WOConnector fetches all data types for all tenants
  and InsightsDataStore is updated within 5 minutes of trigger

Given a WOConnector failure during scheduled refresh
When the refresh job runs
Then the existing InsightsDataStore data is preserved (not wiped)
  and a staleness flag is set with the last successful refresh timestamp
  and an alert is emitted to the ops log

Given data freshness exceeds 90 minutes
When any dashboard loads
Then a banner is displayed: "Data last updated [time ago]. Contact your administrator if this persists."
```

**Size:** M  
**Idempotency:** Refresh job is idempotent — running twice overwrites with same data. No side effects.  
**DoR Status:** READY

---

#### Task B-1-T1: Refresh Scheduler + Staleness Tracking

**Hat:** FEATURE  
**Goal:** Implement scheduled job (cron, hourly) that calls WOConnector for all tenants and updates InsightsDataStore. Track `last_refreshed_at` and staleness flag per tenant.

**Pull Gate:** A-1-T1 WOConnector contract; A-1-T2 InsightsDataStore contract  
**Feature Flag:** `insights.scheduler.enabled` default: `true`  
**Unblocks:** B-2-T1, B-3-T1  
**Confidence:** High (3)  
**Model: Sonnet**

---

### Story B-2: Broadcast Dashboard — Pre-Built Charts

**ID:** B-2  
**Persona Narrative:** As a Head of Programming, I want an always-on overview of transmission trends, run utilisation, schedule fill, and at-risk titles without having to formulate a query, so that I can spot problems in a 30-second morning review.

**Acceptance Criteria:**
```gherkin
Given live data in InsightsDataStore
When the Dashboard view loads
Then it renders: KPI strip (total transmissions, avg utilisation, residual value, at-risk count),
  monthly transmission area chart, run utilisation horizontal bar (colour-coded by threshold),
  schedule fill grouped bar (channel × daypart), at-risk titles alert panel

Given a title has runsRemaining ≤ 2
When the at-risk panel renders
Then that title appears in red with runsRemaining count and residual value displayed

Given a tenantId with no data (first load, before first refresh)
When the Dashboard loads
Then a loading skeleton is displayed with message "Fetching your WHATS'ON data…"
```

**Size:** M  
**DoR Status:** READY

---

#### Task B-2-T1: Dashboard Chart Components

**Hat:** FEATURE  
**Goal:** Build the 4 dashboard chart panels + KPI strip as React components consuming InsightsDataStore data via a query hook.

**Abstraction Check:** ChartRenderer component from prototype — promote to shared component with `chartType` prop. Reuse across AI Query and Dashboard panels.

**Pull Gate:** B-1-T1 data refresh confirmed; InsightsDataStore data shape confirmed  
**Feature Flag:** `insights.dashboard.enabled` default: `true`  
**Unblocks:** B-3-T1  
**Confidence:** High (3)  
**Model: Sonnet**

---

### Story B-3: OKR Tracker — Objectives, Key Results, Auto-Population

> **⚠ REVIEW 2026-06-04 (yannick): FLAGGED FOR REWORK — do not execute as specced.**
>
> This story rebuilds, from scratch, OKR machinery that BrOKR already provides in a more capable form, contradicting the standing product decision (Insights is a *sister product* to BrOKR; reuse the OKR domain model, don't rebuild it):
>
> - **B-3-T1's flat schema** (`objectives`/`key_results` with a fixed `metric_type` enum) is strictly weaker than BrOKR's model: goal templates → per-client/tenant materialization, arbitrary read-only SQL per KR template with per-tenant overrides, direction-aware status, KR history with confidence + notes, check-ins, monitoring mode, sync status/error states, connection rebinding.
> - **The daily auto-population job** duplicates BrOKR's live-KR sync engine (`syncLiveKRBatch` + history pruning), which already handles partial failure per KR.
> - **B-3-T2's UI** duplicates BrOKR's goals/reports views (progress bars, on/off-track badges, three-view reporting with sparklines and trend deltas).
>
> **Required rework before DoR:** Re-spec B-3 as *"Port the BrOKR Goal/KeyResult domain model and sync engine onto Insights' multi-tenant PostgreSQL persistence"* — keep this spec's tenant scoping, role gating (VIEWER/EDITOR), and the auto-population schedule; drop the parallel flat schema and fixed `metric_type` enum in favour of BrOKR's KR-template pattern (query + unit + direction + target). The `lower_better` handling here (incl. the `target = 0` case, e.g. "Zero lapsed rights") is the one piece BrOKR lacks — fold it into the shared domain model rather than keeping two progress formulas.
>
> Existing HOLD (stakeholder KR-to-metric mapping) remains in force in addition to this rework.

**ID:** B-3  
**Persona Narrative:** As a Head of Programming, I want to set OKR targets once and have the actual values pulled from WHATS'ON data automatically, so that I can review weekly progress without touching a spreadsheet.

**Acceptance Criteria:**
```gherkin
Given an EDITOR user sets a Key Result: "Drama run utilisation ≥ 85%"
When the OKR Tracker renders
Then the KR shows: target (85%), actual (calculated from InsightsDataStore), on/off-track badge, progress bar

Given actual > target for a lower-is-better KR (e.g. "Expired unused runs < 5%")
When the KR renders
Then the badge shows "OFF TRACK" in red

Given a VIEWER role user
When the OKR Tracker renders
Then KR targets are visible but the "Edit Target" control is not shown
```

**Size:** M  
**Data Contract:** KR metric types must be agreed with stakeholder before T1 executes (mapping: KR label → data query)  
**DoR Status:** HOLD pending stakeholder sign-off on KR-to-metric mapping **+ HOLD pending B-3 rework (see REVIEW 2026-06-04 above — reuse BrOKR OKR engine, do not rebuild)**  

---

#### Task B-3-T1: OKRStore + KR Auto-Population

**Hat:** FEATURE  
**Goal:** Implement OKRStore (Objectives, KeyResults CRUD) and the daily auto-population job that updates KeyResult.actual from InsightsDataStore.

**Schema:**
```sql
CREATE TABLE objectives (
  id UUID PRIMARY KEY, tenant_id TEXT NOT NULL,
  title TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE key_results (
  id UUID PRIMARY KEY, objective_id UUID REFERENCES objectives(id),
  label TEXT NOT NULL, target NUMERIC NOT NULL, actual NUMERIC,
  unit TEXT NOT NULL, lower_better BOOLEAN DEFAULT false,
  metric_type TEXT NOT NULL, -- enum: DRAMA_UTILISATION, EXPIRED_RUNS, etc.
  last_populated_at TIMESTAMPTZ
);
```

**Pull Gate:** B-1-T1 InsightsDataStore data available; stakeholder KR mapping confirmed  
**Unblocks:** B-3-T2  
**Confidence:** Med (2) — metric mapping dependency  
**Model: Sonnet**

---

#### Task B-3-T2: OKR Tracker UI Component

**Hat:** FEATURE  
**Goal:** React component — renders Objectives with nested KeyResults, progress bars, on/off-track badges. Role-gated edit controls.

**Pull Gate:** B-3-T1 OKRStore contract  
**Unblocks:** B-4-T1  
**Confidence:** High (3)  
**Model: Sonnet**

---

### Story B-4: InsightStory — Save and Share

**ID:** B-4  
**Persona Narrative:** As a rights manager, I want to save a set of charts as a named story and share it via link with my Head of Rights, so that I don't have to re-run the same queries every week.

**Acceptance Criteria:**
```gherkin
Given a user has run 3 AI queries and viewed 2 dashboard panels
When they click "Save Story" and name it "Q2 Rights Review"
Then an InsightStory is created containing references to those chart configs

Given an InsightStory exists
When the user clicks "Share"
Then a read-only link is generated: /insights/story/[story-id]
  and the link is accessible without login (public read-only)
  and the shared view shows a staleness warning if data is > 24h old

Given a VIEWER opens the shared link
Then no edit or query controls are visible
```

**Size:** M  
**Security:** Shared links are unauthenticated. Story content must be snapshotted at share time — no live tenant data in shared view. Prevents data leakage via link.  
**DoR Status:** READY

---

#### Task B-4-T1: InsightStoryStore + Share Link API

**Hat:** FEATURE  
**Goal:** InsightStoryStore (save story, list stories), share link generation, public read-only endpoint `/insights/story/:id`.

**Idempotency:** Story save is idempotent on title per tenant — upsert on (tenantId, title).  
**Feature Flag:** `insights.story_sharing.enabled` default: `false` (opt-in — confirm data residency requirements first)  
**Pull Gate:** B-2-T1 and A-2-T1 ChartConfig shape confirmed  
**Unblocks:** END OF EPIC B  
**TD Created:** TD-002 — Shared story snapshots stored as JSON blob. At scale (> 10k stories), migrate to object storage. Interest: Low. Service when needed.  
**Confidence:** High (3)  
**Model: Sonnet**

---

## ── TECHNICAL DEBT REGISTER ──

| ID | Component | Problem | Type | Principal | Interest | Compounding | Service Decision |
|---|---|---|---|---|---|---|---|
| TD-001 | AIQueryEngine | Full dataset injected into system prompt — degrades at > 500 titles | Architecture | High | Med — grows with catalogue size | YES | Service in EPIC C: introduce vector retrieval to inject only relevant data |
| TD-002 | InsightStoryStore | Story snapshots as JSON blobs in PostgreSQL | Design | Low | Low — object count bounded per tenant | NO | Service when > 10k stories per tenant observed |

---

## ── VALIDATOR SUMMARY ──

**Structure:**
- [x] DAG — no circular dependencies. EPIC A tasks: A-0 → A-1 → A-2 → A-3 → A-4. EPIC B: B-1 → B-2, B-3 (with stakeholder hold), B-4. No cycles.
- [x] EPIC A is tracer bullet — end-to-end slice through all layers
- [x] All tasks have Unblocks + Pull Gate
- [x] Token budgets respected (no task spec exceeds expected code output)
- [x] Anti-bureaucracy test: PASSED — no task spec longer than its expected implementation

**Quality:**
- [x] All stories pass DoR or are explicitly marked HOLD with gaps identified
- [x] All tasks declare Hat (FEATURE for all tasks in PROTOTYPE mode — no REFACTORING tasks yet)
- [x] TDD order declared in all tasks
- [x] No Two Hats violations
- [x] Glossary consistent — "Transmission" used throughout; "Run" appears in UI label guidance only
- [x] ADR-001 through ADR-006 cover all cross-cutting decisions

**Testing:**
- [x] Critical paths tested: auth, tenant isolation, AI query parse, at-risk calculation
- [x] External integrations (Anthropic API, WHATS'ON API) have mock strategies declared
- [x] Schema changes have migration + rollback script
- [x] E2E smoke test story present (A-4)

**Risk & Debt:**
- [x] All High risks have mitigations or accepted-with-date + owner
- [x] No PII in scope — COMMERCIAL SENSITIVE classification applied
- [x] All shortcuts recorded as TD Items (TD-001, TD-002)
- [x] Assumptions Ledger present with HIGH-impact items flagged

**Operations:**
- [x] SLO definitions per EPIC
- [x] Runbook present for EPIC A
- [x] Feature flags declared for all user-facing changes
- [x] Idempotency defined for all write paths (refresh job, story upsert)

**Economics:**
- [x] Anti-bureaucracy test PASSED
- [x] No over-decomposition below token budget floor
- [x] Spike A-0 correctly blocks A-1 — not generating spec for unknown interface

---

## ── AGENT ROUTING FOR EXECUTION ──

| Task | Recommended Model | Rationale |
|---|---|---|
| A-0 (Spike) | **Opus** | Architectural judgment; API trade-off analysis |
| A-1-T1 | **Sonnet** | Code generation from confirmed spec |
| A-1-T2 | **Sonnet** | Schema + repository from clear spec |
| A-2-T1 | **Sonnet** | Prompt builder + parser from spec; **Opus** for prompt engineering iteration |
| A-3-T1 | **Sonnet** | Middleware wiring from clear spec |
| A-4-T1 | **Haiku** | CI YAML + fixture generation |
| B-1-T1 | **Sonnet** | Scheduler implementation |
| B-2-T1 | **Sonnet** | React chart components |
| B-3-T1 | **Sonnet** | OKR store + auto-population |
| B-3-T2 | **Sonnet** | React OKR UI |
| B-4-T1 | **Sonnet** | Story store + share link |

---

## ── ITERATION WORKFLOW ──

```
NOW:
  Run A-0 (Spike) → confirm WHATS'ON API shape
  If confirmed → execute A-1, A-2, A-3, A-4 in order (pull-based)
  Stakeholder smoke test ST-1 after A-4 passes

AFTER EPIC A:
  Produce Phase Summary
  Update Architecture Memory (connector contract confirmed, ADRs updated)
  Retrospective: rework rate, cycle time, assumption failures
  Refine EPIC B backlog (especially B-3 KR mapping with stakeholder)
  Mode check: escalate to DELIVERY if tracer bullet clean

EPIC B SEQUENCE:
  B-1 (unblocks B-2, B-3) → B-2 → B-3 (after stakeholder KR sign-off) → B-4
  Stakeholder smoke tests ST-2, ST-3, ST-4

EPIC C (Future — not yet decomposed):
  White-label theming per tenant
  TD-001 service: vector retrieval for AI query context
  Performance hardening (SLO verification)
  Mode: DELIVERY → HARDENING
```

---

## ── PRODUCT VALUE TRACKING ──

| Value Hypothesis | Measurement Method | Baseline | Target | Review Date |
|---|---|---|---|---|
| VH-1: Time-to-insight < 2 min | Usability test (3 rights managers, timed task) | ~30 min (manual) | < 2 min | Post-EPIC A demo |
| VH-2: At-risk incidents -80% | Count titles exceeding run limit (3mo before/after) | TBD from WHATS'ON history | -80% | 3 months post-launch |
| VH-3: OKR review frequency ×4 | Dashboard analytics view count per user per week | ~1/month | ~1/week | 1 month post-EPIC B |
