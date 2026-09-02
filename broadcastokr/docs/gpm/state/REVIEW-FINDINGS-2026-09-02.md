# Review Findings — 2026-09-02 session

Adversarial review of `b925d70..HEAD` against `REVIEW-PROMPT-2026-09-02.md`.
Reviewer: fresh session, Fable 5.1. Everything marked **confirmed** was reproduced
against the code or a live bridge, not inferred.

**Baseline matches the claims:** `npm test` 250/250 · `npm run test:bridge` 118/119
(the accepted Windows `0600` case) · `npm run lint` 0 · `npm run build` clean.

## Status — fixed the same evening, branch `hardening/2026-09-02-review-fixes`

| Finding | Commit | What shipped |
|---|---|---|
| F1 | `6d8024a` | `canonicalPath` in every path-keyed middleware; strict, case-sensitive routers (`utils/router.cjs`); SPA fallback case-insensitive; FF-9 shape test + live-server variants in `rbac.test.cjs` |
| F2, F4(a), F9 | `57841e0` | rewrap under `legacyKey` (BRIDGE_API_KEY); never re-seal a value that cannot be read; `unreadable` counted, logged, on `/api/health`, shown in SystemHealthPanel; agent accepts `enc:v1:` and `enc:`+blob |
| F3 | `104ec79` | `electron/credentialKey.cjs`: `sealed:`/`plain:` marker, unreadable key moved aside never overwritten, ephemeral key during a keychain outage, warning to renderer via `bridge:status.warning` |
| F8 | `93e83c2` | `bridge-process.log` truncated per run, capped at 2 MB |
| F5, F6 | `bbef495` | execute-batch `canEdit` + `isStoredQuery` verification for non-owners; `addGoal`/`updateGoal` return the write promise and callers sync after it; wizard records the goal before syncing; goal/KPI steps gated on `canCreate`/`canEdit` |
| F7, F4(c,d) | see log | `POST /api/config` refuses/encrypts like `/connections`; operations.md Restore/pair/API/desktop text |

Not done, deliberately: `keyId` in config.json (F4 b — the startup verification makes it redundant for now); the minor notes.

After: `npm test` 252/252 · `npm run test:bridge` 139/140 (same accepted case) · lint 0 · build clean.

---

## Findings, by severity

### F1 · CRITICAL · Auth and RBAC are bypassed by path shape (cloud modes)

**Where:** `bridge/middleware/auth.cjs:20` (`isSessionExempt`), `bridge/middleware/rbac.cjs`
(every `$`-anchored rule), Express default routing (case-insensitive, non-strict).

**Confirmed against a live client-mode bridge with the mock IdP:**

| Caller | Request | Result |
|---|---|---|
| **no session** | `POST /API/KPI/EXECUTE-BATCH` | **200** — SQL executed against the client DB |
| **no session** | `GET /API/SYNC/BACKUP` | **200** — the whole tenant SQLite file |
| **no session** | `GET /API/CONNECTIONS` | **200** — hosts, services, users |
| member | `POST /api/kpi/execute-batch/` | **200** — SQL executed |
| member | `POST /API/KPI/EXECUTE-BATCH` | **200** |
| member | `DELETE /API/GOALS/g1` | reached the handler (404 only because unseeded) |
| member | `POST /api/kpi/execute-batch` | 403 (the only shape the policy sees) |
| — | `/api/kpi/execute%2Dbatch`, `//api/...` | 404 (safe) |

Two independent holes:

1. **Uppercase bypasses everything, including sign-in.** `isSessionExempt` returns
   true for any path that does not `startsWith('/api/')`, so `/API/…` is treated as a
   static-asset path and skips auth *and* rbac — then Express, which routes
   case-insensitively by default, dispatches it to the real handler. This exemption
   dates from `ac82dd1` (2026-08-31, static serving), not today, but today's story was
   "close the data-plane trust boundary" and this is the boundary.
