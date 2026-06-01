# BroadcastOKR — Partnership Brief for Mediagenix

**Date:** 2026-06-01
**From:** Yannick Verrydt
**Purpose:** Propose BroadcastOKR + WHATS'ON Insights as a commercial WHATS'ON add-on, delivered as a hybrid SaaS, sold to/through the Mediagenix broadcaster base.

---

## The one-liner

**An OKR + AI-insights layer purpose-built for WHATS'ON.** Broadcasters set operational goals (run utilisation, schedule fill, rights compliance, acquisition-to-air) and watch them update automatically from live WHATS'ON data — plus ask questions in plain English and get charts back. It turns WHATS'ON's operational data into management visibility, without anyone exporting another spreadsheet.

## The problem it solves

Heads of Programming and Rights Managers run their objectives in Excel, manually re-keyed from WHATS'ON reports. Reviews are monthly because the data is stale the moment it's pasted. Missed run-limits and lapsed rights are commercially costly and only surface after the fact. There is no goal-tracking layer native to WHATS'ON.

## What it is (already built)

A working product, not a concept:
- **OKR tracking** with Key Results auto-populated from live WHATS'ON Oracle/PostgreSQL via SELECT-only SQL.
- **Multi-client / multi-channel** goals, templates materialised per client, historical tracking with check-in confidence + notes, three-view reporting.
- **A read-only connector** (the "bridge") already speaks to WHATS'ON databases — the on-prem half of the SaaS already exists.
- Production-ready for internal use today (see PRODUCTION-READINESS.md): authenticated, rate-limited, SQL-injection-defended, 0 dependency vulnerabilities, CI + E2E.
- **WHATS'ON Insights** (designed, BAPI2-validated): natural-language → chart over the same data, as a premium tier.

## Why a partnership (what each side brings)

| Mediagenix brings | BroadcastOKR brings |
|---|---|
| Warm access to the WHATS'ON installed base | A built, WHATS'ON-native product (not vapourware) |
| Vendor trust, contracts, security/compliance umbrella | The connector + OKR engine + Insights design |
| Domain credibility, WHATS'ON roadmap alignment | Ongoing product development & support |
| EU data-residency posture (matters for VRT et al.) | Fast iteration outside the core WHATS'ON release train |

The hard, expensive thing in this market is **trust and access to broadcasters** — Mediagenix already has it. The hard *technical* thing is **a WHATS'ON-native data connector + OKR/AI product** — BroadcastOKR already has it. The partnership pairs the two.

## Delivery model: hybrid (cloud + on-prem connector)

- **Cloud control plane** (hosted): accounts, multi-tenant OKR storage, web UI, billing, the Insights AI engine.
- **On-prem connector agent** (per customer): the existing bridge, evolved to dial outbound to the cloud — **no inbound firewall changes**, commercially-sensitive deal/rights data stays under the customer's control, only the metrics they choose flow up.

This sidesteps the usual SaaS blocker (reaching each broadcaster's on-prem WHATS'ON DB) and keeps data-residency clean.

## Commercial model

Vertical B2B, annual contracts, sales-assisted:
- **Per-channel base** + **per-seat** (editors/managers; viewers free to drive adoption).
- **Tiers:** Starter (manual OKRs, dashboards) → Pro (live KRs, history, multi-client, templates) → **Enterprise (Insights AI, SSO, audit, SLA)**.
- **Insights AI** metered (NL queries), LLM cost passed through — the margin-expanding upsell.

**Revenue share** to be agreed — options range from Mediagenix reselling (their paper, rev-share to BrOKR) to white-label inside WHATS'ON (deeper integration, larger Mediagenix share). Open to either; white-label simplifies GTM.

## The ask

1. A scoping conversation: appetite, preferred integration depth (reseller vs white-label), rev-share shape.
2. Access to **one design-partner broadcaster** for a paid pilot.
3. Alignment on data-residency / security expectations so we build to the right bar from day one.

## What happens next if yes

A first paying pilot is months, not quarters, away — most of the backend exists. Sequence: real auth + multi-tenant isolation → connector-agent tunnel → billing → design-partner pilot → compliance as deals demand. (Technical detail in the migration plan.)
