# BroadcastOKR — Local-First → Hybrid Multi-Tenant SaaS Migration Plan

**Date:** 2026-06-01
**Status:** PLAN (strategy approved; execution gated on Mediagenix partnership scope)
**Model:** Hybrid — cloud control plane + on-prem connector agent. Sold via Mediagenix.
**Companion:** `2026-06-01-mediagenix-partnership-brief.md`

> **Guardrail:** The local-first desktop BrOKR stays as-is for internal use. This is a NEW cloud build that SHARES libraries (domain model, ChartConfig/ChartRenderer, UI components, connector) — not a rewrite of the Electron app. Do not let SaaS concerns (multi-tenant auth, cloud persistence) leak back into the desktop product. Same discipline as the Insights sister-product decision.

---

## Target architecture

```
CLOUD CONTROL PLANE (hosted, multi-tenant)
  Identity (OIDC/SSO, MFA) ─ server-enforced RBAC
  Tenant registry + provisioning
  OKR/Tasks/Templates store  ── Postgres, schema-per-tenant (ADR-005)
  Billing + entitlements (Stripe/Paddle) ── tier gates
  Web UI (React app, API base re-pointed)
  Insights AI engine (Enterprise tier, metered)
  Agent gateway (mTLS, enrolment, command/data channel)
        ▲ outbound tunnel (agent dials out)
        │
CUSTOMER SITE (per tenant)
  Connector Agent  =  today's bridge, evolved
    ├─ reads WHATS'ON Oracle/PG (SELECT-only — unchanged)
    ├─ runs live-KR SQL on schedule, pushes results up
    └─ enrolment token, outbound-only, no inbound ports
```

## What's reused vs. new

| Component | Today | Disposition |
|---|---|---|
| WHATS'ON DB read (`bridge/server.cjs`, SELECT-only, `assertSelectOnly`, crypto) | ✅ exists | **Reuse** as agent core |
| Live-KR SQL exec + batch (`/api/kpi/execute-batch`) | ✅ exists | **Reuse** in agent |
| SQLite data layer + migrations + CRUD routes | ✅ exists | **Port** SQLite schema → Postgres schema-per-tenant; CRUD logic mostly reusable |
| Sync model (`bridgeSync.ts`, fetchState/changes, dual-write) | ✅ exists | **Evolve** into agent↔cloud channel |
| React UI, pages, components, ChartRenderer | ✅ exists | **Reuse**; re-point API base from local bridge → cloud |
| OKR/KR/Template domain model + types | ✅ exists | **Reuse** (shared lib across desktop + SaaS) |
| Auth (`middleware/auth.cjs` single API key) | ⚠ single-key | **Replace** with real identity + RBAC |
| Persona switch (frontend `AuthContext`) | ⚠ demo only | **Replace** with server-enforced sessions |
| Rate limiting (`middleware/rateLimit.cjs`) | ✅ exists | **Reuse / extend** per-tenant |
| Insights AI engine | 📐 designed (BAPI2-validated) | **Build** as Enterprise tier |
| Billing, tenancy, provisioning, agent gateway, observability | ❌ none | **Build new** |

**Estimated reuse: ~50–60% of the backend already exists in some form.** The genuinely new surface is identity, tenancy, billing, and the agent gateway.

---

## Phases (each independently shippable / demoable)

### Phase S1 — Identity & server-enforced RBAC  *(gating — nothing monetizable without it)*
- Real accounts; OIDC/SSO (broadcasters will expect Azure AD / Okta), MFA.
- Move roles (Owner/Manager/Member) from frontend `AuthContext` to **server-side enforcement** on every mutation. The current persona switch becomes a real boundary.
- Session management, token rotation.
- **Exit:** a user can only do what their server-side role permits; verified by tests that bypass the UI.

### Phase S2 — Multi-tenancy
- Tenant registry; schema-per-tenant Postgres (per Insights ADR-005 — chosen over row-level security to avoid accidental cross-tenant leakage of COMMERCIAL-SENSITIVE data).
- Port the existing `001-initial-schema.sql` (12 tables) to a per-tenant Postgres template.
- Tenant provisioning/onboarding flow.
- **Exit:** two tenants, hard isolation proven (Tenant A data never appears for Tenant B — mirrors Insights smoke test ST-4).

### Phase S3 — Connector agent
- Evolve `bridge/` into an installable agent: enrolment token, **outbound mTLS tunnel** to the cloud agent-gateway (no inbound ports), per-tenant identity.
- Agent runs live-KR SQL on schedule, pushes only chosen metrics up (deal-cost detail stays on-prem unless explicitly surfaced).
- Packaging: Docker (already have `bridge/Dockerfile`) + a simple installer for on-prem ops.
- **Exit:** agent at a simulated customer site feeds a cloud tenant over outbound-only; firewall-friendly.

### Phase S4 — Billing & entitlements
- Stripe/Paddle: plans (per-channel base + per-seat), trials, invoicing.
- **Entitlement gates** in the app: tier unlocks features (live KRs = Pro, Insights AI + SSO + audit = Enterprise). Seat counting, channel counting.
- Usage metering for Insights NL queries (pass-through LLM cost).
- **Exit:** a tenant subscribes, gets gated features, is billed; downgrade revokes access cleanly.

### Phase S5 — Compliance & operations  *(depth driven by Mediagenix umbrella + first deals)*
- EU data residency (VRT is Belgian) — host in EU region.
- Audit logging (the Insights design flagged AI-query audit trail as mandatory), encryption at rest, DPA/GDPR, retention.
- Observability, alerting, SLA, backup/DR (extend the existing manual `/api/sync/backup`), staging→prod pipeline.
- SOC2/ISO27001 as deals demand (may be partially covered under Mediagenix's umbrella — confirm in partnership scoping).
- **Exit:** passes a customer security review / Mediagenix vendor bar.

### Phase S6 — Insights AI (Enterprise tier)
- Execute the existing Insights spike + build (BAPI2 connector, NL→ChartConfig, dashboards). See the parked Insights artifacts.
- Ships as the Enterprise differentiator, metered.
- **Exit:** Enterprise tenant runs NL queries against live data; VH-1 (time-to-insight) validated with real users.

## Sequencing notes
- **S1 → S2 → S3** is the critical path to a functioning multi-tenant pilot. S4 can run partly parallel to S3. S5 is continuous, depth-on-demand. S6 is the upsell layer, after a paying base exists.
- **Don't build S5 compliance ahead of demand** — scope it to what the first design-partner deal (under Mediagenix) actually requires.
- A **design-partner pilot can run after S1–S3** with a hand-set plan (skip full S4 billing) to validate before investing in compliance/AI.

## Key risks
- **Auth is the keystone** — every monetizable feature depends on the S1 identity boundary. Do it first, do it properly.
- **Partner dependency** — Mediagenix scope (reseller vs white-label, their auth/hosting?) can reshape S1/S5. Keep the connector generic enough that "broaden beyond WHATS'ON" stays open.
- **Data-residency & sensitivity** — deal-cost/rights data is COMMERCIAL-SENSITIVE; the agent's "push only chosen metrics" design is a feature, not an afterthought.
- **Scope discipline** — resist letting SaaS architecture contaminate the desktop app.

## Rough effort
First paying pilot (S1–S3 + hand-set plan): a few focused months given existing backend. Full self-serve SaaS (through S5): meaningfully more, and partnership-scope-dependent.