2. **Trailing slash bypasses every `$`-anchored rule.** Express matches
   `/kpi/execute-batch/` to the route; `req.path` keeps the slash; `^\/api\/kpi\/execute-batch$`
   does not match; `if (!rule) return next()`. All four data-plane rules added today use
   `$`, as do `preview-query|tables|columns|test-connection`, `config`, `cockpit/tenants`,
   `agents/enrol-token`, `sync/migrate-from-local`, `sync/backup`. The `(\/|$)` rules hold.

**Why FF-9 missed it:** FF-9 tests the POLICY regexes against strings it constructs
(`concretePath`), not against what the router will actually accept. Its blind spot is
semantic, not lexical — the `:id → x` substitution itself is fine (see "cleared").

**Fix (do all three):**
- One canonicalisation helper — lowercase, strip trailing slashes — used by `isSessionExempt`,
  rbac, protocol and rate-limit before any path test. Also flip the exemption's polarity:
  exempt the SPA fallback (`GET` and not `/^\/api(\/|$)/i`), not "anything not under `/api/`".
- `express.Router({ caseSensitive: true, strict: true })` on every router (app-level
  `app.set('strict routing')` does **not** propagate into sub-routers), so an unexpected
  shape 404s before any handler.
- FF-9 gains a live-server leg in `rbac.test.cjs`: for each raw-SQL surface, the
  trailing-slash and upper-case variants must return 401 with no session and 403 as member.

---

### F2 · HIGH · `rewrapStoredConnections` seals garbage under a rotated key, and calls it success

**Where:** `bridge/utils/crypto.cjs:63-73` (fallback), `bridge/utils/credentials.cjs:55-67`,
`bridge/server.cjs` (`CREDENTIAL_KEY = BRIDGE_ENCRYPTION_KEY || BRIDGE_API_KEY`).

**Scenario (confirmed with a script):** a server install that already had `BRIDGE_API_KEY`
holds pre-marker ciphertext. The operator upgrades to 0.9.0 and follows
`docs/operations.md` ("a dedicated key is preferred") by setting `BRIDGE_ENCRYPTION_KEY`.
On boot: `decrypt(legacy, newKey)` → auth fails → fallback returns the base64 blob as
"plaintext" → `encrypt(blob, newKey)` → config now holds `enc:v1:` around garbage →
log says **"Encrypted N stored connection password(s) at rest."** Every connection then
fails at the database as "Query execution failed", and the marker now asserts the value
is good. Nothing in the product can undo it.

**This is the real answer to prompt question 2:** the worst case of the fallback is not
"returns a wrong password" — it is "returns a wrong password, then permanently signs it".

**Fix:** legacy values were by construction written under `BRIDGE_API_KEY`, so rewrap
with that: `rewrapStoredConnections(store, { legacyKey: BRIDGE_API_KEY })` →
`encrypt(decrypt(v, legacyKey), newKey)`. If there is no legacy key and the value is
shaped like a packed blob (valid base64, ≥ 32 bytes), leave it and warn — never rewrap
on a fallback. Add the startup verification from F4 so a wrong key is announced.

---

### F3 · HIGH (desktop) · `credentialKey()` overwrites a key it could not read

**Where:** `electron/main.cjs:39-57`.

The comment says "say so plainly instead of silently minting a replacement". The code
logs, then falls through to `randomBytes` + `writeFileSync` **over the same file**.
Triggers: a transient read failure (AV lock, `EBUSY`), a DPAPI hiccup, or — on Linux —
`safeStorage.isEncryptionAvailable()` flipping between runs (keyring present/absent), so
a plaintext file is fed to `decryptString` (throws) or a sealed blob is handed back as
the key. `console.error` in the Electron main process is invisible in a packaged app.
Outcome: every `enc:v1:` credential is permanently undecryptable and presents as F4's
generic per-KR failure.

**Fix:** never overwrite — rename aside to `credential-key.unreadable-<stamp>` first;
tag the file with its sealing mode (`sealed:` / `plain:` prefix — the `enc:v1:` lesson
applied to the key itself); surface through `bridge:status.error` so the toast path built
today shows it.

---

### F4 · MEDIUM · Q1: prose is not enough — and the prose does not cover the case that matters

1. **Nothing detects an undecryptable marked value.** `rewrapStoredConnections` inspects
   only *unmarked* values. A desktop backup restored on another machine/account (or F2, or
   F3) produces no startup line, no health flag — just "Query execution failed" per KR.
