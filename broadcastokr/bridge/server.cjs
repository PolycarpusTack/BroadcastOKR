/**
 * BroadcastOKR Bridge Service
 * Connects to WHATS'ON Oracle and/or PostgreSQL databases (read-only)
 * and serves KPI data to the Electron app.
 */
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

// Optional drivers — load what's available
let oracledb;
try { oracledb = require('oracledb'); } catch { oracledb = null; }

let pg;
try { pg = require('pg'); } catch { pg = null; }

const app = express();
app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:3000', 'null'] }));
app.use(express.json());

// ── Config ──

const CONFIG_PATH = path.join(__dirname, 'config.json');
const HISTORY_PATH = path.join(__dirname, 'kpi-history.json');

function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); }
  catch { return { connections: [], kpiDefinitions: [], pollIntervalMs: 900000 }; }
}

function saveConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

function loadHistory() {
  try { return JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8')); }
  catch { return {}; }
}

function saveHistory(history) {
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));
}

// ── Connection Pools ──

const oraclePools = new Map();
const pgPools = new Map();

async function getOraclePool(connConfig) {
  if (!oracledb) throw new Error('oracledb driver not installed. Run: npm install oracledb');
  const key = `oracle:${connConfig.host}:${connConfig.port}/${connConfig.service}`;
  if (oraclePools.has(key)) return oraclePools.get(key);

  try {
    oracledb.initOracleClient({ libDir: connConfig.clientDir || undefined });
  } catch { /* already initialized */ }

  const pool = await oracledb.createPool({
    user: connConfig.user,
    password: connConfig.password,
    connectString: `${connConfig.host}:${connConfig.port}/${connConfig.service}`,
    poolMin: 1,
    poolMax: 4,
    poolIncrement: 1,
  });
  oraclePools.set(key, pool);
  return pool;
}

function getPgPool(connConfig) {
  if (!pg) throw new Error('pg driver not installed. Run: npm install pg');
  const key = `pg:${connConfig.host}:${connConfig.port}/${connConfig.service}`;
  if (pgPools.has(key)) return pgPools.get(key);

  const pool = new pg.Pool({
    host: connConfig.host,
    port: connConfig.port,
    database: connConfig.service,
    user: connConfig.user,
    password: connConfig.password,
    max: 4,
    idleTimeoutMillis: 30000,
  });
  pgPools.set(key, pool);
  return pool;
}

// ── SQL Safety ──

function assertSelectOnly(sql) {
  // Strip block comments /* ... */ and line comments -- ...
  const stripped = sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--[^\n]*/g, '');
  if (!stripped.trim().toUpperCase().startsWith('SELECT')) {
    throw new Error('Only SELECT queries are allowed');
  }
}

// ── Unified Query Runner ──

async function runQuery(connConfig, sql, binds = {}) {
  assertSelectOnly(sql);
  if (connConfig.type === 'postgres') {
    return runPgQuery(connConfig, sql, binds);
  }
  return runOracleQuery(connConfig, sql, binds);
}

async function runOracleQuery(connConfig, sql, binds = {}) {
  const pool = await getOraclePool(connConfig);
  const conn = await pool.getConnection();
  try {
    const result = await conn.execute(sql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
    return result.rows;
  } finally {
    await conn.close();
  }
}

async function runPgQuery(connConfig, sql, binds = {}) {
  const pool = getPgPool(connConfig);
  // Convert Oracle-style :bind_name to PostgreSQL $1, $2, ... placeholders
  const { text, values } = convertBinds(sql, binds);
  const result = await pool.query(text, values);
  // Normalize column names to UPPER_CASE for consistency with Oracle output
  return result.rows.map(row => {
    const normalized = {};
    for (const [key, val] of Object.entries(row)) {
      normalized[key.toUpperCase()] = val;
    }
    return normalized;
  });
}

/**
 * Converts Oracle-style named binds (:name) to PostgreSQL positional ($1, $2, ...)
 * Returns { text, values } for pg.query()
 */
function convertBinds(sql, binds) {
  const values = [];
  let idx = 0;
  const text = sql.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, name) => {
    if (Object.hasOwn(binds, name)) {
      values.push(binds[name]);
      idx++;
      return `$${idx}`;
    }
    return `:${name}`;
  });
  return { text, values };
}

// ── Schema Queries by DB type ──

