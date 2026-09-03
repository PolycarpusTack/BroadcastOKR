require('dotenv').config({ path: require('path').join(__dirname, '.env') });

/**
 * BroadcastOKR Bridge Service — composition root.
 * WHATS'ON access lives in whatson/ (the future connector-agent core);
 * tenant data (SQLite CRUD + sync) lives in routes/; this file wires them.
 */
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
// Exact paths only. The sub-routers are strict and case-sensitive too
// (utils/router.cjs); these two settings cover the mounts and /api/health.
app.set('case sensitive routing', true);
app.set('strict routing', true);
const { MODE } = require('./editions.cjs');
const { version: APP_VERSION } = require('./package.json');
const { PROTOCOL_VERSION, MIN_SUPPORTED } = require('./protocol.cjs');
const { createCredentialCipher } = require('./utils/credentials.cjs');

const CORS_ORIGINS = (process.env.BRIDGE_CORS_ORIGINS || 'http://localhost:5173,http://localhost:3000')
  .split(',')
  .map(s => s.trim());
// Cloud modes use cookie sessions — CORS must allow credentials
app.use(cors({ origin: CORS_ORIGINS, credentials: MODE !== 'desktop' }));
app.use(express.json());

// ── Identity configuration (validated before anything mounts) ──

const BRIDGE_API_KEY = process.env.BRIDGE_API_KEY;
const OIDC_ENV = {
  issuer: process.env.BRIDGE_OIDC_ISSUER,
  clientId: process.env.BRIDGE_OIDC_CLIENT_ID,
  clientSecret: process.env.BRIDGE_OIDC_CLIENT_SECRET,
  baseUrl: process.env.BRIDGE_BASE_URL,
  // http:// issuers are only for tests/local mocks
  allowInsecure: (process.env.BRIDGE_OIDC_ISSUER || '').startsWith('http://'),
};
const OIDC_CONFIGURED = !!(OIDC_ENV.issuer && OIDC_ENV.clientId && OIDC_ENV.clientSecret && OIDC_ENV.baseUrl);
const INSECURE_NO_AUTH = process.env.BRIDGE_INSECURE_NO_AUTH === '1';

if (MODE === 'desktop') {
  if (!BRIDGE_API_KEY) {
    console.warn('  WARNING: BRIDGE_API_KEY not set — auth disabled. Set it in .env for production.');
  }
} else if (!OIDC_CONFIGURED) {
  // Cloud modes fail closed: no identity, no server. The explicit escape is
  // for tests and local development only, and it screams.
  if (!INSECURE_NO_AUTH) {
    console.error(`  FATAL: cloud mode '${MODE}' requires OIDC configuration `
      + '(BRIDGE_OIDC_ISSUER, BRIDGE_OIDC_CLIENT_ID, BRIDGE_OIDC_CLIENT_SECRET, BRIDGE_BASE_URL).');
    process.exit(1);
  }
  console.warn('  WARNING: BRIDGE_INSECURE_NO_AUTH=1 — cloud mode WITHOUT authentication. Tests/dev only.');
}

// ── Tenant data plane (SQLite) ──

const { createDB } = require('./db/connection.cjs');
const { runMigrations } = require('./db/migrate.cjs');

const DB_PATH = process.env.BRIDGE_DB_PATH || path.join(__dirname, 'broadcastokr.db');
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');
const db = createDB(DB_PATH);
runMigrations(db, MIGRATIONS_DIR);

// Rate limiting, protocol floor, auth, and request logging must run BEFORE any
// routes so they actually guard and capture every endpoint.
const { createRateLimitMiddleware } = require('./middleware/rateLimit.cjs');
const { createAuthMiddleware } = require('./middleware/auth.cjs');
const { createLoggingMiddleware } = require('./middleware/logging.cjs');
const { createProtocolMiddleware } = require('./middleware/protocol.cjs');