2. **The warning is addressed to the wrong reader.** `docs/operations.md:49-54` speaks of
   `BRIDGE_ENCRYPTION_KEY`; the desktop user never set it and does not know a key exists.
   `credential-key` appears nowhere in `docs/` or `HelpModal`.
3. **"Paired" is only true for the scheduler.** Restore (`operations.md:74-78`) still says
   replace `broadcastokr.db`; the cron and `cp` examples copy only the `.db`;
   `GET /api/sync/backup` (`routes/sync.cjs:205`) still returns only the `.db`.

**Fix:** (a) at startup, try-decrypt every marked value and log
`N stored credentials cannot be decrypted with the current key (restored from another
machine? key rotated?)`; expose `credentials: { unreadable: N }` on `/api/health` and show
it in `SystemHealthPanel`; (b) write a `keyId` (sha256 prefix) into `config.json` so the
mismatch is diagnosable before trying; (c) make Restore, the examples and the API match
the pair; (d) one desktop-facing sentence in HelpModal: "restored on another machine or
Windows account, database passwords must be re-entered".

---

### F5 · MEDIUM · D-1 regressed live-KR sync for managers in cloud modes

**Where:** `src/pages/GoalsPage.tsx:229, 323, 338-378, 415`, `src/pages/ComparePage.tsx:181`
→ `executeBatch` → `POST /api/kpi/execute-batch` → `ownerOnly`.

**Confirmed:** manager → 403 on execute-batch, 200 on sync-now. The backlog closed
Assumption 5 by making `/api/kpi/sync-now` `canEdit` — but the frontend's goal-level
sync never calls `sync-now` (that is only the dashboard `LiveKPIPanel`). Auto-sync on
create/edit, per-goal sync, "Sync All Live KRs" (button shown to every role at
`GoalsPage.tsx:568`), materialize auto-sync and Compare all use execute-batch. A manager
creating a goal with a live KR now gets "Sync failed" on every create. The bridge loop
recovers the value within 15 min, so no data is lost — the role that creates goals just
sees an error each time. `rbac.test.cjs` tests member and owner only; no manager case.

**Root cause is in the plan:** "raw vs stored SQL" was decided per *route*, but the
frontend uses the raw route to sync stored SQL. ST0 walked routes, not flows.

**Fix:** a stored-SQL endpoint — `POST /api/kpi/sync-goals { goalIds }` at `canEdit`,
reading `liveConfig` from SQLite and running `executeScalarQuery`; GoalsPage flows switch
to it; execute-batch stays `ownerOnly` for Compare/ad hoc. Add the manager case to
`rbac.test.cjs`.

---

### F6 · MEDIUM · Wizard: `StepGoal` loses track of the goal it created

**Where:** `src/components/wizard/steps/StepGoal.tsx:64-84`.

`addGoal(goal)` runs before `executeBatch`. If the batch *throws* (bridge down, 403 for a
manager per F5, network) the catch sets `error` but never patches `goalId`, so `created`
stays false: the form is still there, the button still says "Create goal and fetch the
number", and a retry creates a second goal. "Skip for now" is also offered, leaving an
orphan the user was told was not created.

Also: the `goal` and `kpi` steps apply to every role, but `addGoal` needs `canCreate` and
`saveKPI` needs `canEdit`. `WizardContext` carries only `isOwner`, so a member walks into
"kept locally" toasts and 403s — exactly what the `wizardSteps.ts` comment says the
registry prevents.

**Q5 verdict:** partial state is the right call and is recoverable — every record is an
ordinary one, visible on Clients/Goals/Dashboard. The defect is bookkeeping, not policy.

**Fix:** `patch({ goalId, goalTitle })` immediately after `addGoal`; add
`canCreate`/`canEdit` to `WizardContext` and gate the two steps.

---

### F7 · LOW-MEDIUM · `POST /api/config` is a second, unprotected credential write path

**Where:** `bridge/routes/whatson.cjs:33-54`. Incoming `connections[].password` is stored
as sent — no `encrypt()`, no `cipher.unprotected` refusal. Pre-existing and not called by
the frontend, but it falsifies D-2's "nothing new is written unprotected": plaintext sits
until the next restart (with a key) or forever (cloud, no key).

