# ADR 2026-10-22 — Agent revoke semantics and instance pinning (R4)

**Status:** accepted (Yannick, 2026-10-22). **Readiness item:** R4 hardening residuals
(`docs/saas/2026-08-31-readiness-plan.md` §R4).

## Context

A connector agent runs at the customer site and pushes numeric KR values outbound to its
tenant instance with a per-agent bearer token. Two residuals were open since 2026-09-04:

1. What revoking an agent does. `DELETE /api/agents/:id` set `revoked_at` and the token was
   refused, but a revoked row stayed forever and nothing could remove it.
2. Whom the agent trusts. It used plain `fetch`, so any certificate the system CAs accept
   for the instance's host name was enough. A mis-issued certificate or a TLS-inspecting
   proxy at the customer site could read the agent token and the values.

A third question, where a Docker host comes from, blocks A-4, B-6, R2 and the pen test.

## Decisions

**1. Revoke keeps the row; purge is separate and explicit.**
- `DELETE /api/agents/:id` stays revoke: the token is refused (401). The row keeps its name, last-seen
  time and revoke time as the audit trail.
- `DELETE /api/agents/:id/purge` (owner only) removes a revoked agent. It refuses one that is still
  active (`409 not_revoked`). The operator channel cannot purge: `OPERATOR_ALLOW` admits only
  `DELETE /api/agents/:id`.
- Revoked agents older than 30 days are purged automatically when the bridge starts and whenever the
  agent list is read. Each purge is audited.

**2. Opt-in SPKI pinning with two slots.**
- `agent-config.json` may carry `pins`: one or two strings `sha256/<base64>`. Each is the SHA-256 of the
  instance certificate's SubjectPublicKeyInfo, as HPKP wrote it. Two slots allow key rotation: the
  current key and the next one.
- With no `pins`, the behaviour is unchanged.
- With `pins`, the instance URL must be `https:`. The normal host-name and CA checks still run, and the
  connection is refused unless the leaf key matches a pin. The refusal is logged with the key it got.
- `agent.cjs pin --instance URL [--dir DIR] [--write]` prints the instance's current pin. With
  `--write` it adds the pin to the config. It keeps at most two pins and drops the oldest.
- Hosted tenants (run by Mediagenix) get a pin at provisioning. Customer-run instances choose for
  themselves.
- This is the cheap half of mTLS. Agent client certificates remain a later step.

**3. The Docker host comes with the IT request.** The pending workspace machine request
(`C:\whatsOn\IT-REQUEST-2026-10-20.md`) is extended with Docker Engine and an isolated network for
BrOKR staging. Sending it is the owner's call.

## Consequences

- An operator who rotates the instance key without adding the next pin first stops the agent. That is
  loud by design. The runbook step is: `pin --write` with the new key before the switch, then remove
  the old pin.
- The purge removes the agent row only. Values it already pushed stay in the KR history, which
  records the source as `sync`, not the agent's id.
- Rejected: trust on first use at enrolment. It is always on, but every certificate renewal with a new
  key (the Let's Encrypt default) would silently stop agents.
- Rejected: deleting the row on revoke. That loses the trail needed in an incident.
