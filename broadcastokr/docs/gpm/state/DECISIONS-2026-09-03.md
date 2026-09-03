# Decisions — 2026-09-03 (end of R1 day one)

Taken by Yannick in conversation after the rig's first day; recorded here so the
next session starts from them rather than re-asking. Each entry: the decision, what
it implies, and where the work lands.

## D-3 — Connections move into the tenant database

**Decision:** database connections leave `config.json` and become rows in the tenant
SQLite database (migration 007, additive), alongside goals, users, and the rest.

**Why:** multi-tenant scoping, versioning, backup coverage, and the migration story
come for free; the JSON file had none of them and every finding about it (27, 29) was
a symptom of that. The one argument against — editing connections by hand on disk —
is not a customer need.

**Implies:** a one-time conversion on first start after the upgrade (JSON → rows,
JSON left in place, renamed `.migrated`); `POST/GET/DELETE /api/connections` keep
their shapes; the credential cipher applies to the column exactly as it did to the
JSON; the backup pair now covers connections; FF-6 unaffected (additive).

**Lands in:** the data-plane backlog (`dataplane-backlog-2026-09-02.md`, D-3 stories
ST0–ST2) — ST0's decision spike is now closed by this note.

## AI query assistance — deferred to v1.1

**Decision:** ship the presets and the guided builder (done 2026-09-03, merged
`d8d8b81`), collect the questions owners actually type, and revisit with evidence.
The spike (`docs/saas/2026-09-03-query-assist-spike.md`) stands as the design input.

**Deferred task (v1.1):** *Investigate enhancing KR querying with AI assistance* —
"model fills the builder" first, bridge-side, opt-in per instance, SELECT-only,
preview-gated; a golden set of fifty real questions before any free SQL reaches a KR.
Input: the logged KR titles and builder choices from R1 and the first demos.

**Lands in:** the roadmap's post-1.0 list (`CLAUDE.md` Next steps, item 5).

## R6-1 — Connection binding is a cockpit function

**Decision:** binding a WHATS'ON connection to a client instance is done by
Mediagenix on the **cockpit**, not by the client's owner. Enrol and share tokens
likewise. The client edition keeps its honest "contact your Mediagenix operator"
message (finding 29) and gains nothing here.

**Why:** the product runs in Mediagenix's cloud; Mediagenix onboards the client and
holds the connection details. A client owner never sees the credentials.

**Implies:** R6-1's admin UIs all sit on the cockpit; the cockpit needs a write path
to a tenant's connection store — which is the D-3 rows, not a JSON file on another
instance. Sequence D-3 before R6-1, or R6-1 writes to a store that is about to move.

**Lands in:** R6-1 (admin UIs), after D-3.

## D-3 sub-decisions (evening) — recorded in `ADR-2026-09-03-connection-store.md`

Delete refuses while referenced (no forced cascade); `kpiDefinitions` move with the
connections, `kpi-history.json` stays a file. The ADR also closes R6 item 4.

## R6-1 sub-decisions (late evening) — recorded in `r6-backlog-2026-09-03.md` ST0

**Operator channel, cockpit → tenant instance:** each client instance is
provisioned with `BRIDGE_OPERATOR_TOKEN`; the cockpit stores the instance URL and
that token and forwards a closed list of management calls. Rejected: binding on
the tenant as owner (reverses the decision above), binding at provisioning only.
**Agents panel on both surfaces:** the client edition's Settings page and the
cockpit's tenant modal, one component.

## R1b — Corporate Entra spot-check — parked

**Decision:** not now; a later conversation. Stays a precondition for the first
client demo.

## Small rig findings — implement now

Findings 14 (Postgres scalars as strings), 19 (constraint errors as 500), 23 (silent
share loop / agent ingest at startup), 26 (warnings on stderr, banner on stdout),
and the goal form's timeframe default. One cleanup story, done 2026-09-03.

## Daily log

Yannick reads the Dashboard himself during the unattended run; the assistant does not
write the daily line unless asked. Real OKRs for the cockpit: Yannick consults first.
