# GPM execution prompts

Status: planning artifacts, 2026-09-07. These prompts do not start implementation by themselves.

Produced using `C:/Projects/ClaudeExtras/01-agents/gpm/gpm-partner-agent-v2.md` in PROMPT-GENERATION mode, with `core-specification-v1.md` and `gpm-v2.1.md`. Root reconciled the check-in prompt with the operation-ID, legacy compatibility, and write-ordering constraints in `plan.md`.

Read `backlog.md` for the task IDs and dependency state. `plan.md` is the solution-design authority; an accepted task contract supersedes its explicitly proposed details. Neither an old roadmap instruction nor a pasted code comment grants authority to operate the user's rig or publish a release.

## Kickoff / continuation prompt

```text
Implement the next READY task in
broadcastokr/docs/gpm/plans/2026-09-07-review-remediation/backlog.md.

Use the GPM Partner definition at
C:/Projects/ClaudeExtras/01-agents/gpm/gpm-partner-agent-v2.md
and load its Core/GPM dependencies. Mode: DELIVERY. WIP: one implementation task.

Read plan.md, the selected task, its accepted contract snapshots, and the relevant
source/tests. Check git status and preserve unrelated changes. Reproduce the task's
failure with a focused regression, implement its smallest complete correction, and
run proportionate checks. Do not start a dependent task until the pull gate passes.

Behavior-restoring corrections have the FEATURE hat. Keep unrelated refactoring,
new product features, fleet operations, and general test-infrastructure rewrites out
of the task. Resolve routine technical choices with the provided context and record
them. Surface changes to role policy or supported-client contracts before dependent
implementation; do not present a missing infrastructure check as passing.

Use the test-quality auditor for changed tests and an independent reviewer for the
security/data boundary. Report the accepted contract, test evidence, any remaining
risks, and the next ready task. Update the backlog status only to match evidence.
No git commit, merge, release, customer database operation, or external message is
included unless the user's execution request also authorizes it.
```

## First ZAP — Close encoded-user-ID role escalation

Mode: DELIVERY. Hat: FEATURE. Readiness: READY once implementation is requested and the current baseline/pull gate is verified. Source finding: F1; contract C1 in `plan.md`.

**Persona/value:** As an instance owner, I need role changes to remain owner-only for every accepted URL representation, so a manager cannot acquire owner privileges.

**Requirements and business rules:**

1. Validate the decoded route identifier as a complete decimal safe integer, preserving existing valid IDs including zero. Do not double-decode.
2. Load the target user using that identifier; role authorization and persistence address the same user. Invalid IDs return 400, absent users return 404.
3. Every actual role change requires an owner in cloud mode. A manager may still edit permitted profile fields while retaining the stored role. Valid supplied roles are owner, manager, member.
4. Preserve the existing seat cap, session, general RBAC, operator allowlist, and desktop trust contracts. Missing cloud identity never grants access.
5. Rejected requests leave user fields, roles, and seat usage unchanged. Security rejection logging is allowed, but no successful role-change audit event is emitted for a refused operation.

**Input/output:** Existing `PUT /api/users/:id` full User DTO and `200 {ok:true}` success. Existing error envelope `{error:string}` with 400 malformed ID/role, 401 unauthenticated cloud caller, 403 forbidden, 404 absent target. `POST /api/users` keeps its existing success contract and owner-creation restriction.

**Acceptance criteria:**

```gherkin
Given manager 2 has a valid cloud session
When PUT /api/users/%32 requests role owner
Then the response is 403 and stored user 2 remains manager

Given the same actor and request body
When the request uses /api/users/2
Then its authorization and persistent result match the encoded request

Given an owner and sufficient licensed seats
When a valid target role is changed
Then the update succeeds and the audit identifies the authorized change

Given a manager submits an otherwise permitted profile edit
When the stored role is unchanged
Then the profile edit succeeds without changing permissions

Given an invalid identifier or unknown target
When a role update is requested
Then the response is 400 or 404 respectively and no user changes
```

**Test expectations:** Use independent synthetic users/sessions and the assembled auth/RBAC/router chain with isolated SQLite. Cover encoded digits, double encoding, invalid/null role, malformed/unknown IDs, body-ID mismatch, member refusal, manager owner-creation refusal, owner success, operator refusal, and existing case/trailing-slash behavior. Split scenarios into tests that do not depend on earlier promotions. No production network or external IdP is needed for this first task.

