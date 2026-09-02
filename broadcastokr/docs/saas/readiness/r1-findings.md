# R1 Findings — local validation rig

Every mock-vs-real discrepancy, in the order found. Triage each line
**fix-now** (ships on `readiness/r1-local-rig` as its own commit) · **backlog**
(named EPIC/story) · **accepted** (with date and reason).

**Day 1:** _(date the agent pushed its first real value)_
**Rig:** cockpit :3100 · tenant0 :3101 · Keycloak :8080 · agent `local-agent`
**Dialects exercised:** ☐ Postgres ☐ Oracle
**Startup mechanism for the unattended run:** _(Task Scheduler / pm2 / other)_

## Pre-flight (2026-09-02 evening, before the run)

| # | Observation | Triage |
|---|---|---|
| P-1 | `docker` not on the Git-Bash PATH used by the assistant session; Docker Desktop state unknown from that shell. | check tomorrow (R1-0) |
| P-2 | `provision-instance.mjs` on `8ca9140` provisions cleanly (migrations 001–006, `.env` 0600). It writes `BRIDGE_PORT=3001` / `BRIDGE_HOST=0.0.0.0`; the rig needs 3100/3101 and 127.0.0.1 by hand. | accepted — documented in instructions; candidate `--port` flag if it bites twice |
| P-3 | Provisioned `.env` had no `BRIDGE_ENCRYPTION_KEY`; credentials would encrypt under the `BRIDGE_API_KEY` fallback. | fix-now (R1-0) — template now emits a dedicated key |

## Findings

| # | Story | Observation (verbatim errors welcome) | Triage | Ref |
|---|---|---|---|---|
| 1 | | | | |

## R1-5 — review-fix verification on the rig

| Check | Result |
|---|---|
| Manager: create goal with live KR → auto-sync ok (F5) | ☐ |
| Manager: edit SQL → auto-sync ok | ☐ |
| Manager: Sync All Live KRs | ☐ |
| Manager: replayed execute-batch with altered SQL → `Not a stored query` | ☐ |
| Wizard as manager: goal step shown, connection step hidden; failed sync still "created", one goal (F6) | ☐ |
| Wrong `BRIDGE_ENCRYPTION_KEY` → startup warning + Dashboard warning; restore key → clean, disk unchanged (F2/F4) | ☐ |
| Agent with an `enc:v1:` password + `AGENT_DATA_KEY` (F9) | ☐ |
| `/API/KPI/EXECUTE-BATCH` with no session → 401 on the real instance (F1) | ☐ |

## Daily log (unattended run)

| Day | Date | Values arriving | Staleness honest | Backups pairing | Notes |
|---|---|---|---|---|---|
| 1 | | | | | |
