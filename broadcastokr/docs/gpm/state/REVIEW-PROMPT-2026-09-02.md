# Review Prompt — 2026-09-02 session

Paste the block below into a fresh session (Fable 5.1) to get an adversarial review
of everything built on 2026-09-02. Written by the session that wrote the code, so
treat its framing as a claim to test, not a summary to trust.

---

You are reviewing a day's work on **BroadcastOKR** (repo root `broadcastokr/`, main
branch, all merged and CI-green). I want an adversarial review, not a summary. The
session that produced this code also wrote this prompt — assume it is blind to its own
mistakes and look for what it would not have thought to check.

**Scope:** `git diff b925d70..HEAD` — 14 commits, 52 files, ~3200 insertions. Read
`docs/gpm/state/dataplane-backlog-2026-09-02.md` for the plan and its recorded
deviations. `CLAUDE.md` is the living architecture doc.

**Verify before trusting:** run `npm test` (expect 250), `npm run test:bridge`
(expect 118/119 — see accepted list), `npm run lint`, `npm run build`. If a claim
below does not match what the code does, the claim is wrong, not the code.

## What was built

1. **Data-plane trust boundary** (`c7aefa8`, `b606561`, `014aac8`, `00feaca`).
   `POST /api/kpi/execute-batch` took SQL from the request body and had no RBAC POLICY
   entry, so any signed-in member could run arbitrary SELECTs against any configured
   client database, unaudited. Gated owner-only + audited. **FF-9**
   (`bridge/__tests__/ff9-policy-coverage.test.cjs`) now requires every route on the
   WHATS'ON router to carry an explicit POLICY entry.
   Credentials gained an `enc:v1:` marker so "never encrypted" and "encrypted with a
   lost key" are distinguishable; cloud modes refuse to store a secret with no key.
   Scalar query execution was triplicated and is now one seam
   (`core.executeScalarQuery`).
2. **Setup wizard** (`0273cfb`, `0907e4c`) — 8 steps, edition- and role-aware,
   creating real records through ordinary store actions.
3. **0.9.0 punch list** (`dd167c2`) — version surfaced in-app and on `/api/health`;
   period options generated from the clock instead of a hardcoded 2026 list; backups
   capture `config.json` with the database as a matched pair.
4. **Packaging and desktop credentials** (`a468be3`, `2f6bc71`, `6a0ad99`) — stopped
   shipping SQLite WAL sidecars; fixed a native-ABI build-order trap that shipped two
   broken installers; Electron now generates a credential key so desktop installs can
   encrypt at all.

## Where I think the bodies are buried

Start here. These are the areas the authoring session was least certain about, ordered
by how much damage a mistake would do.

1. **Backup/restore is now separable from its key.** Backups contain `config.json` with
   encrypted credentials; the desktop key lives in `userData/bridge/credential-key`,
   sealed with `safeStorage` (OS-account-bound). Restoring a backup onto a new machine
   therefore yields credentials that **cannot** be decrypted. `docs/operations.md` warns
   about this in prose. Is a warning enough, or has "paired backup" created a false
   sense that a restore is complete? Consider whether the snapshot should record which
   key sealed it, or refuse to restore silently.
2. **`decrypt()`'s legacy fallback** (`bridge/utils/crypto.cjs`). Unmarked values try the
   old scheme and, on failure, are returned unchanged as plaintext. Construct a value
   where that is wrong — e.g. a genuine pre-marker ciphertext under a rotated key
   returning as a garbage "password", or a plaintext password that decodes far enough
   to produce a wrong plaintext rather than throwing. How bad is the worst case?
3. **FF-9 may be weaker than it looks.** `concretePath()` rewrites `:id` to `x` before
   testing POLICY regexes. Find a route shape where that produces a false pass, or where
   a POLICY regex matches a path it should not (`^/api/kpis(/|$)` vs `/api/kpi/...` is
   the bug that started all this — check the new rules for the same class of error).
   Also: FF-9 only walks the WHATS'ON router. `/api/kpi/sync-now` was moved onto it for
   coverage — what else can reach a client database and is still outside the scan?
4. **`bridge-process.log` has no rotation or size cap** (`electron/main.cjs`). Every
   stdout/stderr chunk is appended with `appendFileSync` for the life of the install.
   Estimate the growth and decide whether this is a defect. The in-memory tail is capped
   at 4000 chars; the file is not.
5. **The wizard writes as it goes.** An abandoned run leaves a real connection, client,
   goal and KPI. `StepGoal` creates the goal even when the sync afterwards fails. Is
   "partial state is better than nothing" right here, and is it recoverable from the
   normal screens?
6. **`executeScalarQuery` was a REFACTORING-hat change** with one declared behaviour
   delta (the agent now reports timeouts as `timeout` rather than `error`). Diff the
   three former copies against the seam and confirm nothing else moved —
   `/api/kpi/poll` was deliberately left out because its contract differs.

## Known and accepted — do not re-report

- `agent.test.cjs` asserts a `0600` identity file; Windows reports `0666`. Documented as
  a rig limitation in `docs/saas/readiness-instructions.md` step 6. Passes on CI Linux.
- `static-serving` / `packaging-paths` / `provision` fail only under parallel load and
  pass in isolation. Pre-existing.
- `SetupWizard.test.tsx` sets a 20s timeout: Modal-based tests here run 1-2s each under
  jsdom (HelpModal's are comparable) and a multi-step walk crosses the 5s default.
- D-3 (connections still in `config.json`, outside SQLite and outside tenancy), D-5
  (channel scope never reaches query binds — cards say "label only" instead), and D-7
  (one scalar per query) are deliberately deferred, with reasons in the backlog.
- Version is 0.9.0 **because** nothing has ever run against a real WHATS'ON database or
  a real IdP. That gap is known; do not relitigate the number.

## What I want back

Findings ranked by severity, each with file:line, a concrete failure scenario (inputs →
wrong behaviour), and your confidence. Explicitly say which of the six areas above you
cleared and why — a "checked, it holds" is as useful to me as a finding. If you think
the plan itself was wrong rather than the code, say that too.