**Fix:** run incoming passwords through the same guard + `encrypt`, or drop `connections`
from `ALLOWED_KEYS`.

---

### F8 · LOW · `bridge-process.log` grows without bound — confirmed defect

**Where:** `electron/main.cjs:128`, multiplied by `bridge/middleware/logging.cjs:33`.

Morgan tees every request to stdout whenever `BRIDGE_API_KEY` is unset — which is the
packaged-desktop configuration (Electron sets `BRIDGE_ENCRYPTION_KEY`, not `API_KEY`).
`App.tsx:130` polls `/api/sync/changes` every 5 s → ~17k lines/day ≈ 1.5–2 MB per day
the app is open; an always-open install ≈ 0.6 GB/year. It also duplicates
`logs/bridge.log`, which *is* rotated (30 days).

**Fix:** truncate the file on each `startBridge()` — its stated purpose is "why did the
last start die", and last-run-only is exactly that. Separately, make the stdout tee an
explicit `BRIDGE_LOG_STDOUT` rather than the API-key heuristic.

---

### F9 · LOW · Connector agent: `enc:` vs `enc:v1:` off-by-prefix

**Where:** `bridge/agent.cjs:60` — `startsWith('enc:') → decrypt(password.slice(4))`.
A value produced by today's `encrypt()` (the only tool that exists) pasted into the agent
config becomes `v1:…` after the slice → legacy fallback → passthrough → the agent uses
`v1:n/hs…` as the database password. Reproduced.

**Fix:** `decrypt(password, dataKey)` with no slicing; `isEncrypted` decides.

---

## Minor notes (no action required today)

- `/api/kpi/execute` (`whatson.cjs:296-308`) is a **fourth** scalar copy with no NaN
  guard → `NaN` lands in `kpi-history.json`. The plan said "triplicated".
- `test-connection` (`whatson.cjs:64`) calls `decrypt()` outside the try; a marked value
  under a wrong key would 500 via the error handler. API-only; the UI sends plaintext.
- FF-9 enumerates only the router; an `app.post` added directly in `server.cjs` is
  invisible. Cheap sentinel: no file other than `routes/whatson.cjs`, `liveSync.cjs`,
  `agent.cjs` may reference `executeScalarQuery|runQuery|getPgPool|runOracleQuery`.

---

## Cleared — checked, it holds

| # | Area | Verdict |
|---|---|---|
| 2 | `decrypt()` plaintext → wrong plaintext | **Holds.** GCM authentication makes a false decrypt negligible; every sample (`hunter2`, empty, base64-shaped, 64×`a`) passes through. The danger is F2, not this. |
| 3 | `concretePath()` false pass | **Holds** for the current rules — no rule can be fooled by the `x` substitution. The weakness is F1 (semantic, not lexical). |
| 3 | Data plane outside the router | **Holds.** `core.*` is referenced only in `routes/whatson.cjs`, `liveSync.cjs` (a loop, not a route) and `agent.cjs` (runs on the agent's side). |
| 6 | Scalar seam | **Holds.** Diffed all three former copies: `no_data`/NaN/timeout/first-column semantics identical; `isNaN` → `Number.isNaN` is equivalent on a `Number()` result; batch-failure logging preserved via `messages.failed`; the only delta is the declared agent timeout status. |
| — | Version surfacing, generated periods, `periodOptionsIncluding` | Fine. |
| — | 0.9.0 | Not relitigated. |

## On the plan itself

D-1's framing was right and its priority was right. Two things the plan could not see:

1. The trust boundary was drawn at the POLICY table, but the boundary's floor is path
   canonicalisation — and `isSessionExempt` two middlewares above it is `startsWith('/api/')`.
   Nobody listed canonicalisation as part of the boundary, so nobody tested it. FF-9 should
   have a live-server leg, not just a table walk.
2. "Raw-SQL surface" was classified per route while the app syncs stored SQL through the
   raw route. The stored-SQL endpoint (F5) is the missing piece of the design, not a patch.