const { createRbacMiddleware } = require('./middleware/rbac.cjs');
if (MODE !== 'desktop') app.set('trust proxy', 1);
app.use(createRateLimitMiddleware({ sessionKeyed: MODE !== 'desktop' }));
app.use(createProtocolMiddleware());
app.use(createAuthMiddleware({ mode: MODE, apiKey: BRIDGE_API_KEY, db, insecureNoAuth: INSECURE_NO_AUTH }));
app.use(createRbacMiddleware({ mode: MODE, insecureNoAuth: INSECURE_NO_AUTH, db }));
app.use(createLoggingMiddleware());

// Mounted in every mode: /me and /logout are OIDC-independent, and a desktop
// /login correctly reports the identity provider as unavailable.
const { createAuthRouter } = require('./routes/auth.cjs');
const { SESSION_COOKIE: SESSION_COOKIE_NAME } = require('./sessions.cjs');
app.use('/api/auth', createAuthRouter(db, OIDC_ENV));

const { createGoalsRouter } = require('./routes/goals.cjs');
const { createTasksRouter } = require('./routes/tasks.cjs');
const { createClientsRouter } = require('./routes/clients.cjs');
const { createTemplatesRouter } = require('./routes/templates.cjs');
const { createUsersRouter } = require('./routes/users.cjs');
const { createTeamsRouter } = require('./routes/teams.cjs');
const { createSyncRouter } = require('./routes/sync.cjs');
const { createActivityRouter } = require('./routes/activity.cjs');

app.use('/api/goals', createGoalsRouter(db));
app.use('/api/tasks', createTasksRouter(db));
app.use('/api/clients', createClientsRouter(db));
app.use('/api/goal-templates', createTemplatesRouter(db));
app.use('/api/users', createUsersRouter(db));
app.use('/api/teams', createTeamsRouter(db));
app.use('/api/sync', createSyncRouter(db, DB_PATH));
app.use('/api/activity', createActivityRouter(db));

const { createCockpitRouter } = require('./routes/cockpit.cjs');
app.use('/api/cockpit', createCockpitRouter(db));

const { createAgentRouters } = require('./routes/agent.cjs');
const agentRouters = createAgentRouters(db);
app.use('/api/agents', agentRouters.ops);
app.use('/api/agent', agentRouters.machine);

// Client instances push their opted-in metrics to the cockpit (T2-3)
if (MODE === 'client' && process.env.BRIDGE_COCKPIT_URL && process.env.BRIDGE_SHARE_TOKEN) {
  const { startSharePushLoop } = require('./cockpit/pushLoop.cjs');
  const shareIntervalMs = Number(process.env.BRIDGE_SHARE_INTERVAL_MS) || 5 * 60 * 1000;
  startSharePushLoop(db, {
    cockpitUrl: process.env.BRIDGE_COCKPIT_URL,
    shareToken: process.env.BRIDGE_SHARE_TOKEN,
    intervalMs: shareIntervalMs,
  });
  // An operator reads the startup lines once; a silent channel looks like no channel (R1 rig, finding 23).
  console.log(`  Sharing opted-in KRs to ${process.env.BRIDGE_COCKPIT_URL} every ${Math.round(shareIntervalMs / 60000)} min.`);
}

// ── WHATS'ON access (the agent core) ──

const { createWhatsonCore, oracledb, pg } = require('./whatson/core.cjs');
const { createConfigStore } = require('./whatson/store.cjs');
const { createWhatsonRouter } = require('./routes/whatson.cjs');

// Connections and KPI definitions are rows in the tenant database (D-3);
// BRIDGE_CONFIG_PATH only says where an upgraded install's config.json is
// imported from, once. ADR: docs/gpm/state/ADR-2026-09-03-connection-store.md
const CONFIG_PATH = process.env.BRIDGE_CONFIG_PATH || path.join(__dirname, 'config.json');
const HISTORY_PATH = process.env.BRIDGE_HISTORY_PATH || path.join(__dirname, 'kpi-history.json');

const store = createConfigStore({ db, historyPath: HISTORY_PATH });

