#!/usr/bin/env bash
# Regenerates docs/saas/evidence/ — the security-questionnaire attachment.
# Run from broadcastokr/: bash scripts/generate-evidence.sh
set -uo pipefail
cd "$(dirname "$0")/.."
OUT=docs/saas/evidence
mkdir -p "$OUT"

stamp() { echo "# Generated $(date -u +%FT%TZ) — $1"; }

{
  stamp "server-enforced RBAC UI-bypass battery (bridge/__tests__/rbac.test.cjs)"
  node --test bridge/__tests__/rbac.test.cjs 2>&1 | grep -E "^# Subtest|^# (tests|pass|fail)|ok [0-9]" | sed 's/^/  /'
} > "$OUT/rbac-bypass-battery.txt"

{
  stamp "OIDC sign-in + fail-closed identity (bridge/__tests__/auth-oidc.test.cjs)"
  node --test bridge/__tests__/auth-oidc.test.cjs 2>&1 | grep -E "^# Subtest|^# (tests|pass|fail)|ok [0-9]" | sed 's/^/  /'
} > "$OUT/oidc-flow.txt"

{
  stamp "single-tenant isolation enforcement (bridge/__tests__/tenancy-mode.test.cjs)"
  node --test bridge/__tests__/tenancy-mode.test.cjs 2>&1 | grep -E "^# Subtest|^# (tests|pass|fail)|ok [0-9]" | sed 's/^/  /'
} > "$OUT/tenant-isolation.txt"

{
  stamp "client-edition bundle exclusion (FF-1 sentinel scan)"
  TMP=$(mktemp -d)
  VITE_EDITION=client npx vite build --outDir "$TMP/dist" >/dev/null 2>&1 \
    && node scripts/check-edition-bundle.mjs client "$TMP/dist"
  rm -rf "$TMP"
} > "$OUT/bundle-exclusion.txt" 2>&1

{
  stamp "provisioning transcript (bridge/__tests__/provision.test.cjs)"
  node --test bridge/__tests__/provision.test.cjs 2>&1 | grep -E "^# Subtest|^# (tests|pass|fail)|ok [0-9]" | sed 's/^/  /'
} > "$OUT/provisioning.txt"

{
  stamp "connector agent: enrolment, scalar-only ingest, revocation (bridge/__tests__/agent.test.cjs)"
  node --test bridge/__tests__/agent.test.cjs 2>&1 | grep -E "^# Subtest|^# (tests|pass|fail)|ok [0-9]" | sed 's/^/  /'
} > "$OUT/agent-lifecycle.txt"

{
  stamp "shared-metrics channel end-to-end + FF-4 projector (sharePayload + cockpit-channel tests)"
  node --test bridge/__tests__/sharePayload.test.cjs bridge/__tests__/cockpit-channel.test.cjs 2>&1 | grep -E "^# Subtest|^# (tests|pass|fail)|ok [0-9]" | sed 's/^/  /'
} > "$OUT/sharing-channel.txt"

echo "evidence written to $OUT"