function getTablesQuery(connConfig) {
  if (connConfig.type === 'postgres') {
    const schema = connConfig.schema || 'public';
    return {
      sql: `SELECT table_name AS "TABLE_NAME",
            (SELECT reltuples::bigint FROM pg_class WHERE relname = t.table_name) AS "NUM_ROWS"
            FROM information_schema.tables t
            WHERE t.table_schema = $1 AND t.table_type = 'BASE TABLE'
            ORDER BY table_name`,
      params: [schema],
    };
  }
  return {
    sql: `SELECT table_name, num_rows FROM all_tables WHERE owner = :owner ORDER BY table_name`,
    params: { owner: connConfig.schema || connConfig.user.toUpperCase() },
  };
}

function getColumnsQuery(connConfig, tableName) {
  if (connConfig.type === 'postgres') {
    const schema = connConfig.schema || 'public';
    return {
      sql: `SELECT column_name AS "COLUMN_NAME",
            data_type AS "DATA_TYPE",
            COALESCE(character_maximum_length, numeric_precision, 0) AS "DATA_LENGTH"
            FROM information_schema.columns
            WHERE table_schema = $1 AND table_name = $2
            ORDER BY ordinal_position`,
      params: [schema, tableName],
    };
  }
  return {
    sql: `SELECT column_name, data_type, data_length FROM all_tab_columns WHERE owner = :owner AND table_name = :tbl ORDER BY column_id`,
    params: { owner: connConfig.schema || connConfig.user.toUpperCase(), tbl: tableName },
  };
}

function wrapPreviewQuery(connConfig, sql) {
  if (connConfig.type === 'postgres') {
    return `SELECT * FROM (${sql}) AS _preview LIMIT 20`;
  }
  return `SELECT * FROM (${sql}) WHERE ROWNUM <= 20`;
}

function getTestQuery(connConfig) {
  if (connConfig.type === 'postgres') return 'SELECT 1 AS test';
  return 'SELECT 1 AS test FROM DUAL';
}

// ── API Routes ──

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    drivers: {
      oracle: !!oracledb,
      postgres: !!pg,
    },
  });
});

// Get/save config
app.get('/api/config', (req, res) => {
  const config = loadConfig();
  const safe = {
    ...config,
    connections: config.connections.map(c => ({ ...c, password: '***' })),
  };
  res.json(safe);
});

app.post('/api/config', (req, res) => {
  const config = loadConfig();
  const incoming = req.body;

  if (incoming.connections) {
    incoming.connections = incoming.connections.map((c) => ({
      ...c,
      password: c.password === '***'
        ? (config.connections.find(x => x.id === c.id)?.password || '')
        : c.password,
    }));
  }

  saveConfig({ ...config, ...incoming });
  res.json({ ok: true });
});

// Test connection (supports both Oracle and PostgreSQL)
app.post('/api/test-connection', async (req, res) => {
  const { type, host, port, service, user, password, clientDir } = req.body;
  const dbType = type || 'oracle';

  try {
    if (dbType === 'postgres') {
      if (!pg) return res.json({ ok: false, message: 'pg driver not installed. Run: npm install pg' });
      const client = new pg.Client({ host, port, database: service, user, password });
      await client.connect();
      await client.query('SELECT 1 AS test');
      await client.end();
    } else {
      if (!oracledb) return res.json({ ok: false, message: 'oracledb driver not installed. Run: npm install oracledb' });
      try { oracledb.initOracleClient({ libDir: clientDir || undefined }); } catch {}
      const conn = await oracledb.getConnection({
        user, password,
        connectString: `${host}:${port}/${service}`,
      });
      await conn.execute(getTestQuery({ type: 'oracle' }));
      await conn.close();
    }
    res.json({ ok: true, message: `${dbType === 'postgres' ? 'PostgreSQL' : 'Oracle'} connection successful` });
  } catch (err) {
    console.error('Connection test failed:', err);
    res.json({ ok: false, message: 'Connection test failed' });
  }
});

// Save connection
app.post('/api/connections', (req, res) => {
  const config = loadConfig();
  const conn = req.body;
  if (!conn.id) conn.id = `conn_${Date.now()}`;
  const idx = (config.connections || []).findIndex(c => c.id === conn.id);
  if (idx >= 0) {
    // Preserve password if masked
    if (conn.password === '***') conn.password = config.connections[idx].password;
    config.connections[idx] = conn;
  } else {
    config.connections = [...(config.connections || []), conn];
  }
  saveConfig(config);
  res.json({ ok: true, connection: { ...conn, password: '***' } });
});

