# WHATS'ON Insights — Product One-Pager

**Date:** 2026-05-31
**Author:** Yannick Verrydt
**Decision sought:** Approval to run a 2-week validation spike toward a Mediagenix sister product

---

## The idea

**WHATS'ON Insights** — a broadcast analytics layer over WHATS'ON data with three capabilities:
1. **Ask-your-data:** type a question in plain English ("which titles are within 2 runs of their limit?"), get a chart + insight back. No SQL, no pivot tables.
2. **Pre-built dashboards:** transmission trends, run utilisation, schedule fill, at-risk titles.
3. **OKR tracking:** objectives with key results auto-populated from live WHATS'ON data.

## Why now / why it fits the suite

- **Same platform, same customers** as BroadcastOKR (BrOKR) — VRT/Mediagenix WHATS'ON. Shared domain vocabulary, shared React/Recharts stack.
- **The hard integration risk is already retired.** WHATS'ON 2026r3 ships a modern **BAPI2 REST API**, including a **dedicated Rights/Contract API** — so the amortisation/rights/cost data Insights needs is a first-class API surface, not a fragile DB scrape. (Verified against the WHATS'ON source corpus.)
- **Half the product already exists.** BrOKR already does auto-populated OKRs (Live Key Results via SQL). Insights **reuses** that engine rather than rebuilding it.

## Sister product, not a BrOKR feature — and why

BrOKR is deliberately **local-first**: Electron desktop, localStorage, single-user, no backend auth. Insights needs the opposite — a **multi-tenant cloud backend** (Postgres, auth, rate limiting) because it's a commercial play across multiple broadcasters. Cramming that into BrOKR would wreck BrOKR's identity. So: **separate product, shared libraries.**

| Shared across the suite | Insights-specific (net new) |
|---|---|
| BAPI2 connector library | Multi-tenant Postgres (schema-per-tenant) |
| ChartConfig / ChartRenderer contract | AuthGateway, RBAC, rate limiting |
| OKR domain model + Live-KR engine (from BrOKR) | Scheduled data refresh, LLM query engine |
| Component library, theme | Save/share "Insight Stories" |

## What we're NOT yet sure of (what the spike tests)

1. **Value:** does NL-query→chart actually cut time-to-insight (target: ~30 min → <2 min)? Only users can answer that.
2. **Field coverage:** corpus confirms the API *surfaces* exist; the spike confirms the *exact* rights/amortisation fields come through.
3. **LLM in production:** Anthropic procurement/legal approval (in parallel).

## The ask

- **2-week timeboxed spike** (plan: `2026-05-31-whatson-insights-spike.md`). Builds a thin tracer (BAPI2 → Claude → chart) on staging data and runs a timed test with 2–3 rights managers. Output: a Go/No-Go with evidence.
- **To unblock it:** (a) staging WHATS'ON access + BAPI2 login, (b) start Anthropic prod approval, (c) 2–3 domain testers for week 1.
- **A "No-Go with evidence" is a successful spike** — we'd have spent days, not quarters, to learn it.

## If Go

Stand up Insights on the design's EPIC-A tracer bullet (connector retargeted to BAPI2), positioned in the WHATS'ON suite alongside BrOKR, sharing the libraries above.
