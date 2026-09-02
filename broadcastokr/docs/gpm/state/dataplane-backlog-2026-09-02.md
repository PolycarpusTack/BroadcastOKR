# Data-Plane Trust Boundary Backlog — 2026-09-02

Source: connection/metric-harvesting evaluation 2026-09-02 (read of `bridge/whatson/*`,
`bridge/routes/whatson.cjs`, `bridge/liveSync.cjs`, `bridge/middleware/rbac.cjs`,
`src/utils/liveSync.ts`, `src/components/goals/LiveKRConfigPanel.tsx`, `src/store/store.ts`).
Mode: **DELIVERY** (`docs/gpm/state/mode.md`) — the findings are defects and residuals on a
shipped subsystem, not a redesign; governance stays as-is (TDD order on behavior, Two Hats,
contract tests, no scope growth without an explicit re-scope note).
Framework: Backlog Builder v5.1 + v5.2 extensions (E3 buckets, E4 execution mode).

**Roadmap slot:** D-1..D-3 are **new R4 residuals** (`docs/saas/2026-08-31-readiness-plan.md`
§R4 — Security hardening residuals); they are not in R4's current list and must be added to
its exit criteria. D-4 closes a recorded smell-scan finding (NEXT-SESSION "deferred cleanup").
D-5 is a **re-scope request against R6's closed list** — it does not proceed without an
explicit decision. D-7 stays deferred behind the Insights dependency.

## Readiness Decision

**PROCEED for D-1, D-2, D-3, D-4, D-6.** The input is a verified defect list with file:line
evidence and no solution-shaped ambiguity (clarity 3, feasibility 3, completeness 3 → 9/9).

**HOLD D-5** pending the re-scope decision (R6 is a closed list by its own terms).
**DEFER D-7** — blocked on a product dependency that may never land.

One High-impact decision is unresolved and gated: where connections live (Assumption 3,
resolved at D-3/ST0, not before).

## Critical Gaps

None blocking D-1/D-2 — both are small, self-contained, and independently shippable. D-1
should ship first regardless of everything below it: it is the only finding that is
live-exploitable by an authenticated non-owner today.

## Domain Glossary (delta only)

- **Data-plane route** — any bridge route whose handler can reach a *client* database
  (Oracle/PostgreSQL via `whatson/core.cjs`), as opposed to the tenant SQLite DB.
- **Raw-SQL surface** — a data-plane route that executes SQL supplied in the request body
  (`/api/preview-query`, `/api/kpi/execute-batch`) rather than SQL read from stored config.
- **Stored-SQL surface** — a data-plane route that executes only SQL already persisted by an
  owner (`/api/kpi/execute`, `/api/kpi/poll`, `/api/kpi/sync-now`, the `liveSync` loop).
- **Credential store** — wherever connection passwords live at rest; today `bridge/config.json`.

## Assumptions Ledger