// Delete connection
app.delete('/api/connections/:id', (req, res) => {
  const config = loadConfig();
  config.connections = (config.connections || []).filter(c => c.id !== req.params.id);
  saveConfig(config);
  res.json({ ok: true });
});

// Get connections (masked)
app.get('/api/connections', (req, res) => {
  const config = loadConfig();
  res.json((config.connections || []).map(c => ({ ...c, password: '***' })));
});

// Browse schema tables
app.post('/api/tables', async (req, res) => {
  const { connectionId } = req.body;
  const config = loadConfig();
  const connConfig = config.connections.find(c => c.id === connectionId);
  if (!connConfig) return res.status(400).json({ error: 'Connection not found' });

  try {
    const q = getTablesQuery(connConfig);
    let rows;
    if (connConfig.type === 'postgres') {
      const pool = getPgPool(connConfig);
      const result = await pool.query(q.sql, q.params);
      rows = result.rows;
    } else {
      rows = await runOracleQuery(connConfig, q.sql, q.params);
    }
    res.json(rows);
  } catch (err) {
    console.error('Schema tables query failed:', err);
    res.status(500).json({ error: 'Failed to retrieve tables' });
  }
});

// Browse table columns
app.post('/api/columns', async (req, res) => {
  const { connectionId, tableName } = req.body;
  const config = loadConfig();
  const connConfig = config.connections.find(c => c.id === connectionId);
  if (!connConfig) return res.status(400).json({ error: 'Connection not found' });

  try {
    const q = getColumnsQuery(connConfig, tableName);
    let rows;
    if (connConfig.type === 'postgres') {
      const pool = getPgPool(connConfig);
      const result = await pool.query(q.sql, q.params);
      rows = result.rows;
    } else {
      rows = await runOracleQuery(connConfig, q.sql, q.params);
    }
    res.json(rows);
  } catch (err) {
    console.error('Schema columns query failed:', err);
    res.status(500).json({ error: 'Failed to retrieve columns' });
  }
});

// Fetch channels for a connection (tries PSICHANNEL then PSITRANSMISSION)
app.post('/api/channels', async (req, res) => {
  const { connectionId } = req.body;
  if (!connectionId) return res.status(400).json({ error: 'connectionId is required' });

  const config = loadConfig();
  const connConfig = config.connections.find(c => c.id === connectionId);
  if (!connConfig) return res.status(400).json({ error: 'Connection not found' });

  const channelQueries = connConfig.type === 'postgres'
    ? [
        'SELECT DISTINCT ch_id AS id, ch_description AS name, ch_internalvalue AS "internalValue", ch_kind AS "channelKind" FROM psi.psichannel ORDER BY ch_description',
        'SELECT DISTINCT tx_id_channel AS id, tx_id_channel AS name FROM psi.psitransmission ORDER BY tx_id_channel',
      ]
    : [
        'SELECT DISTINCT CH_ID AS id, CH_DESCRIPTION AS name, CH_INTERNALVALUE AS "internalValue", CH_KIND AS "channelKind" FROM PSI.PSICHANNEL ORDER BY CH_DESCRIPTION',
        'SELECT DISTINCT TX_ID_CHANNEL AS id, TX_ID_CHANNEL AS name FROM PSI.PSITRANSMISSION ORDER BY TX_ID_CHANNEL',
      ];

  for (const sql of channelQueries) {
    try {
      const rows = await runQuery(connConfig, sql, {});
      if (rows && rows.length > 0) {
        return res.json(rows.map(r => ({
          id: String(r.id || r.ID || ''),
          name: String(r.name || r.NAME || ''),
          internalValue: r.internalValue || r.INTERNALVALUE || undefined,
          channelKind: r.channelKind || r.CHANNELKIND || undefined,
        })));
      }
    } catch {
      // Try next query
    }
  }

  res.json([]);
});

// Preview query (limit 20 rows)
app.post('/api/preview-query', async (req, res) => {
  const { connectionId, sql } = req.body;
  const config = loadConfig();
  const connConfig = config.connections.find(c => c.id === connectionId);
  if (!connConfig) return res.status(400).json({ error: 'Connection not found' });

  try {
    const safeSql = wrapPreviewQuery(connConfig, sql);
    const rows = await runQuery(connConfig, safeSql);
    res.json(rows);
  } catch (err) {
    console.error('Query preview failed:', err);
    res.status(500).json({ error: 'Query preview failed' });
  }
});

