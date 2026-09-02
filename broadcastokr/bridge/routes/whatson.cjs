const { createRouter } = require('../utils/router.cjs');
const {
  oracledb, pg, QUERY_TIMEOUT_MS, assertSelectOnly, buildBinds,
  getTablesQuery, getColumnsQuery, wrapPreviewQuery, getTestQuery,
} = require('../whatson/core.cjs');
const { getKpiTemplates } = require('../whatson/templates.cjs');

/**
 * The WHATS'ON-facing route family: connection management, schema browsing,
 * query preview, and KPI/live-KR execution. Mounted at /api. `core` comes
 * from createWhatsonCore, `store` from createConfigStore, and `cipher` from
 * createCredentialCipher — when the cipher reports itself unavailable, routes
 * that would persist a new secret refuse rather than storing it in the clear.
 */
function createWhatsonRouter({ db, mode = 'desktop', core, store, cipher, syncNow }) {
  const { encrypt, decrypt } = cipher;
  const { audit } = require('../audit.cjs');
  const cloud = mode !== 'desktop';
  const auditSql = (req, what) => { if (cloud && db) audit(db, req, what); };
  const router = createRouter();
  const { loadConfig, saveConfig, loadHistory, saveHistory } = store;

  // Get/save config
  router.get('/config', (req, res) => {
    const config = loadConfig();
    const safe = {
      ...config,
      connections: config.connections.map(c => ({ ...c, password: '***' })),
    };
    res.json(safe);
  });

  router.post('/config', (req, res) => {
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

    const ALLOWED_KEYS = ['connections', 'kpiDefinitions', 'pollIntervalMs'];
    const filtered = {};
    for (const key of ALLOWED_KEYS) {
      if (key in incoming) filtered[key] = incoming[key];
    }
    saveConfig({ ...config, ...filtered });
    auditSql(req, 'Updated bridge configuration');
    res.json({ ok: true });
  });

  // Test connection (supports both Oracle and PostgreSQL)
  router.post('/test-connection', async (req, res) => {
    const { type, host, port, service, user, password, clientDir } = req.body;
    const dbType = type || 'oracle';
    // The form sends a plaintext password; a stored connection re-tested from
    // the client sends back what it holds. `decrypt` passes plaintext through
    // and unwraps marked ciphertext, so both callers are handled without the
    // route having to guess which one it is talking to.
    const decryptedPassword = decrypt(password);

    try {
      if (dbType === 'postgres') {
        if (!pg) return res.json({ ok: false, message: 'pg driver not installed. Run: npm install pg' });
        const client = new pg.Client({ host, port, database: service, user, password: decryptedPassword });
        await client.connect();
        try {
          await client.query('SELECT 1 AS test');
        } finally {
          await client.end().catch(() => {});
        }
      } else {
        if (!oracledb) return res.json({ ok: false, message: 'oracledb driver not installed. Run: npm install oracledb' });
        try { oracledb.initOracleClient({ libDir: clientDir || undefined }); } catch {}
        const conn = await oracledb.getConnection({
          user, password: decryptedPassword,
          connectString: `${host}:${port}/${service}`,
        });
        try {
          await conn.execute(getTestQuery({ type: 'oracle' }));
        } finally {
          await conn.close().catch(() => {});
        }
      }
      res.json({ ok: true, message: `${dbType === 'postgres' ? 'PostgreSQL' : 'Oracle'} connection successful` });
    } catch (err) {
      console.error('Connection test failed:', err);
      res.json({ ok: false, message: 'Connection test failed' });
    }
  });

  /** Refuse to persist a secret we cannot protect (D-2). */
  const CREDENTIALS_UNPROTECTED = {
    error: 'Credential encryption is not configured on this instance. '
      + 'Set BRIDGE_ENCRYPTION_KEY before storing database credentials.',
  };

  // Save connection
  router.post('/connections', (req, res) => {
    const conn = req.body;
    // A masked password means "keep the existing one" — no new secret arrives,
    // so renaming or re-tagging a connection stays possible without a key.
    if (cipher.unprotected && conn.password && conn.password !== '***') {
      return res.status(503).json(CREDENTIALS_UNPROTECTED);
    }
    const config = loadConfig();
    if (!conn.id) conn.id = `conn_${Date.now()}`;
    const idx = (config.connections || []).findIndex(c => c.id === conn.id);
    if (idx >= 0) {
      // Preserve password if masked
      conn.password = conn.password === '***' ? config.connections[idx].password : encrypt(conn.password);
      config.connections[idx] = conn;
    } else {
      conn.password = encrypt(conn.password);
      config.connections = [...(config.connections || []), conn];
    }
    saveConfig(config);
    auditSql(req, `Saved database connection '${conn.name || conn.id}'`);
    res.json({ ok: true, connection: { ...conn, password: '***' } });
  });

  // Delete connection
  router.delete('/connections/:id', (req, res) => {
    const config = loadConfig();
    config.connections = (config.connections || []).filter(c => c.id !== req.params.id);
    saveConfig(config);
    auditSql(req, `Deleted database connection '${req.params.id}'`);
    res.json({ ok: true });
  });

  // Get connections (masked)
  router.get('/connections', (req, res) => {
    const config = loadConfig();
    res.json((config.connections || []).map(c => ({ ...c, password: '***' })));
  });

  // Browse schema tables
  router.post('/tables', async (req, res) => {
    const { connectionId } = req.body;
    const config = loadConfig();
    const connConfig = config.connections.find(c => c.id === connectionId);
    if (!connConfig) return res.status(400).json({ error: 'Connection not found' });

    try {
      const q = getTablesQuery(connConfig);
      let rows;
      if (connConfig.type === 'postgres') {
        const pool = core.getPgPool(connConfig);
        const result = await pool.query(q.sql, q.params);
        rows = result.rows;
      } else {
        rows = await core.runOracleQuery(connConfig, q.sql, q.params);
      }
      res.json(rows);
    } catch (err) {
      console.error('Schema tables query failed:', err);
      res.status(500).json({ error: 'Failed to retrieve tables' });
    }
  });

  // Browse table columns
  router.post('/columns', async (req, res) => {
    const { connectionId, tableName } = req.body;
    const config = loadConfig();
    const connConfig = config.connections.find(c => c.id === connectionId);
    if (!connConfig) return res.status(400).json({ error: 'Connection not found' });

    try {
      const q = getColumnsQuery(connConfig, tableName);
      let rows;
      if (connConfig.type === 'postgres') {
        const pool = core.getPgPool(connConfig);
        const result = await pool.query(q.sql, q.params);
        rows = result.rows;
      } else {
        rows = await core.runOracleQuery(connConfig, q.sql, q.params);
      }
      res.json(rows);
    } catch (err) {
      console.error('Schema columns query failed:', err);
      res.status(500).json({ error: 'Failed to retrieve columns' });
    }
  });

  // Fetch channels for a connection (tries PSICHANNEL then PSITRANSMISSION)
  router.post('/channels', async (req, res) => {
    const { connectionId } = req.body;
    if (!connectionId) return res.status(400).json({ error: 'connectionId is required' });

    const config = loadConfig();
    const connConfig = config.connections.find(c => c.id === connectionId);
    if (!connConfig) return res.status(400).json({ error: 'Connection not found' });

    // The schema is per-install (PSI is only the common default), so honour the
    // connection's configured schema rather than hardcoding the owner prefix.
    const isPg = connConfig.type === 'postgres';
    const schema = connConfig.schema || 'PSI';
    // A schema name cannot be bound as a parameter, so it is interpolated —
    // constrain it to a plain identifier even though it comes from owner-only
    // stored config rather than from the request.
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(schema)) {
      return res.status(400).json({ error: 'Connection schema is not a valid identifier' });
    }
    const s = isPg ? schema.toLowerCase() : schema.toUpperCase();

    const channelQueries = isPg
      ? [
          `SELECT DISTINCT ch_id AS id, ch_description AS name, ch_internalvalue AS "internalValue", ch_kind AS "channelKind" FROM ${s}.psichannel ORDER BY ch_description`,
          `SELECT DISTINCT tx_id_channel AS id, tx_id_channel AS name FROM ${s}.psitransmission ORDER BY tx_id_channel`,
        ]
      : [
          `SELECT DISTINCT CH_ID AS id, CH_DESCRIPTION AS name, CH_INTERNALVALUE AS "internalValue", CH_KIND AS "channelKind" FROM ${s}.PSICHANNEL ORDER BY CH_DESCRIPTION`,
          `SELECT DISTINCT TX_ID_CHANNEL AS id, TX_ID_CHANNEL AS name FROM ${s}.PSITRANSMISSION ORDER BY TX_ID_CHANNEL`,
        ];

    for (const sql of channelQueries) {
      try {
        const rows = await core.runQuery(connConfig, sql, {});
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
  router.post('/preview-query', async (req, res) => {
    const { connectionId, sql } = req.body;
    const config = loadConfig();
    const connConfig = config.connections.find(c => c.id === connectionId);
    if (!connConfig) return res.status(400).json({ error: 'Connection not found' });

    auditSql(req, `Previewed SQL on '${connConfig.name || connectionId}'`);
    try {
      assertSelectOnly(sql);
      const safeSql = wrapPreviewQuery(connConfig, sql);
      const rows = await core.runQuery(connConfig, safeSql);
      res.json(rows);
    } catch (err) {
      console.error('Query preview failed:', err);
      res.status(500).json({ error: 'Query preview failed' });
    }
  });

  // KPI definitions CRUD
  router.get('/kpis', (req, res) => {
    const config = loadConfig();
    res.json(config.kpiDefinitions || []);
  });

  router.post('/kpis', (req, res) => {
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

  router.delete('/kpis/:id', (req, res) => {
    const config = loadConfig();
    config.kpiDefinitions = (config.kpiDefinitions || []).filter(k => k.id !== req.params.id);
    saveConfig(config);
    res.json({ ok: true });
  });

  // Execute a single KPI query and return current value
  router.post('/kpi/execute', async (req, res) => {
    const { kpiId } = req.body;
    const config = loadConfig();
    const kpi = (config.kpiDefinitions || []).find(k => k.id === kpiId);
    if (!kpi) return res.status(404).json({ error: 'KPI not found' });

    const connConfig = config.connections.find(c => c.id === kpi.connectionId);
    if (!connConfig) return res.status(400).json({ error: 'Connection not found for KPI' });

    try {
      const rows = await core.runQuery(connConfig, kpi.sql, buildBinds(kpi));
      if (!rows || rows.length === 0) {
        // Match the execute-batch contract: no rows is no_data, never a fabricated 0
        return res.json({ status: 'no_data', error: 'Query returned no rows' });
      }
      const value = Number(Object.values(rows[0])[0]);
      const history = loadHistory();
      if (!history[kpiId]) history[kpiId] = [];
      history[kpiId].push({ timestamp: new Date().toISOString(), value });
      if (history[kpiId].length > 100) history[kpiId] = history[kpiId].slice(-100);
      saveHistory(history);

      res.json({ value, timestamp: new Date().toISOString() });
    } catch (err) {
      console.error('KPI execute failed:', err);
      res.status(500).json({ error: 'KPI query execution failed' });
    }
  });

  // Get all live KPI values (poll all)
  router.get('/kpi/poll', async (req, res) => {
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
        const rows = await core.runQueryWithTimeout(connConfig, kpi.sql, buildBinds(kpi));
        if (!rows || rows.length === 0) {
          results.push({ id: kpi.id, name: kpi.name, error: 'Query returned no rows' });
          continue;
        }
        const value = Number(Object.values(rows[0])[0]);

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

  /**
   * Is this query exactly the one stored on the KR it names? Non-owners may
   * trigger stored live KRs but never supply SQL of their own (review
   * 2026-09-02, F5: gating the route ownerOnly broke every manager sync path
   * in the app, because the app syncs stored SQL through this route).
   */
  const isStoredQuery = (q) => {
    if (!db || !q.krId) return false;
    const row = db.prepare('SELECT live_config FROM key_results WHERE id = ? AND goal_id = ?').get(q.krId, q.goalId);
    if (!row?.live_config) return false;
    let stored;
    try { stored = JSON.parse(row.live_config); } catch { return false; }
    return stored.sql === q.sql && stored.connectionId === q.connectionId
      && (stored.timeframeDays ?? null) === (q.timeframeDays ?? null);
  };

  // Execute batch of KR queries for live goal syncing
  // Body: { queries: [{ goalId, krIndex, krId, connectionId, sql, binds?, timeframeDays? }] }
  router.post('/kpi/execute-batch', async (req, res) => {
    const { queries } = req.body;
    if (!Array.isArray(queries) || queries.length === 0) {
      return res.status(400).json({ error: 'queries array is required' });
    }

    // Desktop is single-user (no req.user); in cloud modes only owners run ad hoc SQL.
    const adHocAllowed = !cloud || req.user?.role === 'owner';
    const refused = adHocAllowed ? 0 : queries.filter((q) => !isStoredQuery(q)).length;
    auditSql(req, `Executed ${queries.length - refused} live-KR quer${queries.length - refused === 1 ? 'y' : 'ies'}`
      + (refused ? ` (refused ${refused} not matching a stored KR)` : ''));

    const config = loadConfig();
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
          if (!adHocAllowed && !isStoredQuery(q)) {
            return { goalId, krIndex, status: 'error', error: 'Not a stored query — only owners may run ad hoc SQL' };
          }

          const connConfig = config.connections.find(c => c.id === connectionId);
          const result = await core.executeScalarQuery(
            { connConfig, sql, binds: buildBinds(q) },
            { messages: { failed: (err) => {
              console.error(`Batch query failed for goal ${goalId}, KR ${krIndex}:`, err);
              return 'Query execution failed';
            } } },
          );
          return { goalId, krIndex, ...result };
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

  // Manual trigger for the bridge-side sync loop (the app's "Sync now")
  router.post('/kpi/sync-now', async (req, res) => {
    if (!syncNow) return res.status(501).json({ error: 'Sync loop not configured' });
    try {
      const result = await syncNow();
      auditSql(req, `Triggered a live-KR sync pass (${result.synced}/${result.total})`);
      res.json({ ok: true, ...result });
    } catch (err) {
      console.error('Manual KR sync failed:', err);
      res.status(500).json({ error: 'Sync failed' });
    }
  });

  // Get KPI history
  router.get('/kpi/history/:id', (req, res) => {
    const history = loadHistory();
    res.json(history[req.params.id] || []);
  });

  // Preset KPI templates (both dialects, filtered by configured connections)
  router.get('/kpi/templates', (req, res) => {
    res.json(getKpiTemplates(loadConfig()));
  });

  return router;
}

module.exports = { createWhatsonRouter };