| # | Assumption | Impact | Verified? |
|---|---|---|---|
| 1 | `/api/kpi/execute-batch` is reachable by any authenticated role in cloud modes: the POLICY rule for `/api/kpis` does not match `/api/kpi/...`, no other rule covers it, and unlisted routes fall through to default-allow. | High | (verified) `bridge/middleware/rbac.cjs` POLICY list + the `if (!rule) return next()` fall-through; the handler in `bridge/routes/whatson.cjs` takes `sql` from `req.body` with no role check |
| 2 | Encryption of stored passwords is a **no-op whenever `BRIDGE_API_KEY` is unset**, and cloud modes never require it (they validate OIDC only). A correctly-configured cloud instance can therefore hold plaintext WHATS'ON credentials at rest. | High | (verified) `bridge/server.cjs` wires `encrypt`/`decrypt` as pass-through when the key is absent; the cloud validation block checks OIDC only |
| 3 | **UNRESOLVED — D-3/ST0 decides.** Either (a) connections move into the tenant SQLite DB (migration 007, tenant-scoped, backup-covered), or (b) they stay in `config.json` and gain scoping plus backup coverage separately. (a) is the default recommendation: it inherits migrations, versioning, backup and tenancy for free. | High | ASSUMED → D-3 opens with an ST0 DECISION SPIKE |
| 4 | Encrypted values gain an explicit `enc:v1:` prefix so plaintext-vs-ciphertext is a marker check, not a try/catch on `decipher.final()`. Unprefixed values are legacy plaintext and are re-encrypted on first read. Rationale: a bare try/catch cannot distinguish "legacy plaintext" from "right ciphertext, wrong key", and would silently accept a key rotation as data loss. | High | ASSUMED — cheap to verify at D-2/ST1 via `bridge/__tests__/crypto.test.cjs` |
| 5 | Gating the stored-SQL surfaces (`/api/kpi/execute`, `/api/kpi/poll`, `/api/kpi/sync-now`) at member/authenticated grade rather than `ownerOnly` preserves current app behaviour — the dashboard KPI panel and per-goal "Sync now" are used by non-owners. Only the **raw**-SQL surfaces become `ownerOnly`. | Med | ASSUMED — verify against the `src/pages/GoalsPage.tsx` and `LiveKPIPanel.tsx` call sites at D-1/ST0 |
| 6 | Migration 007 is additive (new `connections` table, no DROP/RENAME) and therefore does not trip FF-6 or require a `MIN_SUPPORTED` bump. | Med | ASSUMED — verify at D-3/ST2 against the FF-6 scan |
| 7 | `channelScope` was never wired into query binds, and the shipped `:channel_id` KPI template is unreachable from the KR authoring path: `LiveKRConfig` has no `binds` field and `buildLiveKRQueries` never populates the `binds` it declares. This is a feature gap, not a regression. | Med | (verified) `src/types/index.ts` LiveKRConfig; `src/utils/liveSync.ts` |

## Backlog

Conventions: branch `hardening/2026-09-02-dataplane`, commit per story, `[type](scope): summary`.
Global DoD every story: `npm test` + `npm run test:bridge` + `npm run lint` + `npm run build`
green across editions; edition sentinel scans green; no Two Hats mixing.
Execution: **SEQUENTIAL** for D-1 → D-2 → D-3, with D-4 pulled after D-1 (all touch
`whatson/core.cjs`, `rbac.cjs`, or the whatson router — write scopes overlap). D-6 is
parallel-safe.

---

### EPIC D — Close the data-plane trust boundary

- **Objective:** every route that can reach a client database is role-gated, audited, and
  executes through one seam; credentials are never at rest in plaintext; the credential store
  carries the same migration, backup and tenancy guarantees as the rest of the data.
- **Tracer Bullet?:** YES — D-1's FF-9 fitness function is the tracer: it turns "a new
  data-plane route was mounted without a POLICY entry" from a review question into a CI
  failure, which is precisely the defect class that produced finding 1.
- **Mode:** DELIVERY
- **DoD:** (1) FF-9 green in CI and demonstrably failing on a planted ungated route; (2) a
  member session cannot execute SQL against any client DB; (3) a cloud instance refuses to
  start with unprotected credentials; (4) the credential store is backed up and tenant-scoped.
- **Risk:** D-3 carries a live-credential migration → ST0 decision gate plus a dry-run path.
- **Smoke Test Story:** covered by extending `bridge/__tests__/rbac.test.cjs` (real sessions
  against real routes) — no new harness needed.
- **Runbook:** `docs/operations.md` gains a credentials section in D-2 (key generation,
  rotation, behaviour on a missing key) and a connection-store section in D-3.

---

#### D-1 — Gate and audit the raw-SQL surface; add FF-9 policy coverage · **DONE 2026-09-02** (`c7aefa8`)
- **Persona:** As the app owner I want database query execution to be an owner capability, so
  that a member session cannot read client production data the app never chose to surface.
- **Priority:** 5 · **Size:** M · **Hat:** FEATURE (ST1/ST2) · **DoR:** READY
- **AC:**
  - Given a signed-in **member** in client mode, When they POST to `/api/kpi/execute-batch`
    with arbitrary SQL, Then the response is 403 and no query reaches the client DB.
  - Given a signed-in **owner**, When they do the same, Then execution proceeds exactly as
    today and an audit row records it.
  - Given a signed-in member, When they use the dashboard KPI panel or a per-goal "Sync now",
    Then those still work — stored-SQL surfaces stay member-reachable (Assumption 5).
  - Given a new route is mounted that can reach a client database, When FF-9 runs, Then it
    fails naming the path until a POLICY entry exists.