// Get all KPI definitions
app.get('/api/kpis', (req, res) => {
  const config = loadConfig();
  res.json(config.kpiDefinitions || []);
});

// Save KPI definition
app.post('/api/kpis', (req, res) => {
  const config = loadConfig();
  const kpi = req.body;
  if (!kpi.id) kpi.id = `kpi_${Date.now()}`;
  const idx = (config.kpiDefinitions || []).findIndex(k => k.id === kpi.id);
  if (idx >= 0) {
    config.kpiDefinitions[idx] = kpi;
  } else {
    config.kpiDefinitions = [...(config.kpiDefinitions || []), kpi];
  }
  saveConfig(config);
  res.json({ ok: true, kpi });
});

// Delete KPI definition
app.delete('/api/kpis/:id', (req, res) => {
  const config = loadConfig();
  config.kpiDefinitions = (config.kpiDefinitions || []).filter(k => k.id !== req.params.id);
  saveConfig(config);
  res.json({ ok: true });
});

// Execute a single KPI query and return current value
app.post('/api/kpi/execute', async (req, res) => {
  const { kpiId } = req.body;
  const config = loadConfig();
  const kpi = (config.kpiDefinitions || []).find(k => k.id === kpiId);
  if (!kpi) return res.status(404).json({ error: 'KPI not found' });

  const connConfig = config.connections.find(c => c.id === kpi.connectionId);
  if (!connConfig) return res.status(400).json({ error: 'Connection not found for KPI' });

  try {
    const rows = await runQuery(connConfig, kpi.sql, buildBinds(kpi));
    const value = rows[0] ? Object.values(rows[0])[0] : 0;
    const history = loadHistory();
    if (!history[kpiId]) history[kpiId] = [];
    history[kpiId].push({ timestamp: new Date().toISOString(), value: Number(value) });
    if (history[kpiId].length > 100) history[kpiId] = history[kpiId].slice(-100);
    saveHistory(history);

    res.json({ value: Number(value), timestamp: new Date().toISOString() });
  } catch (err) {
    console.error('KPI execute failed:', err);
    res.status(500).json({ error: 'KPI query execution failed' });
  }
});

// Get all live KPI values (poll all)
app.get('/api/kpi/poll', async (req, res) => {
  const config = loadConfig();
  const history = loadHistory();
  const results = [];

  for (const kpi of (config.kpiDefinitions || [])) {
    const connConfig = config.connections.find(c => c.id === kpi.connectionId);
    if (!connConfig) {
      results.push({ id: kpi.id, name: kpi.name, error: 'No connection' });
      continue;
    }
    try {
      const rows = await runQuery(connConfig, kpi.sql, buildBinds(kpi));
      const value = rows[0] ? Number(Object.values(rows[0])[0]) : 0;

      if (!history[kpi.id]) history[kpi.id] = [];
      history[kpi.id].push({ timestamp: new Date().toISOString(), value });
      if (history[kpi.id].length > 100) history[kpi.id] = history[kpi.id].slice(-100);

      results.push({
        id: kpi.id,
        name: kpi.name,
        unit: kpi.unit,
        direction: kpi.direction,
        target: kpi.target,
        current: value,
        trend: (history[kpi.id] || []).slice(-10).map(h => h.value),
        lastUpdated: new Date().toISOString(),
      });
    } catch (err) {
      console.error(`KPI poll failed for ${kpi.id}:`, err);
      results.push({ id: kpi.id, name: kpi.name, error: 'KPI query failed' });
    }
  }

  saveHistory(history);
  res.json(results);
});

