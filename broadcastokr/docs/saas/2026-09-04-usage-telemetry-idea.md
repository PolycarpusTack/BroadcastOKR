# Idea — BrOKR as Mediagenix's own WHATS'ON usage monitor

**Status:** idea, parked. Not planned, not scoped. Written 2026-09-04 after a
corridor conversation with a colleague. **Owner:** Yannick.
**Question:** could the cockpit + tenant framework be used internally by Mediagenix
to run live usage metrics across every client's WHATS'ON database, so we learn how
clients actually use the product?

## Short answer

Yes, and closer than expected. R6 built most of the shape. What is missing is a
product decision about ownership and consent, plus one real unknown about the
WHATS'ON schema.

## What already fits (as of 0.9.2)

- **The cockpit is the internal tool.** A Mediagenix-side cockpit holding every
  client as a tenant, with an operator channel to each (R6-1), is the vantage point.
- **Live KRs are the metric engine.** A goal template "WHATS'ON usage" with live KRs
  (schedules published per week, active users last 30 days, imports run per month,
  …) is a template with SELECT-only SQL, materialised per client, synced on its own
  `syncIntervalMs`.
- **The fleet board already lines the same metric up across tenants** (R6-2). The
  share payload carries `krTemplateId`, so one column per usage metric, one row per
  client, last 30 history points.
- **The privacy story is already the right one.** Only value, target, direction,
  timestamp and ids cross the tenant boundary (FF-4: titles and SQL never leave the
  tenant; the cockpit rejects unknown fields). The share is tenant-initiated with a
  token the client holds. That is the story to tell a client's DPO.

## What does not fit yet

1. **Template ids will not match across tenants.** Templates are created per
   instance, so the same usage template on two clients gets two ids and two fleet
   columns. The usage set must either ship with the product with stable ids, or be
   pushed from the cockpit over the operator channel. `OPERATOR_ALLOW`
   (`bridge/middleware/rbac.cjs`) has no goal or template routes today — pushing is
   new surface and a new ADR.
2. **It is the client's data.** Keep the share tenant-initiated: an explicit
   "share usage metrics with Mediagenix" opt-in on the tenant, visibly listed, not
   something the operator token switches on remotely.
3. **Entitlements bite.** Starter refuses goal writes carrying live/shared KRs (R3,
   FF-8). A metric that benefits Mediagenix should not cost the client a tier —
   needs a carve-out for the operator-metric class.
4. **History is shallow for learning.** The cockpit keeps 100 points per metric
   (`shared_metric_history`, migration 009). At daily sync that is ~3 months; fine
   for a board, thin for "how did adoption change over two years". Longer retention
   or an export for this metric class.
5. **Telemetry mixed into the client's OKR list.** The client's Goals page would
   show Mediagenix's usage goal next to their own OKRs. A category or flag that keeps
   operator metrics out of the OKR views (and out of progress rollups) should be
   decided early.

## The real unknown is the schema, not BrOKR

The metrics are only as good as what the PSI database records. Object counts and
timestamps are certainly there. Logins, sessions and which UI modules people touch
may live in audit tables that need extra read grants on the read-only account, or
may not be in the database at all.

## If picked up — the spike

1. Get the colleague's list of the ten questions they actually want answered.
2. On the R1 rig's Oracle (real PSI schema), check which of the ten have a SELECT
   behind them. Note extra grants needed.
3. If most resolve to SQL: ship a built-in "WHATS'ON usage" template set with stable
   ids (extend `bridge/whatson/templates.cjs` or a new preset category), tenant
   opt-in toggle that materialises + shares, entitlement carve-out, longer cockpit
   retention for that class. v1.1-sized on the existing framework, not a new product.
4. If most do not: it is a WHATS'ON product question (what does the application
   record about its own use), and BrOKR waits for that.

## Related

- `docs/gpm/state/r6-backlog-2026-09-03.md` — operator channel ADR (ST0), fleet board
- `docs/gpm/state/r3-backlog-2026-09-04.md` — tiers and gates
- `docs/saas/2026-09-03-query-assist-spike.md` — same "golden set of real questions"
  method; the two spikes could share the question list
- Sister product angle: this is the "usage analytics" slice of WHATS'ON Insights,
  delivered through BrOKR's bridge rather than a new stack
