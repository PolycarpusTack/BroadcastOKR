# Pickup Prompt — Next Session

## 2026-09-04 (later today) — R4 residual decisions, then R5; R2 waits for a Docker host (paste this block)

We're continuing BroadcastOKR (app in `broadcastokr/`). Read, in order: this block, then the
"2026-09-04 (evening)" block below it (full R3/R7/R6 detail, rig facts, gotchas — all still
true), `docs/gpm/state/r3-backlog-2026-09-04.md`, `docs/saas/2026-08-31-readiness-plan.md`
§R4/§R5/§R2, `docs/saas/readiness/r1-findings.md` (daily log — day-2 line is Yannick's).
`CLAUDE.md` is current.

**Status:** main `6540e88` (code at `09e3a44`, R3 merge), CI green, working tree clean, no open
branches with unmerged work. Released: `v0.9.2` by CI alone. Readiness: R1 rig on day 2, R3,
R6, R7 DONE; open R4 (hardening residuals), R5 (evidence pack), R2 (fleet ops — needs a Docker
host). Suites: 301 vitest · 206 bridge (205 on Windows) · lint 0 · build green. Rig: cockpit
:3100, tenant0 :3101 (enterprise, caps 10/5/2), Keycloak :8081, agent every 60 s — all running
`09e3a44`; the Startup-folder shortcut brings it back after a reboot (Oracle services need an
elevated `Start-Service` first).

**What to launch first (5 minutes, no decisions needed):**
1. `gh run list --limit 3` — confirm main is still green; `git status` clean.
2. Rig pulse: the three ports listening, `local-rig/tenant0/bridge.out.log` tail shows
   `[agent] local-agent: applied 2 value(s)` within the last minute, no new lines in
   `bridge.err.log`. If anything is down: `scripts/local-rig/start-rig.ps1` (idempotent).
3. R3-3 hand walk on the rig (owner on tenant0 → System Health shows the licence line; cockpit
   → Tenant Zero → "Licence and usage" card). Optional: one restart with
   `BRIDGE_TIER=starter` to see the Goals page degrade, then put enterprise back.
4. Then open the R4 decisions with Yannick (below) before touching code.
5. R6-6 "say which edition this is" is **DONE** (same day): sign-in card, sidebar brand
   (amber for the cockpit) and browser title read "MGX Cockpit" vs "Client · Tenant Zero".
   Rig bundles were rebuilt from the working tree; a hard refresh on :3100 / :3101 shows it.

**Model routing for what remains** (which model should hold which task — pick per task, not per
session):
| Task | Model | Why |
|---|---|---|
| R4 decisions framing (delete-on-revoke default, agent cert pinning vs mTLS, signed-licence residual), the ADR text, and any threat-model reasoning | **Fable 5.1** (this model) | trade-offs with security consequences; one wrong default is expensive |
| R4 implementation once decided (pinning in `agent.cjs`, revoke semantics in `routes/agent.cjs`, tests) | Opus 5 | well-specified, test-first, touches the audited surfaces — needs care, not exploration |
| R5 evidence pack: extend `scripts/generate-evidence.sh` with FF-8 output, the v0.9.2 run, the operator channel; mock questionnaire answers | Sonnet 5 | mechanical assembly from existing artefacts; verify by reading the output |
| Rig walks, log reading, daily-line drafting, `r1-findings.md` rows | Haiku 4.5 or Sonnet 5 | observation and transcription; escalate anything that looks like a defect |
| R2 (manifests, upgrade path, monitoring, restore drill) — **when a Docker host exists** | Opus 5, with Fable 5.1 for the rollback/restore design | infrastructure with real failure modes |
| Code review of any merge before pushing (`/code-review`), and anything that touches `middleware/auth.cjs`, `rbac.cjs`, `entitlements.cjs`, the share allowlist | Fable 5.1 | the security boundaries; every past regression here was a shape mismatch a fast model would wave through |
Subagents: an Explore agent for "where does X live" sweeps; never hand a subagent a git push or
a rig restart.

**Decisions to ask Yannick at pickup (R4):** (a) agent revoke = keep the row and refuse
(today) vs delete the row and its history — recommend keep-and-refuse, with a purge action
after 30 days; (b) certificate pinning on the agent side now (SHA-256 of the instance cert in
`agent-config.json`, refuse on mismatch) — recommend yes, it is the cheap half of mTLS;
(c) where a Docker host for R2 and the pen test can come from (Mediagenix staging? a cloud
VM?) — this is the blocker for the last two EPICs.

---

## 2026-09-04 (evening) — R3 done; next R4 residuals (decisions), R2 needs a Docker host (paste this block)

We're continuing BroadcastOKR (app in `broadcastokr/`). Read, in order:
`docs/gpm/state/r3-backlog-2026-09-04.md` (R3 DONE — tier map, licence carrier, FF-8),
`docs/gpm/state/r7-backlog-2026-09-04.md` (R7 DONE — the release pipeline),
`docs/saas/2026-08-31-readiness-plan.md` §R4, §R5, §R2 (what remains), and
`docs/saas/readiness/r1-findings.md` (37 findings; daily log — day-2 line is Yannick's).
`CLAUDE.md` is current.

**Where we are:** main is `09e3a44`, CI green. Since the last block: **R3** shipped —
licence tiers starter/pro/enterprise and caps (channels, seats = owners+managers, agents) as
plain values in the provisioned env; server-side gates (`403 entitlement` / `entitlement_cap`),
loops start only when licensed, `GET /api/usage` and the cockpit's `GET /api/cockpit/usage`
(invoicing input), UI degrades per tier, FF-8 `entitlements.test.cjs` spawns an instance per
tier. Before that: **R7** (v0.9.2 by CI alone), **R6** complete, **D-3**. Suites: 301 vitest ·
206 bridge (205 on Windows — the `0600` case) · lint 0 · build green. Migrations to 010.

**Readiness plan status:** R1 (rig running, day 2), R3, R6, R7 DONE. Open: **R4** hardening
residuals (agent mTLS/pinning, delete-on-revoke decision, external pen test commissioning,
plus the new residual "signed licence for instances outside Mediagenix's control"), **R5**
compliance evidence pack, **R2** fleet-ops machinery (manifests, upgrade path, monitoring,
restore drill) — **R2 and the pen test need a Docker host / staging**; this PC has none.

**Rig (this PC):** restarted on `09e3a44`; tenant0's `.env` now carries
`BRIDGE_TIER=enterprise` with caps channels 10 / seats 5 / agents 2 (the sharing channel needs
enterprise; the caps make the Licence card and System Health line non-trivial). R3-3's hand
walk is the first step: as owner on tenant0, System Health shows "licence enterprise · caps …";
on the cockpit, Tenant Zero's modal shows "enterprise licence" in the status line and the
"Licence and usage" card. Then flip tenant0 to `BRIDGE_TIER=starter` for one restart and
confirm the Goals page loses the live toggle and Templates, the sync loop line disappears from
the startup banner, and `/api/kpi/execute-batch` answers 403 — then put enterprise back.

**Next — R4 residuals that need no infrastructure (decisions first, ask Yannick):**
1. Delete-on-revoke for agents (both behaviours exist; pick the default, wire it, document it).
2. Agent identity hardening: 0600 file + optional OS keystore; certificate pinning of the
   instance on the agent side (a pinned SHA-256 of the instance's TLS cert in
   `agent-config.json`, refuse on mismatch) is the cheapest real step toward mTLS.
3. Signed licence design note (residual): what the cockpit would sign, how instances verify.
Then **R5** (evidence pack: generate-evidence.sh exists — extend with FF-8 output, the release
run, the operator channel). **R2** waits for a Docker host — raise it with Yannick.

**Parallel:** Yannick installs 0.9.2 on the remote desktop against populated support
databases. Watch findings 16 (thin mode) and 4/15 (channels on a real schema).

**Gotchas (still true):** the assistant's Bash tool collapses a doubled backslash — Edit tool
for those lines; Python scripted edits need `encoding='utf-8'` and per-file line-ending
detection, and each `rep()` writes immediately. Long PowerShell/gh waits go to the background
past the tool timeout — read the output file. `gh api` paths must not start with `/` here.
Fleet route literals go behind `FLEET_IN_BUILD` (FF-1). The full bridge suite now spawns
three extra instances (FF-8) — a spawn-heavy suite printing `not ok` under load passes alone;
rerun before believing it. After a `--no-ff` merge, branch again before the next story.

**Working discipline:** unchanged. GPM backlog per EPIC, branch per EPIC, commit per story,
suites + lint + build green before each commit, merge `--no-ff`, push, watch CI.