- **Sub-tasks (E3 buckets):**
  - **ST0 (PREPARATORY):** walk the `src/` call sites of `/api/kpi/execute`, `/api/kpi/poll`,
    `/api/kpi/sync-now` and `/api/channels`, recording which roles use each. Output: the
    permission each route gets in ST2. Confirms or breaks Assumption 5.
  - **ST1 (FEATURE — failing tests first):**
    - `bridge/__tests__/rbac.test.cjs`: member POST `/api/kpi/execute-batch` expects 403
      (fails today with 200); owner expects 200.
    - **FF-9** as a new `bridge/__tests__/ff9-policy-coverage.test.cjs`: enumerate the paths
      registered on the whatson (data-plane) router and assert each mounted method matches a
      POLICY rule; the test plants a throwaway route to prove it fails open-loop.
  - **ST2 (FEATURE):** add POLICY rules in `bridge/middleware/rbac.cjs` —
    POST `/api/kpi/execute-batch` → `ownerOnly`; POST `/api/channels` → `ownerOnly` (schema
    and topology disclosure, same class as `/api/tables`); POST `/api/kpi/execute`,
    POST `/api/kpi/sync-now`, GET `/api/kpi/poll` → the grade ST0 established. Add the
    existing `auditSql()` call to the execute-batch handler — it is the only raw-SQL surface
    with no audit line today (`preview-query` already has one).
  - **ST3 (REFACTORING):** none expected — POLICY is a flat table; justify or skip.
- **Pull Gate:** Assumption 5 confirmed in ST0 before ST2 picks permissions.
- **Unblocks:** D-4. **Note:** ship and merge this story on its own even if the rest slips.

---

#### D-2 — Credentials are never at rest in plaintext · **DONE 2026-09-02** (`b606561`)
- **Persona:** As an operator I want a cloud instance to refuse to run rather than silently
  store WHATS'ON passwords in cleartext, so that a config-file leak is not a credential leak.
- **Priority:** 5 · **Size:** M · **Hat:** FEATURE · **DoR:** READY
- **AC:**
  - Given a cloud `BRIDGE_MODE` and no encryption key configured, When the bridge starts, Then
    it exits non-zero naming the missing variable (fail-closed, matching the existing OIDC
    block) — and `BRIDGE_INSECURE_NO_AUTH=1` is **not** an escape for credentials.
  - Given a stored connection written before this story (unprefixed plaintext), When it is
    next read, Then it is used successfully and rewritten with the `enc:v1:` prefix.
  - Given a configured key and a stored `enc:v1:` value, When the key is wrong, Then the read
    fails loudly (500 plus log) rather than being mistaken for legacy plaintext.
  - Given desktop mode with no key, When the bridge starts, Then behaviour is unchanged
    (single-user trust model) but the startup warning names the credential consequence.
- **Sub-tasks:**
  - **ST0 (PREPARATORY):** settle the variable — `BRIDGE_ENCRYPTION_KEY` (new and dedicated,
    recommended: it decouples "who may call the API" from "what unlocks credentials"), with
    fallback to `BRIDGE_API_KEY` for desktop compatibility. Record the choice in the ledger.
  - **ST1 (FEATURE — failing tests first):** extend `bridge/__tests__/crypto.test.cjs` for the
    `enc:v1:` marker, the legacy-plaintext upgrade, and wrong-key-throws; add a startup test
    for the cloud fail-closed path (spawn-and-assert-exit, pattern:
    `bridge/__tests__/cockpit-mode.test.cjs`).
  - **ST2 (FEATURE):** add the prefix to `bridge/utils/crypto.cjs`; add the credential
    validation block to `bridge/server.cjs` beside the OIDC one; implement the read-path
    upgrade in the connection load path.
  - **ST3 (REFACTORING):** fold the two `BRIDGE_API_KEY ? encrypt(...) : plaintext` ternaries
    in `server.cjs` into one `createCredentialCipher()`, so the no-op branch cannot be
    reintroduced by a future call site.
