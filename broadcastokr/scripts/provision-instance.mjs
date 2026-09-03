#!/usr/bin/env node
/**
 * Provision a BrOKR cloud instance: environment file, migrated database, and
 * the pinned client row (Client Edition). The first SSO sign-in becomes the
 * instance owner.
 *
 * Usage:
 *   node scripts/provision-instance.mjs --dir /srv/brokr-aetn \
 *     --name "A+E Networks" --mode client --base-url https://aetn.example \
 *     [--color "#F59E0B"] [--oidc-issuer URL --oidc-client-id ID --oidc-client-secret SECRET]
 *
 * Without OIDC values the .env carries placeholders and the instance will
 * refuse to start until they are filled in — by design.
 */
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import crypto from 'node:crypto';

const require = createRequire(import.meta.url);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function arg(name, fallback) {
  const idx = process.argv.indexOf(`--${name}`);
  return idx !== -1 ? process.argv[idx + 1] : fallback;
}

const dir = arg('dir');
const name = arg('name');
const mode = arg('mode', 'client');
const baseUrl = arg('base-url', 'https://CHANGE-ME.example');
const color = arg('color', '#3805E3');

if (!dir || !name || !['client', 'cockpit'].includes(mode)) {
  console.error('usage: provision-instance.mjs --dir <path> --name <client name> --mode client|cockpit [--base-url URL] [--oidc-*]');
  process.exit(2);
}

const instanceDir = resolve(dir);
if (existsSync(join(instanceDir, '.env'))) {
  console.error(`refusing to overwrite existing instance at ${instanceDir}`);
  process.exit(1);
}
mkdirSync(instanceDir, { recursive: true });

// ── Database: migrate + seed the pinned client ──

const { createDB } = require(join(ROOT, 'bridge/db/connection.cjs'));
const { runMigrations } = require(join(ROOT, 'bridge/db/migrate.cjs'));

const dbPath = join(instanceDir, 'broadcastokr.db');
const db = createDB(dbPath);
runMigrations(db, join(ROOT, 'bridge/migrations'));

const clientId = `client_${crypto.randomBytes(4).toString('hex')}`;
db.prepare('INSERT INTO clients (id, name, connection_id, color, channels) VALUES (?, ?, ?, ?, ?)')
  .run(clientId, name, '', color, '[]');
db.close();

// ── Environment ──

const env = `# BroadcastOKR instance — provisioned ${new Date().toISOString()}
BRIDGE_MODE=${mode}
BRIDGE_HOST=0.0.0.0
BRIDGE_PORT=3001
BRIDGE_BASE_URL=${baseUrl}
BRIDGE_DB_PATH=${dbPath}
BRIDGE_CONFIG_PATH=${join(instanceDir, 'config.json')}
BRIDGE_HISTORY_PATH=${join(instanceDir, 'kpi-history.json')}
BRIDGE_LOG_DIR=${join(instanceDir, 'logs')}
BRIDGE_BACKUP_DIR=${join(instanceDir, 'backups')}
BRIDGE_API_KEY=${crypto.randomBytes(24).toString('hex')}
# Credentials at rest — dedicated, so "who may call the API" and "what unlocks
# stored passwords" rotate independently (docs/operations.md, Credentials).
BRIDGE_ENCRYPTION_KEY=${crypto.randomBytes(32).toString('hex')}
BRIDGE_CORS_ORIGINS=${baseUrl}
${mode === 'client' ? `
# Operator channel — the cockpit registers this instance with this token and
# manages its WHATS'ON connection and connector agents from its Clients page
# (docs/operations.md, Operator channel).
BRIDGE_OPERATOR_TOKEN=${crypto.randomBytes(32).toString('hex')}
` : ''}
# Identity — the instance refuses to start until these are real
BRIDGE_OIDC_ISSUER=${arg('oidc-issuer', 'https://CHANGE-ME.example/oidc')}
BRIDGE_OIDC_CLIENT_ID=${arg('oidc-client-id', 'CHANGE-ME')}
BRIDGE_OIDC_CLIENT_SECRET=${arg('oidc-client-secret', 'CHANGE-ME')}
`;
writeFileSync(join(instanceDir, '.env'), env, { mode: 0o600 });

console.log(`Provisioned ${mode} instance for "${name}"
  dir:        ${instanceDir}
  database:   ${dbPath} (migrated, client '${clientId}' seeded)
  env:        ${join(instanceDir, '.env')} (0600)
  next steps: fill in the OIDC values, build with VITE_EDITION=${mode === 'client' ? 'client' : 'internal'},
              start the bridge with this env — the first SSO sign-in becomes owner.${mode === 'client' ? `
              On the cockpit: Clients → this client → Tenant instance: enter ${baseUrl}
              and the BRIDGE_OPERATOR_TOKEN from the .env, then bind its connection there.` : ''}`);