const importReport = store.importLegacyConfig(CONFIG_PATH, { dryRun: process.env.BRIDGE_CONFIG_IMPORT === 'dry-run' });
if (importReport.status === 'imported') {
  console.log(`  Imported ${importReport.connections} connection(s) and ${importReport.kpiDefinitions} KPI definition(s) from ${CONFIG_PATH}`
    + (importReport.renamedTo ? ` (file renamed to ${path.basename(importReport.renamedTo)}).` : '.'));
} else if (importReport.status === 'dry-run') {
  console.log(`  DRY RUN: would import ${importReport.connections} connection(s) and ${importReport.kpiDefinitions} KPI definition(s) from ${CONFIG_PATH}; nothing written.`);
} else if (importReport.status === 'unreadable') {
  console.warn(`  WARNING: ${CONFIG_PATH} exists but could not be read (${importReport.error}); it was not imported. Fix or remove it, then restart.`);
}

// Credentials-at-rest. A dedicated key is preferred — it decouples "who may
// call the API" from "what unlocks stored credentials" — with BRIDGE_API_KEY
// kept as the fallback so existing desktop installs keep working.
const CREDENTIAL_KEY = process.env.BRIDGE_ENCRYPTION_KEY || BRIDGE_API_KEY;
const cipher = createCredentialCipher({ key: CREDENTIAL_KEY, mode: MODE, legacyKey: BRIDGE_API_KEY });

// Upgrade anything written before credentials were marked, then say plainly
// what is unprotected or unreadable. Startup is the only moment an operator
// reliably reads; the unreadable count is also on /api/health so the app can
// show it — a restored backup or a rotated key otherwise presents as every
// live KR failing with a generic query error.
const credentialReport = cipher.rewrapStoredConnections(store);
if (credentialReport.rewrapped > 0) {
  console.log(`  Encrypted ${credentialReport.rewrapped} stored connection password(s) at rest.`);
}
if (credentialReport.unprotected > 0) {
  const consequence = cipher.enforced
    ? 'New credentials will be REFUSED until BRIDGE_ENCRYPTION_KEY is set.'
    : 'They stay in cleartext until BRIDGE_ENCRYPTION_KEY is set, then are encrypted on the next start.';
  console.warn(`  WARNING: ${credentialReport.unprotected} connection password(s) are not encrypted. ${consequence}`);
}
if (credentialReport.unreadable > 0) {
  console.warn(`  WARNING: ${credentialReport.unreadable} stored connection password(s) cannot be read with the `
    + 'configured key — restored from another machine, or the key was rotated? '
    + 'Re-enter those passwords on the Clients page; nothing has been changed on disk.');
}
// Warnings go to stderr; the banner to stdout. Someone capturing only stdout
// (the R1 rig did at first — finding 26) must at least learn there is something
// to read on the other stream.
const startupWarnings = (credentialReport.unprotected > 0 ? 1 : 0) + (credentialReport.unreadable > 0 ? 1 : 0)
  + (importReport.status === 'unreadable' ? 1 : 0);
if (startupWarnings > 0) {
  console.log(`  ${startupWarnings} startup warning(s) — see stderr.`);
}

const core = createWhatsonCore({ decryptPassword: cipher.decrypt });

const { startBackupScheduler } = require('./utils/backup.cjs');
const BACKUP_DIR = process.env.BRIDGE_BACKUP_DIR
  || (DB_PATH !== ':memory:' ? path.join(path.dirname(DB_PATH), 'backups') : null);
if (DB_PATH !== ':memory:' && BACKUP_DIR) {
  // After the legacy import and the credential rewrap, so the startup snapshot
  // already holds the connections in the shape they will be read back in.
  startBackupScheduler(db, BACKUP_DIR);
}


// ── Bridge-side live-KR sync loop ──

const { buildBinds } = require('./whatson/core.cjs');
const { runKRSyncOnce, startKRSyncLoop } = require('./liveSync.cjs');

