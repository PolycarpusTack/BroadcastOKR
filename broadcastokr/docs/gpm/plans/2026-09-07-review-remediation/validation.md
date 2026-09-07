# Plan validation and implementation evidence checklist

Date: 2026-09-07. Scope: the seven findings in `plan.md` at baseline `de815e6`.

This file distinguishes review of the **plan** from evidence that a **fix** works. No implementation, test run, database contract run, container smoke, or release acceptance occurred during this planning turn.

## Agent provenance

Four separate agent invocations used the user's collection:

| Invocation | Definition | Contribution |
|---|---|---|
| GPM Partner | `C:/Projects/ClaudeExtras/01-agents/gpm/gpm-partner-agent-v2.md` | Read Core v1.0/GPM v2.1; proposed sequence, pull gates, safe recovery, first ZAP and dependent check-in CIP |
| Backlog Builder | `C:/Projects/ClaudeExtras/01-agents/gpm/backlog-builder-agent-v2.md` | Read Core v1.0/Backlog Builder v5.1; generated the two-epic queue in `backlog.md` |
| Test Quality Auditor | `C:/Projects/ClaudeExtras/01-agents/library/testing-debt-legacy/test-quality-auditor.md` | Inspected actual tests and identified missing workflow evidence, incorrect existing expectations, retry and fixture risks |
| Backlog Critic | `C:/Projects/ClaudeExtras/01-agents/library/backlog-product/backlog-critic-agent.md` | Independent second-pass validation against the Policy Kernel and authoritative Core/Builder definitions |

Root selected the scoped design, reconciled the prompts, and owns final consistency. All planning agents used the inherited available model; collection model-tier labels were treated as capability guidance. The agile planning skill informed story sizing and observable acceptance criteria.

## Independent backlog validation

**APPROVED as a planning package.** The independent critic reviewed the finished backlog after generation, using the updated C6/C7 contracts and compatibility criteria. It found no critical correction required before handing off the plan.

| Check | Result |
|---|---|
| Structure | Two epics, ten stories, 25 tasks; unique IDs and finding coverage F1-F7 |
| Dependencies | Directed acyclic graph, roots in both epics, pull gates and unblocks on every task |
| Readiness | A-1-T1 is the first pullable implementation task once implementation is requested and its baseline gate passes; design/runtime-dependent HOLDs remain explicit |
| Workflow semantics | Manual/live KR distinction, member field restrictions, aggregate rollback, and persisted/observer assertions are covered |
| Retry/compatibility | Stable operation identity, stale-body/fresh-version prevention, replay reconciliation, and actual legacy deletion fallback or version decision are explicit |
| Runtime evidence | Both SQL dialect contracts and fresh client/cockpit SSO tests are required; mock/build/health success does not replace them |
| Rollout/risk | Additive storage recovery, minimal retained metadata, proposed thresholds, and containment without restoring security defects are stated |

The critic accepted bounded SQL, check-in, and sync design refinement as prerequisites rather than falsely marking the dependent implementation ready. It also confirmed that missing external runtime evidence blocks the relevant acceptance/release gate, not the entire planning package.

Root incorporated specialist corrections before that pass: the two tests that encode broken check-in behavior are identified for replacement; per-goal ordering and old replay responses cannot regress state; additive deletion JSON is not claimed to repair old consumers. Local document checks confirmed the four artifacts exist, internal artifact links resolve, and code fences are balanced. Source files were not changed and application tests were not rerun for these documentation-only additions.

## Required evidence per finding

