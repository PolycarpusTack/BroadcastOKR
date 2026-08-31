# Amendment — Two Editions, One Codebase (2026-08-31)

**Status:** DECIDED (product direction set 2026-08-31)
**Amends:** `2026-06-01-saas-migration-plan.md`
**Strategy page:** https://claude.ai/code/artifact/40399b2f-d87d-4387-a28a-6cd866c80bb7

## Decision

BrOKR ships as **two cloud editions plus the existing desktop app, from one codebase**:

1. **Client Edition** — one dedicated instance per client on the Mediagenix cloud
   (A+E, VRT, Disney, …). The client's broadcast teams set and track their own
   OKRs/KPIs against their own WHATS'ON data via the connector agent. Tenancy
   mode pins a single tenant; fleet surfaces (Clients page, Compare,
   materialization) are hidden. Their SSO, their branding, EU residency where
   required.
2. **Internal Cockpit** — one Mediagenix-internal deployment in fleet mode.
   Every tenant is registered as a client; the existing multi-client machinery
   (connections, SQL overrides, goal templates materialized per client, the
   Compare grid) is this edition's core. Internal OKRs measure Mediagenix's own
   success across tenants.
3. **Desktop** — today's local-first Electron app, unchanged, per the existing
   plan's guardrail.

**Never fork.** The editions differ by deployment-time tenancy mode and
entitlements, not architecture. External/internal separation happens at the
instance level, never the source level.

## Amendments to the 2026-06-01 plan

| Plan said | Amended to | Why |
|---|---|---|
| Shared multi-tenant data plane, schema-per-tenant Postgres (S2) | **Dedicated data-plane instance per client**; shared control plane (identity, tenant registry/provisioning, billing, agent gateway) remains | With this client list, hard isolation is a sales asset; competitors' scheduling data must never share a database. Higher per-tenant ops cost accepted; provisioning must be scripted. |
| (not covered) | **Internal Cockpit as an explicit deliverable** — tenants registered as clients, fleet templates, Compare as fleet board | The multi-client features already built are this product; the 2026-08-31 evaluation's "overkill" verdict inverts under this direction. |
| (not covered) | **Per-KR "shared with Mediagenix" opt-in** governs what the cockpit sees | Contract question before technical one; dealbreaker-grade for Disney-class clients. Everything not opted-in never leaves the client instance. |

Phase order S1–S5 stands, with S2 re-scoped to tenancy mode + scripted
per-instance provisioning, and a new phase between S3 and S4: cockpit wiring
(opt-in shared-metrics channel, fleet templates).

## Prerequisites carried in from the 2026-08-31 evaluation

Persistent audit trail (ActivityLog is currently in-memory), automated backups,
conflict-checked writes (PUT with version check), and TD-1 (unsynced store
mutations) fold into S1–S2 as hard prerequisites for anything client-facing.

## Competitive context (verified 2026-08-31)

Quantive (ex-Gtmhub) — the only OKR product with SQL-database-backed key
results — was absorbed by WorkBoard and is no longer standalone; its customers
are migrating. Remaining OKR platforms automate via SaaS connectors, not raw
SQL. Nobl9 / CloudWatch Application Signals are the closest architecture
(objectives from data sources) but SRE-framed. Niche positioning: automated
OKRs at the database level, purpose-built for broadcast operations on WHATS'ON,
sold by the vendor of WHATS'ON. Caveat: the market is dozens of logos — this is
a product-line add-on riding existing contracts, not a standalone venture.
