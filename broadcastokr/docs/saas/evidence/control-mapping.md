# Control Mapping — Client Edition Security Bar (2026-08-31)

Maps the pre-first-client minimum bar (`2026-08-31-security-design-review.md` §7) to
implemented controls and their proof. Regenerate the `.txt` evidence with
`bash scripts/generate-evidence.sh`.

| # | Bar item | Control | Proof |
|---|---|---|---|
| 1 | SSO + MFA + server sessions; no shared/baked browser credentials | OIDC Authorization Code + PKCE (`bridge/routes/auth.cjs`); opaque server-side sessions, HttpOnly/SameSite cookies, 8h sliding / 7d absolute (`bridge/sessions.cjs`); cloud builds carry no `VITE_BRIDGE_API_KEY` path — sessions only; cloud instances refuse to start without OIDC config (fail-closed, `server.cjs`) | `oidc-flow.txt`; fail-closed test in the same suite |
| 2 | Server-enforced RBAC, proven by UI-bypass tests | Declarative policy table over all route families (`bridge/middleware/rbac.cjs`): member = check-ins/kanban; manager = create/edit; owner-only = deletes, clients, credentials, config, raw SQL, backup, migration, role changes (incl. self) | `rbac-bypass-battery.txt` |
| 3 | Persistent, append-only audit with server-derived actors | `activity_log` (migration 002, 90-day retention); server-side emission for sign-in/out, role changes, connection/config changes, sharing-flag flips (`bridge/audit.cjs`); cloud modes ignore client actor claims | audit assertions inside `rbac-bypass-battery.txt` |
| 4 | Agent hardening bundle | **Implemented (v1)**: one-time 15-min enrolment tokens → per-agent revocable bearer tokens (hashed); outbound-only pushes; the agent's SQL lives solely in its local operator-owned config (no SQL or commands over the network); `{krId, value:number, timestamp}` is all that can serialize; optional `AGENT_DATA_KEY` for config credential encryption; SELECT-only guard + DB-side cancellation underneath. **Residuals:** cert-bound mTLS; OS-keystore key storage; read-only DB account is an install-guide requirement per client | `agent-lifecycle.txt` |
| 5 | Opt-in egress enforcement, push-only cockpit channel | **Implemented**: allowlist projector is the single builder of outbound data (FF-4 sentinel-proven, shipped before the channel); push-only — the cockpit holds no credentials against instances; per-tenant write-only tokens (hashed, owner-minted, re-mintable); strict cockpit-side schema validation rejects unknown fields and non-numeric values, audited. v1 shares krId/value/target/direction/timestamp only. **Open contract question:** delete-on-revoke of previously shared rows (logged for legal) | `sharing-channel.txt` |
| 6 | TLS/HSTS, encryption at rest, EU residency | Deployment-level: instances sit behind the platform's TLS termination (`trust proxy` set; cookies `Secure` on https base URLs); at-rest and region are provisioning/platform choices per instance | provisioning env (`BRIDGE_BASE_URL` https) |
| 7 | Isolation evidence: scripted provisioning + cross-tenant tests | Dedicated instance per client (`scripts/provision-instance.mjs`, refuses overwrite, 0600 env, seeded pinned client); single-tenant enforcement server-side (2nd client / last-client-delete → 403); client bundles physically exclude fleet surfaces | `provisioning.txt`, `tenant-isolation.txt`, `bundle-exclusion.txt` |
| 8 | Backups/DR, IR/vuln process | Automated online snapshots (startup + daily, keep 14) per instance; snapshot-consistent download owner-only; IR/vuln process = Mediagenix partnership scope (**transfer to be confirmed in writing** — open) | `bridge/utils/backup.cjs` + backup tests |

Residual items before a Disney-grade questionnaire: MFA enforcement is delegated to the
client's IdP policy (document per client); external pen test to schedule; SOC2/ISO
umbrella coverage via Mediagenix to confirm in the partnership agreement.
