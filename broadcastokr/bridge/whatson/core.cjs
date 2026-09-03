/**
 * WHATS'ON access core — the future connector-agent heart (Tier 2).
 * Read-only Oracle/PostgreSQL access: drivers, pools, SQL safety, the unified
 * query runner, dialect helpers, and bind building. No Express, no SQLite.
 */

// Optional drivers — load what's available
let oracledb;
try { oracledb = require('oracledb'); } catch { oracledb = null; }

let pg;
try { pg = require('pg'); } catch { pg = null; }

// One ceiling for a KR/KPI query, enforced DB-side (callTimeout /
// statement_timeout) so the database cancels runaway queries instead of the
// bridge merely abandoning the promise.
const QUERY_TIMEOUT_MS = 15000;

// ── SQL Safety ──

function assertSelectOnly(sql) {
  // Strip block comments /* ... */ and line comments -- ...
  const stripped = sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--[^\n]*/g, '');
  if (!stripped.trim().toUpperCase().startsWith('SELECT')) {
    throw new Error('Only SELECT queries are allowed');
  }
  // Block stacked statements (semicolons outside of string literals)
  const noStrings = stripped.replace(/'[^']*'/g, '');
  if (/;/.test(noStrings)) {
    throw new Error('Multiple statements are not allowed');
  }
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

/** Standard timeframe/custom binds for a KPI or KR definition. */
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

// ── Schema Queries by DB type ──

function getTablesQuery(connConfig) {
  if (connConfig.type === 'postgres') {
    const schema = (connConfig.schema || 'public').toLowerCase();
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
    params: { owner: (connConfig.schema || connConfig.user).toUpperCase() },
  };
}

function getColumnsQuery(connConfig, tableName) {
  if (connConfig.type === 'postgres') {
    const schema = (connConfig.schema || 'public').toLowerCase();
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
    params: { owner: (connConfig.schema || connConfig.user).toUpperCase(), tbl: tableName },
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

/**
 * Pools + query runner. `decryptPassword` maps a stored (possibly encrypted)
 * password to plaintext — injected so the core stays free of key handling.
 */
function createWhatsonCore({ decryptPassword }) {
  const oraclePools = new Map();
  const pgPools = new Map();

  async function getOraclePool(connConfig) {
    if (!oracledb) throw new Error('oracledb driver not installed. Run: npm install oracledb');
    // Key includes the user: same host/service under different credentials must not share a pool
    const key = `oracle:${connConfig.user}@${connConfig.host}:${connConfig.port}/${connConfig.service}`;
    if (oraclePools.has(key)) return oraclePools.get(key);

    try {
      const clientDir = process.env.ORACLE_CLIENT_DIR || connConfig.clientDir || undefined;
      oracledb.initOracleClient({ libDir: clientDir });
    } catch { /* already initialized */ }

    const pool = await oracledb.createPool({
      user: connConfig.user,
      password: decryptPassword(connConfig.password),
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
    const key = `pg:${connConfig.user}@${connConfig.host}:${connConfig.port}/${connConfig.service}`;
    if (pgPools.has(key)) return pgPools.get(key);

    const pool = new pg.Pool({
      host: connConfig.host,
      port: connConfig.port,
      database: connConfig.service,
      user: connConfig.user,
      password: decryptPassword(connConfig.password),
      max: 4,
      idleTimeoutMillis: 30000,
      statement_timeout: QUERY_TIMEOUT_MS,
    });
    pgPools.set(key, pool);
    return pool;
  }

  async function runOracleQuery(connConfig, sql, binds = {}) {
    const pool = await getOraclePool(connConfig);
    const conn = await pool.getConnection();
    conn.callTimeout = QUERY_TIMEOUT_MS;
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

  async function runQuery(connConfig, sql, binds = {}) {
    assertSelectOnly(sql);
    if (connConfig.type === 'postgres') {
      return runPgQuery(connConfig, sql, binds);
    }
    return runOracleQuery(connConfig, sql, binds);
  }

  /** runQuery under the standard ceiling; the losing query is also cancelled DB-side. */
  function runQueryWithTimeout(connConfig, sql, binds = {}) {
    return Promise.race([
      runQuery(connConfig, sql, binds),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Query timed out')), QUERY_TIMEOUT_MS)),
    ]);
  }

  /**
   * The one way a KR/KPI definition becomes a number.
   *
   * This contract was copied at three call sites (the bridge sync loop, the
   * execute-batch route, and the connector agent) where the empty-rows, NaN and
   * timeout semantics could drift apart independently. They matter: an empty
   * result must read as `no_data`, never as a fabricated 0, or a KR silently
   * reports "we hit zero" when it means "we measured nothing".
   *
   * `messages` exists because the agent words its failures for a local operator
   * log while the bridge words them for an API response; the structure is the
   * part that must not diverge.
   */
  async function executeScalarQuery({ connConfig, sql, binds }, { messages = {} } = {}) {
    const m = { ...SCALAR_MESSAGES, ...messages };
    if (!connConfig) return { status: 'error', error: m.noConnection };

    try {
      const rows = await runQueryWithTimeout(connConfig, sql, binds);
      if (!rows || rows.length === 0) return { status: 'no_data', error: m.noRows };

      const value = Number(Object.values(rows[0])[0]);
      if (Number.isNaN(value)) return { status: 'error', error: m.notNumeric };

      return { status: 'ok', current: value };
    } catch (err) {
      if (err.message === 'Query timed out') return { status: 'timeout', error: m.timeout };
      return { status: 'error', error: m.failed(err) };
    }
  }

  return {
    getOraclePool, getPgPool, runOracleQuery, runPgQuery,
    runQuery, runQueryWithTimeout, executeScalarQuery,
  };
}

/** Bridge-facing wording; failures stay generic (operators read bridge logs). */
const SCALAR_MESSAGES = {
  noConnection: 'Connection not found',
  noRows: 'Query returned no rows',
  notNumeric: 'Query did not return a numeric value',
  timeout: 'Query timed out',
  failed: () => 'Query execution failed',
};

module.exports = {
  oracledb,
  pg,
  QUERY_TIMEOUT_MS,
  assertSelectOnly,
  convertBinds,
  buildBinds,
  getTablesQuery,
  getColumnsQuery,
  wrapPreviewQuery,
  getTestQuery,
  createWhatsonCore,
};