/** Same value-extraction contract as /api/kpi/execute-batch — one seam. */
function executeKrQuery(q) {
  const connConfig = store.loadConfig().connections.find(c => c.id === q.connectionId);
  return core.executeScalarQuery({ connConfig, sql: q.sql, binds: buildBinds(q) });
}

// The manual trigger lives on the WHATS'ON router, not on `app` directly, so
// FF-9's policy-coverage scan sees it like every other data-plane route.
app.use('/api', createWhatsonRouter({
  db, mode: MODE, core, store, cipher,
  syncNow: () => runKRSyncOnce(db, { executeQuery: executeKrQuery }),
}));

const KR_SYNC_INTERVAL_MS = Number(process.env.BRIDGE_KR_SYNC_INTERVAL_MS) || 15 * 60 * 1000;
startKRSyncLoop(db, { executeQuery: executeKrQuery, intervalMs: KR_SYNC_INTERVAL_MS });

// ── Health ──

const { parseCookies } = require('./utils/cookies.cjs');
const { getSession } = require('./sessions.cjs');

app.get('/api/health', (req, res) => {
  // Cloud instances reveal operational stats only to signed-in callers
  if (MODE !== 'desktop' && !INSECURE_NO_AUTH && !getSession(db, parseCookies(req)[SESSION_COOKIE_NAME])) {
    return res.json({ status: 'ok', mode: MODE, version: APP_VERSION, protocolVersion: PROTOCOL_VERSION, minSupported: MIN_SUPPORTED });
  }
  let dbStats = null;
  try {
    const tableCount = db.prepare("SELECT COUNT(*) as c FROM sqlite_master WHERE type='table' AND name NOT LIKE '_%'").get().c;
    const pageCount = db.pragma('page_count', { simple: true });
    const pageSize = db.pragma('page_size', { simple: true });
    const dbSizeBytes = pageCount * pageSize;
    const dbSizeMB = (dbSizeBytes / 1024 / 1024).toFixed(2);
    dbStats = { size: `${dbSizeMB} MB`, tables: tableCount };
  } catch { /* db might not be initialized */ }

  res.json({
    status: 'ok',
    mode: MODE,
    version: APP_VERSION,
    protocolVersion: PROTOCOL_VERSION,
    minSupported: MIN_SUPPORTED,
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    drivers: {
      oracle: !!oracledb,
      postgres: !!pg,
    },
    database: dbStats,
    credentials: { unreadable: credentialReport.unreadable },
  });
});

// ── Static app serving (cloud modes: one container = bridge + app) ──

if (MODE !== 'desktop') {
  const APP_DIR = process.env.BRIDGE_APP_DIR || path.join(__dirname, '..', 'dist');
  app.use(express.static(APP_DIR));
  // SPA fallback for everything that isn't the API
  // Case-insensitive on purpose: `/API/…` must 404 as an unknown API path,
  // not come back as index.html with a 200 (which read as "reachable").
  app.get(/^\/(?!api(\/|$)).*/i, (req, res) => {
    res.sendFile(path.join(APP_DIR, 'index.html'));
  });
}

const { globalErrorHandler } = require('./middleware/errorHandler.cjs');
app.use(globalErrorHandler);

// ── Start Server ──

const PORT = process.env.BRIDGE_PORT || 3001;
// Local-only by default; deployments that need LAN/container exposure opt in
// explicitly via BRIDGE_HOST=0.0.0.0 (docker-compose does).
const HOST = process.env.BRIDGE_HOST || '127.0.0.1';
app.listen(PORT, HOST, () => {
  console.log(`\n  BroadcastOKR Bridge Service`);
  console.log(`  ──────────────────────────`);
  console.log(`  Running on http://${HOST}:${PORT}`);
  console.log(`  Mode: ${MODE}`);
  console.log(`  Drivers: Oracle=${oracledb ? 'yes' : 'no'}, PostgreSQL=${pg ? 'yes' : 'no'}`);
  console.log(`  Database: ${DB_PATH} (connections included)`);
  console.log(`  History: ${HISTORY_PATH}\n`);
});