// Execute batch of KR queries for live goal syncing
// Body: { queries: [{ goalId, krIndex, connectionId, sql, binds?, timeframeDays? }] }
app.post('/api/kpi/execute-batch', async (req, res) => {
  const { queries } = req.body;
  if (!Array.isArray(queries) || queries.length === 0) {
    return res.status(400).json({ error: 'queries array is required' });
  }

  const config = loadConfig();
  const TIMEOUT_MS = 15000;
  const CONCURRENCY = 10;
  const results = [];

  // Process in batches of CONCURRENCY
  for (let i = 0; i < queries.length; i += CONCURRENCY) {
    const batch = queries.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.allSettled(
      batch.map(async (q) => {
        const { goalId, krIndex, connectionId, sql } = q;
        if (!connectionId || !sql) {
          return { goalId, krIndex, status: 'error', error: 'Missing connectionId or sql' };
        }

        const connConfig = config.connections.find(c => c.id === connectionId);
        if (!connConfig) {
          return { goalId, krIndex, status: 'error', error: 'Connection not found' };
        }

        try {
          const binds = {};
          if (q.timeframeDays) {
            const now = new Date();
            const start = new Date(now);
            start.setDate(start.getDate() - q.timeframeDays);
            binds.start_date = start;
            binds.end_date = now;
          }
          if (q.binds) Object.assign(binds, q.binds);

          const queryPromise = runQuery(connConfig, sql, binds);
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Query timed out')), TIMEOUT_MS)
          );

          const rows = await Promise.race([queryPromise, timeoutPromise]);
          if (!rows || rows.length === 0) {
            return { goalId, krIndex, status: 'no_data', error: 'Query returned no rows' };
          }

          const value = Number(Object.values(rows[0])[0]);
          if (isNaN(value)) {
            return { goalId, krIndex, status: 'error', error: 'Query did not return a numeric value' };
          }

          return { goalId, krIndex, status: 'ok', current: value };
        } catch (err) {
          console.error(`Batch query failed for goal ${goalId}, KR ${krIndex}:`, err);
          const status = err.message === 'Query timed out' ? 'timeout' : 'error';
          return { goalId, krIndex, status, error: status === 'timeout' ? 'Query timed out' : 'Query execution failed' };
        }
      })
    );

    batchResults.forEach((result, idx) => {
      results.push(result.status === 'fulfilled' ? result.value : {
        goalId: batch[idx]?.goalId,
        krIndex: batch[idx]?.krIndex,
        status: 'error',
        error: 'Unexpected execution error',
      });
    });
  }

  res.json({ results });
});

// Get KPI history
app.get('/api/kpi/history/:id', (req, res) => {
  const history = loadHistory();
  res.json(history[req.params.id] || []);
});

// ── Helpers ──

function buildBinds(kpi) {
  const binds = {};
  const now = new Date();

  if (kpi.timeframeDays) {
    const start = new Date(now);
    start.setDate(start.getDate() - kpi.timeframeDays);
    binds.start_date = start;
    binds.end_date = now;
  }

  if (kpi.binds) {
    Object.assign(binds, kpi.binds);
  }

  return binds;
}

// ── Preset KPI templates ──
// Templates include both Oracle and PostgreSQL variants