- **Pull Gate:** Assumption 4 verified in ST1 before ST2 touches stored data.
- **Unblocks:** D-3 (which moves these same values and must not move plaintext).
- **Runbook:** `docs/operations.md` — key generation, rotation, and the explicit statement
  that rotation requires re-entering connection passwords (no re-wrap path in v1).

---

#### D-3 — Give the credential store the same guarantees as the rest of the data
- **Persona:** As the operator of a multi-tenant instance I want connections tenant-scoped,
  backed up and referentially sound, so that a restore is complete and one tenant cannot see
  another's database bindings.
- **Priority:** 4 · **Size:** L · **Hat:** FEATURE · **DoR:** BLOCKED → ST0
- **Problem (evidence):** `bridge/config.json` sits outside SQLite — no migrations, no version
  column, no tenant scoping — and `startBackupScheduler` snapshots the SQLite file only
  (`bridge/utils/backup.cjs` uses `db.backup`), so a restored instance returns with its OKRs
  and none of its connections. `DELETE /api/connections/:id` also performs no referential
  check, leaving `client.connectionId` and every materialized `liveConfig.connectionId`
  dangling until the next sync reports "Connection not found".
- **AC:**
  - Given a connection referenced by a client or a live KR, When an owner deletes it, Then the
    response names the referencing entities and the delete is refused — or, if forced, the
    affected KRs move to a `disconnected` sync status (decided at ST0).
  - Given a backup snapshot, When it is restored into a clean instance, Then connections come
    back with it.
  - Given cloud mode with more than one tenant, When tenant A lists connections, Then tenant
    B's connections are not returned.
  - Given an existing `config.json` with connections, When the bridge starts after this story,
    Then they are migrated once, encrypted per D-2, and the file is left in place as a backup
    for one release.
- **Sub-tasks:**
  - **ST0 (DECISION SPIKE, timeboxed S):** resolve Assumption 3 — SQLite table vs. scoped file
    store. Deliverable: a short ADR under `docs/gpm/state/` recording the choice, the delete
    semantics (refuse vs. cascade-to-disconnected), and whether `kpiDefinitions` and
    `kpi-history.json` move at the same time or stay put. They share the same weakness; the
    recommendation is to move `kpiDefinitions` with the connections and leave the history file,
    which is regenerable. **This ADR also satisfies R6 item 4** (the KPI-vs-LiveKR
    consolidation decision) provided it names the difference explicitly.
  - **ST1 (FEATURE — failing tests first):** tenancy isolation test (pattern:
    `bridge/__tests__/tenancy-mode.test.cjs`); backup round-trip extending `backup.test.cjs`;
    referential-integrity test on delete.
  - **ST2 (FEATURE):** migration `007-connections.sql` (additive — Assumption 6); the new store
    behind the existing `createConfigStore` interface so `routes/whatson.cjs` and `server.cjs`
    keep their shape; one-shot import from `config.json` on first start.
  - **ST3 (REFACTORING):** delete the dead file paths; confirm `route-contract.test.cjs` and
    FF-9 still pass unchanged.
- **Pull Gate:** ST0 ADR signed off; D-2 merged, so nothing plaintext is migrated.

---

#### D-4 — One scalar-execution seam · **DONE 2026-09-02** (`014aac8`)
- **Persona:** As a maintainer I want a single function turning (connection, SQL) into a scalar
  result, so that the timeout, `no_data`, NaN and audit semantics cannot drift apart.
- **Priority:** 3 · **Size:** S · **Hat:** REFACTORING (pure — no behaviour change) · **DoR:** READY
- **Context:** already recorded as a deferred smell-scan finding in
  `docs/gpm/state/NEXT-SESSION.md` ("scalar-query execution triplicated"). D-1 and D-2 both
  touch these three copies, so this is the cheapest it will ever be.
- **AC:**
  - Given the three current copies — `executeKrQuery` in `bridge/server.cjs`, the
    `/api/kpi/execute-batch` handler in `bridge/routes/whatson.cjs`, and the ingest path used
    by `bridge/routes/agent.cjs` — When this story completes, Then one `executeScalarQuery()`
    in `bridge/whatson/core.cjs` serves all of them and every existing test passes
    **unmodified**.
  - No behaviour change: `no_data` on empty rows, `error` on NaN, `timeout` at the 15s ceiling,
    first-column-of-first-row extraction — all preserved verbatim.
