#!/usr/bin/env bash
# Regenerates docs/saas/evidence/ — the security-questionnaire attachment.
# Run from broadcastokr/: bash scripts/generate-evidence.sh
# Real-driver SQL acceptance is included when its env is set (see the test headers):
#   BRIDGE_RO_ACCEPTANCE_PG=…  BRIDGE_RO_ACCEPTANCE_ORA=…  bash scripts/generate-evidence.sh
set -uo pipefail
cd "$(dirname "$0")/.."
OUT=docs/saas/evidence
mkdir -p "$OUT"

stamp() { echo "# Generated $(date -u +%FT%TZ) on $(git rev-parse --short HEAD) — $1"; }

# Through run.cjs: it points config/history at a throwaway dir and blanks dev keys,
# so a suite that spawns a bridge never writes into the developer's bridge/config.json.
suite() {
  node bridge/__tests__/run.cjs "$@" 2>&1 \
    | grep -E "^# Subtest|^# (tests|pass|fail|skipped)|ok [0-9]|# SKIP" | sed 's/^/  /'
}

{
  stamp "server-enforced RBAC UI-bypass battery (rbac.test.cjs)"
  suite bridge/__tests__/rbac.test.cjs bridge/__tests__/ff9-policy-coverage.test.cjs
} > "$OUT/rbac-bypass-battery.txt"

{
  stamp "OIDC sign-in + fail-closed identity (auth-oidc.test.cjs)"
  suite bridge/__tests__/auth-oidc.test.cjs
} > "$OUT/oidc-flow.txt"

{
  stamp "single-tenant isolation enforcement (tenancy-mode.test.cjs)"
  suite bridge/__tests__/tenancy-mode.test.cjs
} > "$OUT/tenant-isolation.txt"

{
  stamp "client-edition bundle exclusion (FF-1 sentinel scan)"
  TMP=$(mktemp -d)
  VITE_EDITION=client npx vite build --outDir "$TMP/dist" >/dev/null 2>&1 \
    && node scripts/check-edition-bundle.mjs client "$TMP/dist"
  rm -rf "$TMP"
} > "$OUT/bundle-exclusion.txt" 2>&1

{
  stamp "provisioning transcript (provision.test.cjs)"
  suite bridge/__tests__/provision.test.cjs
} > "$OUT/provisioning.txt"

{
  stamp "connector agent: enrolment, owner-only identity + data key, encrypt-password, scalar-only ingest, revocation (agent.test.cjs)"
  suite bridge/__tests__/agent.test.cjs
} > "$OUT/agent-lifecycle.txt"

{
  stamp "R4 (ADR 2026-10-22): SPKI pinning, revoke keeps the trail, owner purge, 30-day sweep"
  suite bridge/__tests__/agent-pinning.test.cjs bridge/__tests__/agent-revoke-purge.test.cjs bridge/__tests__/agent-bundle.test.cjs
} > "$OUT/agent-hardening.txt"

{
  stamp "shared-metrics channel end-to-end + FF-4 projector (sharePayload + cockpit-channel tests)"
  suite bridge/__tests__/sharePayload.test.cjs bridge/__tests__/cockpit-channel.test.cjs
} > "$OUT/sharing-channel.txt"

{
  stamp "operator channel cockpit → instance: closed allow-list, audited operator principal (operator-channel.test.cjs)"
  suite bridge/__tests__/operator-channel.test.cjs
} > "$OUT/operator-channel.txt"

{
  stamp "FF-8 licence tiers and caps, enforced server-side (entitlements.test.cjs)"
  suite bridge/__tests__/entitlements.test.cjs
} > "$OUT/entitlements.txt"

{
  stamp "read-only SQL envelope (ADR-A2): scanner corpus + driver lifecycle; real-driver acceptance when configured"
  suite bridge/__tests__/sql-envelope.test.cjs bridge/__tests__/pg-readonly-acceptance.test.cjs bridge/__tests__/oracle-readonly-acceptance.test.cjs
  echo "  (a SKIP on the acceptance suites means no disposable database was configured for this run;"
  echo "   the last real-driver run is recorded in docs/saas/readiness/r1-findings.md #38/#39)"
} > "$OUT/sql-envelope.txt"

{
  stamp "data integrity: atomic aggregates, check-in command, deletion reconciliation, graceful shutdown"
  suite bridge/__tests__/aggregate-atomicity.test.cjs bridge/__tests__/review-remediation-b.test.cjs \
    bridge/__tests__/sync-deletions.test.cjs bridge/__tests__/graceful-shutdown.test.cjs bridge/__tests__/backup.test.cjs
} > "$OUT/data-integrity.txt"

{
  stamp "dependency audit (npm audit, runtime = what the instance image installs)"
  echo "  bridge runtime (bridge/package-lock.json, --omit=dev):"
  (cd bridge && npm audit --omit=dev 2>&1 | tail -1 | sed 's/^/    /')
  echo "  app + tooling (package-lock.json):"
  npm audit 2>&1 | grep -E "^[a-z@].*  |vulnerabilit" | sed 's/^/    /'
} > "$OUT/dependency-audit.txt"

{
  stamp "release provenance: the last runs of the tag-driven release workflow (.github/workflows/release.yml)"
  if command -v gh >/dev/null 2>&1; then
    gh run list --workflow release.yml -L 5 --json displayTitle,headBranch,conclusion,createdAt,url \
      --template '{{range .}}  {{.createdAt}}  {{.headBranch}}  {{.conclusion}}  {{.url}}{{"\n"}}{{end}}' 2>&1 \
      || echo "  (gh could not list runs)"
  else
    echo "  (gh not installed — list the Release workflow runs on GitHub)"
  fi
} > "$OUT/release-runs.txt"

echo "evidence written to $OUT"
