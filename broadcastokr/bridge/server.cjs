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
const CORS_ORIGINS = (process.env.BRIDGE_CORS_ORIGINS || 'http://localhost:5173,http://localhost:3000')
  .split(',')
  .map(s => s.trim());
app.use(cors({ origin: CORS_ORIGINS }));
app.use(express.json());

// Rate limiting, auth, and request logging must run BEFORE any routes so they
// actually guard and capture every endpoint. (/api/health is exempt from each.)
const { createRateLimitMiddleware } = require('./middleware/rateLimit.cjs');
const { createAuthMiddleware } = require('./middleware/auth.cjs');
const { createLoggingMiddleware } = require('./middleware/logging.cjs');

const BRIDGE_API_KEY = process.env.BRIDGE_API_KEY;
if (!BRIDGE_API_KEY) {
  console.warn('  WARNING: BRIDGE_API_KEY not set — auth disabled. Set it in .env for production.');
}
const { createProtocolMiddleware } = require('./middleware/protocol.cjs');
app.use(createRateLimitMiddleware());
app.use(createProtocolMiddleware());
app.use(createAuthMiddleware(BRIDGE_API_KEY));
app.use(createLoggingMiddleware());

const { MODE } = require('./editions.cjs');
const { PROTOCOL_VERSION, MIN_SUPPORTED } = require('./protocol.cjs');
const { encrypt, decrypt } = require('./utils/crypto.cjs');

// ── Tenant data plane (SQLite) ──

const { createDB } = require('./db/connection.cjs');
const { runMigrations } = require('./db/migrate.cjs');

const DB_PATH = process.env.BRIDGE_DB_PATH || path.join(__dirname, 'broadcastokr.db');
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');
const db = createDB(DB_PATH);
runMigrations(db, MIGRATIONS_DIR);

const { startBackupScheduler } = require('./utils/backup.cjs');
const BACKUP_DIR = process.env.BRIDGE_BACKUP_DIR
  || (DB_PATH !== ':memory:' ? path.join(path.dirname(DB_PATH), 'backups') : null);
if (DB_PATH !== ':memory:' && BACKUP_DIR) {
  startBackupScheduler(db, BACKUP_DIR);
}

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

// ── WHATS'ON access (the agent core) ──

const { createWhatsonCore, oracledb, pg } = require('./whatson/core.cjs');
const { createConfigStore } = require('./whatson/store.cjs');
const { createWhatsonRouter } = require('./routes/whatson.cjs');

const CONFIG_PATH = process.env.BRIDGE_CONFIG_PATH || path.join(__dirname, 'config.json');
const HISTORY_PATH = process.env.BRIDGE_HISTORY_PATH || path.join(__dirname, 'kpi-history.json');

const store = createConfigStore({ configPath: CONFIG_PATH, historyPath: HISTORY_PATH });
const core = createWhatsonCore({
  decryptPassword: (password) => (BRIDGE_API_KEY ? decrypt(password, BRIDGE_API_KEY) : password),
});

app.use('/api', createWhatsonRouter({
  core,
  store,
  encrypt: (password) => (BRIDGE_API_KEY ? encrypt(password, BRIDGE_API_KEY) : password),
  decrypt: (password) => (BRIDGE_API_KEY ? decrypt(password, BRIDGE_API_KEY) : password),
}));

// ── Bridge-side live-KR sync loop ──

const { buildBinds } = require('./whatson/core.cjs');
const { runKRSyncOnce, startKRSyncLoop } = require('./liveSync.cjs');

/** Same value-extraction contract as /api/kpi/execute-batch. */
async function executeKrQuery(q) {
  const config = store.loadConfig();
  const connConfig = config.connections.find(c => c.id === q.connectionId);
  if (!connConfig) return { status: 'error', error: 'Connection not found' };
  try {
    const rows = await core.runQueryWithTimeout(connConfig, q.sql, buildBinds(q));
    if (!rows || rows.length === 0) return { status: 'no_data', error: 'Query returned no rows' };
    const value = Number(Object.values(rows[0])[0]);
    if (isNaN(value)) return { status: 'error', error: 'Query did not return a numeric value' };
    return { status: 'ok', current: value };
  } catch (err) {
    const status = err.message === 'Query timed out' ? 'timeout' : 'error';
    return { status, error: status === 'timeout' ? 'Query timed out' : 'Query execution failed' };
  }
}

const KR_SYNC_INTERVAL_MS = Number(process.env.BRIDGE_KR_SYNC_INTERVAL_MS) || 15 * 60 * 1000;
startKRSyncLoop(db, { executeQuery: executeKrQuery, intervalMs: KR_SYNC_INTERVAL_MS });

// Manual trigger for the loop (the app's "Sync now" affordances)
app.post('/api/kpi/sync-now', async (req, res) => {
  try {
    const result = await runKRSyncOnce(db, { executeQuery: executeKrQuery });
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('Manual KR sync failed:', err);
    res.status(500).json({ error: 'Sync failed' });
  }
});

// ── Health ──

app.get('/api/health', (req, res) => {
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
    protocolVersion: PROTOCOL_VERSION,
    minSupported: MIN_SUPPORTED,
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    drivers: {
      oracle: !!oracledb,
      postgres: !!pg,
    },
    database: dbStats,
  });
});

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
  console.log(`  Config: ${CONFIG_PATH}`);
  console.log(`  History: ${HISTORY_PATH}\n`);
});