| Finding | Positive control | Failure/bypass proof | Acceptance evidence |
|---|---|---|---|
| F1 | Owner changes role; manager edits allowed profile fields | Manager canonical/encoded/self/other role changes refused; invalid/double-encoded IDs and body-ID mismatch cannot target a different row | Assembled authenticated HTTP chain, persisted role/profile/seat assertions, no false successful audit event |
| F2 | Repository SELECT corpus succeeds in each supported dialect | Quote/comment/stacked-statement/malformed cases rejected before execution; disposable real-driver fixtures demonstrate read-only enforcement | Unit corpus, owned adapter rejection tests, Oracle and PostgreSQL contracts, timeout/cleanup/pool reuse evidence |
| F3 | Clean client and cockpit images complete test-IdP login and callback | Missing dependency/config fails the actual sign-in smoke; anonymous protected API access remains refused | Build/run without host dependency mount, `/api/auth/me`, logout, restart, publication dependency on passing runtime checks |
| F4 | Member manual check-in persists current/history; live check-in preserves externally measured current | Lost response replay, conflicting key reuse, invalid/mismatched KR, injected rollback, stale/full-goal write races | Real member endpoint plus frontend request/reconciliation tests, reload and second-session convergence |
| F5 | Member status and existing subtask completion changes succeed | Mixed allowed/prohibited fields, assignment, metadata, subtask text/add/remove/reorder refused without partial effects | Authenticated API and full task/version readback, existing full DTO compatibility, manager/owner controls |
| F6 | Supported clients receive updated entities and remove deleted entities | Duplicate/late responses, same-time updates, delete/recreate, pending local edits, expired cursor, restart/restore, cascades | Real feed contract, store application tests, synthetic clock/cursor cases, authenticated two-session browser smoke |
| F7 | Goal/task POST and PUT commit complete valid aggregates once | Failure after first child write; malformed child, cross-parent KR ID, stale version, retries | Entire database before/after snapshots including children/history/version/timestamp and successful mutation audit |

## Tests that need changed expectations

- `bridge/__tests__/checkin-propagation.test.cjs:77` currently requires history-only persistence and an unchanged current value. Replace that manual-KR expectation with the accepted command contract; keep live-KR measurement semantics explicit.
- `src/store/__tests__/checkInBridge.test.ts:28` expects POST plus a full goal PUT. Replace it with one logical check-in operation and authoritative response reconciliation.
- `bridge/__tests__/sync-api.test.cjs` recreates SQL operations directly; its timestamp assertions do not prove endpoint change/deletion delivery. Add actual route and consumer coverage.
- `bridge/__tests__/rbac.test.cjs` and some version/check-in suites reuse state changed by earlier tests. New boundary scenarios receive independent roles/entities; do not turn this into an unrelated test-suite rewrite.
- `playwright.config.ts` currently starts a desktop/dev bridge. Cloud member/manager behavior requires an explicitly authenticated cloud fixture.
- `.github/workflows/release.yml` publishes images without a runtime OIDC smoke. A successful image build or health response cannot substitute for the dynamically imported login path.

## Fixture and assertion rules

Fast unit tests use controlled inputs/clocks and owned seams. Deliberate database, IdP, and browser integration suites use isolated fixtures with explicit setup/teardown and bounded readiness checks. The auditor's unit-isolation guidance does not justify mocking away real database enforcement or container dependency resolution.

Use synthetic names/emails/notes and disposable schema objects. No customer credentials, SQL data, running tenant sessions, or production databases enter these tests. One behavior per test may have several related assertions proving its atomic state invariant. Avoid fixed sleeps and inter-test mutation dependencies; browser eventual assertions have bounded deadlines.

## Acceptance record template

For each completed task, record:

```text
Task / finding:
Commit / working-tree identity:
Contract snapshot / migration version:
Platform, runner, database/image versions:
Failing regression before correction:
Passing commands and artifact locations:
Positive and bypass/fault scenarios:
Compatibility and recovery result:
Remaining gate, if any:
Reviewer and acceptance decision:
```

The prior 309/309 frontend and 205/206 bridge results are only the starting baseline. The single known Windows POSIX-permission mismatch stays visible; Linux CI must pass that check. Missing Oracle or container infrastructure leaves the relevant acceptance row pending, even when unit tests pass.

## Release boundary

Closure needs all seven finding rows, both clean-image SSO variants, both SQL dialect contracts, authenticated cross-client smoke, migration/restart/restore evidence for any added storage, and relevant edition/protocol/agent package checks. Security rollback never means restoring a vulnerable path. Tests and documentation are prepared before requesting any authority that an actual deployment or data recovery requires.

Acceptance of this planning package is not acceptance of code, production readiness, the broader R4 residuals, or a release.