app.get('/api/kpi/templates', (req, res) => {
  const config = loadConfig();
  // Detect which connection types are configured
  const hasOracle = config.connections.some(c => c.type === 'oracle');
  const hasPostgres = config.connections.some(c => c.type === 'postgres');

  const oracleTemplates = [
    {
      name: 'Transmissions This Month',
      description: 'Count of transmissions scheduled in the current month',
      sql: `SELECT COUNT(*) AS value FROM PSI.PSITRANSMISSION WHERE TX_TXDATE >= TRUNC(SYSDATE, 'MM') AND TX_TXDATE < ADD_MONTHS(TRUNC(SYSDATE, 'MM'), 1)`,
      unit: 'tx', direction: 'hi', target: 100, dbType: 'oracle',
    },
    {
      name: 'Transmissions with Live Subtitling',
      description: 'Count of transmissions with live subtitling enabled',
      sql: `SELECT COUNT(*) AS value FROM PSI.PSITRANSMISSION WHERE TX_LIVESUBTITLING = 1 AND TX_TXDATE >= :start_date AND TX_TXDATE <= :end_date`,
      unit: 'tx', direction: 'hi', target: 50, timeframeDays: 30, dbType: 'oracle',
    },
    {
      name: 'Materials Ready for Playout',
      description: 'Count of materials marked ready for replication',
      sql: `SELECT COUNT(*) AS value FROM PSI.PSIMATERIALPART WHERE MAT_READYFORREP = 1`,
      unit: 'items', direction: 'hi', target: 100, dbType: 'oracle',
    },
    {
      name: 'Schedule Fill Rate',
      description: 'Percentage of active schedules vs total',
      sql: `SELECT ROUND(SUM(CASE WHEN SCH_ISACTIVE = 1 THEN 1 ELSE 0 END) / COUNT(*) * 100, 1) AS value FROM PSI.PSISCHEDULE`,
      unit: '%', direction: 'hi', target: 95, dbType: 'oracle',
    },
    {
      name: 'Transmissions per Channel',
      description: 'Count of transmissions for a specific channel',
      sql: `SELECT COUNT(*) AS value FROM PSI.PSITRANSMISSION WHERE TX_ID_CHANNEL = :channel_id AND TX_TXDATE >= :start_date AND TX_TXDATE <= :end_date`,
      unit: 'tx', direction: 'hi', target: 30, timeframeDays: 30, dbType: 'oracle',
    },
    {
      name: 'Average Transmission Duration',
      description: 'Average duration of transmissions in seconds',
      sql: `SELECT ROUND(AVG(TX_ICDURATION), 0) AS value FROM PSI.PSITRANSMISSION WHERE TX_ICDURATION > 0 AND TX_TXDATE >= :start_date AND TX_TXDATE <= :end_date`,
      unit: 's', direction: 'hi', target: 1800, timeframeDays: 30, dbType: 'oracle',
    },
  ];

  const postgresTemplates = [
    {
      name: 'Transmissions This Month',
      description: 'Count of transmissions scheduled in the current month',
      sql: `SELECT COUNT(*) AS value FROM psi.psitransmission WHERE tx_txdate >= date_trunc('month', CURRENT_DATE) AND tx_txdate < date_trunc('month', CURRENT_DATE) + interval '1 month'`,
      unit: 'tx', direction: 'hi', target: 100, dbType: 'postgres',
    },
    {
      name: 'Transmissions with Live Subtitling',
      description: 'Count of transmissions with live subtitling enabled',
      sql: `SELECT COUNT(*) AS value FROM psi.psitransmission WHERE tx_livesubtitling = 1 AND tx_txdate >= :start_date AND tx_txdate <= :end_date`,
      unit: 'tx', direction: 'hi', target: 50, timeframeDays: 30, dbType: 'postgres',
    },
    {
      name: 'Materials Ready for Playout',
      description: 'Count of materials marked ready for replication',
      sql: `SELECT COUNT(*) AS value FROM psi.psimaterialpart WHERE mat_readyforrep = 1`,
      unit: 'items', direction: 'hi', target: 100, dbType: 'postgres',
    },
    {
      name: 'Schedule Fill Rate',
      description: 'Percentage of active schedules vs total',
      sql: `SELECT ROUND(SUM(CASE WHEN sch_isactive = 1 THEN 1 ELSE 0 END)::numeric / COUNT(*) * 100, 1) AS value FROM psi.psischedule`,
      unit: '%', direction: 'hi', target: 95, dbType: 'postgres',
    },
    {
      name: 'Transmissions per Channel',
      description: 'Count of transmissions for a specific channel',
      sql: `SELECT COUNT(*) AS value FROM psi.psitransmission WHERE tx_id_channel = :channel_id AND tx_txdate >= :start_date AND tx_txdate <= :end_date`,
      unit: 'tx', direction: 'hi', target: 30, timeframeDays: 30, dbType: 'postgres',
    },
    {
      name: 'Average Transmission Duration',
      description: 'Average duration of transmissions in seconds',
      sql: `SELECT ROUND(AVG(tx_icduration), 0) AS value FROM psi.psitransmission WHERE tx_icduration > 0 AND tx_txdate >= :start_date AND tx_txdate <= :end_date`,
      unit: 's', direction: 'hi', target: 1800, timeframeDays: 30, dbType: 'postgres',
    },
  ];

  const templates = [];
  if (hasOracle || (!hasOracle && !hasPostgres)) templates.push(...oracleTemplates);
  if (hasPostgres) templates.push(...postgresTemplates);

  res.json(templates);
});

// ── Start Server ──

const PORT = process.env.BRIDGE_PORT || 3001;

app.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  BroadcastOKR Bridge Service`);
  console.log(`  ──────────────────────────`);
  console.log(`  Running on http://localhost:${PORT}`);
  console.log(`  Drivers: Oracle=${oracledb ? 'yes' : 'no'}, PostgreSQL=${pg ? 'yes' : 'no'}`);
  console.log(`  Config: ${CONFIG_PATH}`);
  console.log(`  History: ${HISTORY_PATH}\n`);
});
