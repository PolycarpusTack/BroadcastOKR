# Tier 2 Backlog — Finish the Internal Cockpit (2026-08-31)

Decomposition of Tier 2 from `docs/saas/2026-08-31-tiered-development-plan.md`.
Mode: **DELIVERY**. Branch `feature/tier2-cockpit`, commit per story, merge `--no-ff`.
Global DoD: vitest + bridge + lint + build (all editions) green; FF suite green.

**Tier exit:** Mediagenix runs one cockpit instance where tenants are client rows fed by
live, opt-in metrics pushed from client instances; agents at customer sites feed their own
instances outbound-only with no SQL on the wire; a v1-protocol client still works (FF-5).

## Assumptions Ledger

| # | Assumption | Impact |
|---|---|---|
| 1 | Agent channel v1 = outbound HTTPS **push** with a per-agent revocable bearer token (48-byte random, stored hashed), TLS terminated by the platform. Cert-bound mTLS is a hardening residual, recorded in the evidence mapping — the trust-boundary properties that matter (outbound-only, no SQL inbound, scalar-only egress, revocation) all hold in v1. | High |
| 2 | The agent's SQL lives ONLY in its local, operator-readable config file (connections + per-KR bindings); the cloud never sends SQL or commands. Scheduling lives in the same file. Consequence: cloud "sync now" waits for the agent's next push. | High |
| 3 | Agent connection passwords are encrypted with a per-install random data key (`AGENT_DATA_KEY`, generated at enrolment, 0600 file) — never a network credential. | Med |
| 4 | Cockpit tenancy v1: each tenant = a client row on the cockpit + a per-tenant write-only share token (hashed on a `cockpit_tenants` row). Pushed metrics land in a `shared_metrics` table (latest + history-lite), surfaced by a cockpit-only fleet panel; deep Compare-grid integration is a later refinement. | Med |
| 5 | Share payload v1 fields: krId, value, target, direction, timestamp — **no titles, notes, confidence, or history** (per the security review). Titles become a separately-flagged follow-up if clients ask. | High |
| 6 | Opt-out semantics v1: revoking the flag stops future pushes; previously landed cockpit rows are retained (they were shared when sent). Delete-on-revoke is a contract question logged for legal — the ingest supports deletion when that lands. | Med |

## Stories (execution order)

**T2-1 — Cockpit mode proven** · FEATURE · S
Spawn `BRIDGE_MODE=cockpit` with the mock IdP: fail-closed without OIDC, fleet client CRUD
allowed (multi-client), `/me` reports cockpit, RBAC active. Mostly a test file — the wiring
exists from T0-7/T1-4.

**T2-2 — FF-4 + the allowlist share projector** · FEATURE · M · ships BEFORE any channel
`bridge/cockpit/sharePayload.cjs`: builds the outbound payload by explicit field allowlist
from `WHERE shared_with_mediagenix = 1` — never by filtering a full dump. FF-4 sentinel
test: plant private markers in notes/SQL/titles of shared AND unshared KRs; assert the
serialized payload contains zero markers and only the allowlisted fields.

**T2-3 — Shared-metrics channel** · FEATURE · L · Pull gate: T2-2
Cockpit side: migration 006 (`cockpit_tenants`: client_id + share_token_hash;
`shared_metrics`: tenant client, krId, value, target, direction, timestamp);
owner-only `POST /api/cockpit/tenants` (mint per-tenant token, echo once);
`POST /api/cockpit/ingest` (share-token auth, strict schema validation — unknown fields
rejected and logged, scalar-only), landing rows + audit; authenticated
`GET /api/cockpit/metrics`. Client side: push loop (env `BRIDGE_COCKPIT_URL` +
`BRIDGE_SHARE_TOKEN`, interval) sending the T2-2 projector's payload. End-to-end test:
client instance with shared+private KRs pushes to a cockpit instance; only shared values
land; over-broad payloads rejected.

**T2-4 — Connector agent v1** · FEATURE · L (XL descoped per Assumptions 1–3)
`bridge/agent.cjs` entrypoint over `whatson/`: local config file (connections + KR
bindings + interval), executes via the core, pushes `{krId, value:number, timestamp}` only.
Instance side: migration 006 also adds `agents` + `agent_enrol_tokens`; owner-only
`POST /api/agents/enrol-token` (one-time, 15-min TTL); agent `POST /api/agent/enroll`
(token → per-agent bearer, hashed; agent writes its 0600 identity file);
`POST /api/agent/ingest` (agent-token auth, scalar-only validation, reuses the liveSync
write semantics: values, updated_at bump, monitored history); owner-only revocation
`DELETE /api/agents/:id`; `GET /api/agents` for the ops view. Tests: enrolment round-trip,
revoked agent refused, non-numeric/extra-field payloads rejected, values land + propagate.

**T2-5 — FF-5 golden fixtures** · FEATURE · S
`bridge/__tests__/fixtures/protocol-v1/` — canonical requests (app sync/write, agent
ingest, share ingest) captured at v1; replay test asserts current server accepts them
(2xx + response shape). The MIN_SUPPORTED advance discipline gets its enforcement point.

**T2-6 — Fleet metrics surface** · FEATURE · M
`FleetMetricsPanel` on the Dashboard, cockpit runtime mode only: tenants × shared KRs,
latest value/target/direction with staleness. Self-contained (fetches
`/api/cockpit/metrics`), no prop-drilling. Client bundles unaffected (runtime-gated;
sentinel set unchanged).

**T2-7 — Close-out** · docs · S
Evidence pack additions (agent enrolment/revocation, FF-4 output, channel e2e); control
mapping rows 4–5 updated from "Tier 2" to implemented-with-residuals; phase summary; mode
roadmap; CLAUDE.md counts. Package split (2.6): trigger NOT fired — the agent ships from
the same repo/image cadence for now; decision recorded.

## Validator summary
Order respects the FF-4-before-channel rule ✓ · pull gates stated ✓ · all FEATURE hats ✓ ·
migrations additive (006) ✓ · descope decisions ledgered as assumptions, not silent ✓.