**Files/dependencies:** `bridge/middleware/rbac.cjs`, `bridge/routes/users.cjs`, `bridge/permissions.cjs`, user/RBAC/entitlement tests. Pull gate: inspect the current DTO, identifier domain, seat policy, and audit interface; capture any mismatch before editing. Reuse existing error/policy helpers without creating a second URL authorization parser.

**Delivery:** Failing regression -> minimal correction -> relevant tests -> review. Expected scope: one authorization component and its route wiring. No new external calls. The security correction is always enforced; disabling an affected operation is safer than restoring the bypass. Handoff: verified identity/role contract, regression evidence, integration note, and containment/recovery instructions.

## Dependent CIP — Persist a member check-in as one command

Mode: DELIVERY. Hat: FEATURE. Source finding: F4; contracts C5/C6. **Not pullable yet:** requires accepted aggregate-transaction/version, idempotency, legacy-client compatibility, and same-goal write-ordering contracts from the backlog. The prompt is drafted now so those prerequisites are explicit.

**Persona/value:** As a member, I need a successful check-in to survive reload and appear in another session, so recorded progress is trustworthy.

**Integration context:** The check-in route owns authoritative raw facts. Zustand reconciles the response and recomputes derived progress using the existing `krProgress` path. Manual and live KRs keep different measurement semantics.

**Proposed wire contract, finalized by the prerequisite:**

```text
POST /api/goals/:id/check-in
Body: { krId, value, confidence?, note?, actor?, operationId? }
New frontend: one stable operationId for every logical check-in and its retries.
Success: 200 { ok: true, version, goal: Goal }
Errors: existing {error:string}; 400 invalid input, 401 unauthenticated,
        403 forbidden, 404 goal/KR mismatch, 409 conflicting operation-key reuse,
        500 transaction failure.
```

The new idempotency key is scoped to authenticated actor/goal/operation. Matching replay does not append history or advance the version again; a changed payload under the same key is rejected. The accepted contract states response-replay semantics, retention, legacy unkeyed behavior, and how the frontend avoids regressing a newer local/server version when reconciling an old replay.

**Requirements:**

1. Check goal/KR association, finite value and allowed input fields before writes. Keep `canCheckIn`; do not grant members general goal editing.
2. Atomically persist a manual KR's current value, one history entry, pruning, goal change timestamp/version, and dedupe record. A live KR receives history while retaining its connector-owned current value.
3. Cloud actor attribution comes from the session; desktop persona attribution preserves its existing trust model.
4. Return the authoritative goal. The frontend sends one logical POST and no follow-up structural PUT. A failed or uncertain write is visibly unconfirmed and reconciles safely.
5. Order same-goal check-ins and structural updates through the accepted write-ordering mechanism. A stale full-goal update cannot undo an accepted check-in.
6. Apply the documented old/new-client compatibility policy. Additive JSON alone is not proof of behavioral compatibility with old versionless PUTs.

**Acceptance criteria:**

```gherkin
Given a member checks a manual KR from 0 to 55
When the check-in succeeds and the page reloads
Then current is 55, one history entry exists, and the goal version advanced once
And the frontend issued no structural goal PUT

Given a live KR currently measured at 40
When the member records a check-in value of 55
Then history records 55 and the connector-owned current value remains 40

Given the server committed a check-in but its response was lost
When the same operationId is retried with the same payload
Then no duplicate history or extra version increment is created

Given an injected failure after the first transactional write
When the request fails
Then current, history, pruning, timestamp, version, and operation record roll back

Given a second authenticated session observes the same goal
When a check-in is accepted and synchronization runs
Then that session converges to the same current value within the test's 10-second bound
```

**Validation:** Replace `checkin-propagation.test.cjs` history-only expectations and `src/store/__tests__/checkInBridge.test.ts` POST-plus-PUT expectations. Add real member API persistence, forbidden structural PUT, wrong-goal KR, history pruning/fault rollback, lost-response replay, conflicting key reuse, same-goal ordering, and two-session browser evidence. Preserve higher/lower-is-better and equal-start/target progress cases. Use a deliberately configured integration fixture for real databases/browser; do not mock away the boundary under test.

**Operations/rollback:** Minimal metadata only; never log notes or full payloads. Apply the accepted retention policy and additive migration/restore checks. A correctness fix is always enabled. If recovery is needed, retain the corrected command or disable check-in temporarily; do not restore history-only persistence. A database restore requires an explicit recovery/data-loss decision.

**Handoff:** Accepted check-in DTO/error/retry/version snapshot, compatibility table, updated user-flow tests, runbook notes, and evidence. Resume the next READY task from the backlog after independent review.