- **Sub-tasks:** ST0: none. ST1: none under the REFACTORING hat — existing tests are the spec;
  where a behaviour is untested, write the characterization test first and commit it
  separately. ST2: extract and rewire the three call sites. ST3: n/a.
- **Pull Gate:** D-1 merged, so the extracted seam carries one audit call rather than three.

---

#### D-5 — Binds and channel scope reach the query · **RE-SCOPE REQUIRED**
- **Persona:** As a goal owner I want a KR scoped to a channel to measure only that channel, so
  that I do not have to hand-edit a channel id into per-client SQL overrides.
- **Priority:** 3 · **Size:** M · **Hat:** FEATURE · **DoR:** NOT READY — needs a decision
- **Why it is not simply queued:** R6 is a closed list by its own terms ("no additions without
  re-scoping"). This is a real capability gap — the shipped `:channel_id` KPI template cannot
  be used from a KR at all (Assumption 7) — but it is new behaviour, not a defect fix.
  **Decision needed:** add to R6 as item 6, defer to the post-95% list, or drop.
- **AC (if accepted):**
  - Given a KR whose goal has `channelScope` of type `selected`, When it syncs, Then
    `:channel_id` is bound from that scope and the query returns that channel's value.
  - Given a KR with `channelScope` of type `all`, When it syncs, Then behaviour is unchanged.
  - Given the "Transmissions per Channel" preset, When it is chosen in the KR panel, Then it
    executes without hand-editing SQL.
- **Sub-tasks (if accepted):** ST0: decide the binding contract for multi-channel scopes (one
  query per channel vs. an IN-list vs. refuse). ST1: failing tests on `buildLiveKRQueries`.
  ST2: add `binds?` to `LiveKRConfig` in `src/types/index.ts`, populate it in
  `src/utils/liveSync.ts` from `channelScope`, surface named binds in `LiveKRConfigPanel.tsx`
  — the bridge already supports them via `buildBinds` in `whatson/core.cjs`. ST3: cleanup.

---

#### D-6 — Minor correctness cleanups · **DONE 2026-09-02** (`00feaca`)
- **Priority:** 2 · **Size:** S · **Hat:** REFACTORING · **DoR:** READY · parallel-safe
- **AC:**
  - `POST /api/test-connection` no longer calls `decrypt()` on a value the UI always sends as
    plaintext (`bridge/routes/whatson.cjs`); the fragile coupling is removed, or made explicit
    with a comment stating the contract.
  - `POST /api/channels` uses `connConfig.schema` instead of the hardcoded `PSI.` prefix in all
    four query variants, defaulting to `PSI` when unset.
  - Both changes carry a test; no behaviour change for the default PSI case.

---

#### D-7 — Dimensional query contract · **DEFERRED**
Every KR is one round-trip returning one scalar, so a per-channel breakdown is a KR per
channel. Changing that contract only pays off if AI-query-to-chart (the Insights ChartConfig
work, CLAUDE.md Next Steps item 4) ever lands in BrOKR. **Action now: none**, beyond a line in
the D-3 ADR recording that the scalar contract is a deliberate v1 boundary — so a future
reader does not mistake it for an oversight.

---

## Sequencing & effort

```
D-1 (M) ──> D-2 (M) ──> D-3 (L, gated by the ST0 ADR)
   └──────> D-4 (S)
D-6 (S) — parallel, any time
D-5 — HOLD (re-scope decision)        D-7 — DEFERRED
```

D-1 goes first and is mergeable alone: it is the only live-exploitable finding, and its FF-9
tracer prevents recurrence. D-1 + D-2 + D-4 together are roughly one M-equivalent and close
both High-impact findings. D-3 is the L and can run on the hardening track alongside R4's pen
test — commission that pen test *after* D-1 and D-2 land, so the raw-SQL surface and the
credential store are not re-reported as findings already known.

## Roadmap updates this backlog requires

- `docs/saas/2026-08-31-readiness-plan.md` §R4: add D-1, D-2 and D-3 to the residual list and
  to the exit criteria — "residuals register empty or accepted-with-date" must cover them.
- `docs/gpm/state/NEXT-SESSION.md`: move "scalar-query execution triplicated" out of deferred
  cleanup and into D-4 (scheduled).
- `docs/saas/2026-08-31-tiered-development-plan.md` FF table: add FF-9 (data-plane routes are
  policy-covered) once D-1 lands.
- `CLAUDE.md`: the standing gotcha "New sensitive routes must be added to
  `bridge/middleware/rbac.cjs` POLICY" becomes machine-enforced by FF-9 — reword rather than
  remove, since FF-9 covers the data plane only.


---

## Execution log — 2026-09-02

Branch `hardening/2026-09-02-dataplane`. D-1, D-2, D-4, D-6 shipped; D-3 deliberately not started.

| Story | Commit | Note |
|---|---|---|
| D-1 | `c7aefa8` | FF-9 added; `authenticated` introduced as an explicit POLICY verdict |
| D-2 | `b606561` | `enc:v1:` marker + `createCredentialCipher`; fail-closed scoped to the feature |
| D-4 | `014aac8` | `executeScalarQuery` seam; `/api/kpi/sync-now` moved onto the router |
| D-6 | `00feaca` | schema honoured; channel-scope "label only" note |

### Deviations from the plan as written, and why

1. **D-2 does not fail the process closed at startup.** The plan said a cloud instance should
   exit non-zero without a credential key. Two facts found during execution changed that: a
   cockpit instance legitimately holds zero client-DB connections, so the requirement is
   over-broad for it; and `bridge/config.json` is read by nine test spawns and, more
   importantly, a fatal boot check would strand an operator who must start the app to *remove*
   the offending credential. The credential-bearing routes fail closed instead (503 on
   `POST /api/connections` when a new secret arrives with no key), with a startup warning
   naming the count. Desktop is untouched — single-user, no key, as documented.

2. **The `enc:v1:` marker needed a legacy-ciphertext path too.** Assumption 4 anticipated
   plaintext-vs-ciphertext. Installs that already had `BRIDGE_API_KEY` set hold *unmarked
   ciphertext*, so `decrypt` tries the old scheme before concluding "plaintext". The ambiguity
   is bounded to pre-marker values and closed at startup by `rewrapStoredConnections`.

3. **`/api/kpi/poll` was left out of the D-4 seam.** It has a genuinely different contract
   (per-KPI error strings on the result object, no NaN check), so folding it in would have been
   a behaviour change under a REFACTORING hat. Recorded here rather than done quietly.

4. **One intentional behaviour delta in D-4:** the connector agent now reports a query timeout
   as `status: 'timeout'` rather than `'error'`. This is a correction, not a regression, and is
   called out in the commit.

5. **`GET /api/connections` and `GET /api/config` were marked `authenticated`, not tightened.**
   FF-9 forces the decision to be *written down*; it does not force it to change. Both mask
   credentials already, and the live-KR editor needs the connection list. Tightening to
   `canEdit` remains a candidate follow-up.

### Verification at close

`npm test` 210/210 · `npm run lint` 0 · `npm run build` clean · `npm run test:bridge` 115/116.

The single bridge failure is pre-existing and environmental, not a regression: `agent.test.cjs`
asserts the identity file is written `0600`, and Windows reports `0666` because it has no POSIX
mode bits. It passes on CI Linux. `static-serving.test.cjs` is flaky under parallel load
(passes in isolation) — also pre-existing.

### Still open

- **D-3** — not started. Now carries an extra constraint: SQLite is the demo/desktop store and
  the production tenant store is intended to be Postgres (`docs/saas/2026-06-01-saas-migration-plan.md`
  records "Port SQLite schema → Postgres schema-per-tenant"), so ST0 must decide portable
  credential storage and tenancy shape rather than reaching for SQLite idioms.
- **D-5** — deferred to post-95%; the join-key question (`CH_ID` vs `CH_INTERNALVALUE` in
  `TX_ID_CHANNEL`) must be verified against a real PSI instance before it is built.
- **D-7** — deferred; record the scalar contract as a deliberate v1 boundary in the D-3 ADR.
