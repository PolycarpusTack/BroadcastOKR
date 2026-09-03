const fs = require('fs');
const { atomicWriteJSON } = require('../utils/atomicWrite.cjs');

/**
 * Connection + KPI-definition store, backed by the tenant database (D-3),
 * plus the file-backed KPI history.
 *
 * The connections used to live in config.json — outside migrations, versioning,
 * tenancy and the backup snapshot. They are rows now (migration 007), behind the
 * same loadConfig/saveConfig interface the router and the credential cipher
 * always used, so `routes/whatson.cjs` and `utils/credentials.cjs` kept their
 * shape. ADR: docs/gpm/state/ADR-2026-09-03-connection-store.md
 *
 * The password column holds whatever the caller hands in — the cipher decides
 * what that is (enc:v1: ciphertext with a key, cleartext on a keyless desktop).
 */

const DEFAULT_POLL_INTERVAL_MS = 900000;
const IMPORT_MARKER = 'legacy_config_imported';

const connectionFromRow = (r) => ({
  id: r.id, name: r.name, type: r.type, host: r.host, port: r.port ?? undefined, service: r.service,
  schema: r.schema_name, user: r.user_name, password: r.password,
  clientDir: r.client_dir ?? undefined,
});

const kpiFromRow = (r) => ({
  id: r.id, name: r.name, connectionId: r.connection_id, sql: r.sql, unit: r.unit,
  direction: r.direction, target: r.target,
  timeframeDays: r.timeframe_days ?? undefined,
  binds: r.binds ? JSON.parse(r.binds) : undefined,
});

const num = (v) => (v === undefined || v === null || v === '' ? null : Number(v));

function createConfigStore({ db, historyPath }) {
  const q = {
    connections: db.prepare('SELECT * FROM connections ORDER BY created_at, id'),
    kpis: db.prepare('SELECT * FROM kpi_definitions ORDER BY created_at, id'),
    setting: db.prepare('SELECT value FROM bridge_settings WHERE key = ?'),
    putSetting: db.prepare(`INSERT INTO bridge_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`),
    upsertConnection: db.prepare(`INSERT INTO connections (id, name, type, host, port, service, schema_name, user_name, password, client_dir)
      VALUES (@id, @name, @type, @host, @port, @service, @schema, @user, @password, @clientDir)
      ON CONFLICT(id) DO UPDATE SET name = excluded.name, type = excluded.type, host = excluded.host, port = excluded.port,
        service = excluded.service, schema_name = excluded.schema_name, user_name = excluded.user_name,
        password = excluded.password, client_dir = excluded.client_dir, updated_at = datetime('now')`),
    insertConnectionIfAbsent: db.prepare(`INSERT OR IGNORE INTO connections (id, name, type, host, port, service, schema_name, user_name, password, client_dir)
      VALUES (@id, @name, @type, @host, @port, @service, @schema, @user, @password, @clientDir)`),
    deleteConnectionsNotIn: (ids) => db.prepare(`DELETE FROM connections WHERE id NOT IN (${ids.map(() => '?').join(',') || "''"})`).run(...ids),
    upsertKpi: db.prepare(`INSERT INTO kpi_definitions (id, name, connection_id, sql, unit, direction, target, timeframe_days, binds)
      VALUES (@id, @name, @connectionId, @sql, @unit, @direction, @target, @timeframeDays, @binds)
      ON CONFLICT(id) DO UPDATE SET name = excluded.name, connection_id = excluded.connection_id, sql = excluded.sql,
        unit = excluded.unit, direction = excluded.direction, target = excluded.target,
        timeframe_days = excluded.timeframe_days, binds = excluded.binds, updated_at = datetime('now')`),
    insertKpiIfAbsent: db.prepare(`INSERT OR IGNORE INTO kpi_definitions (id, name, connection_id, sql, unit, direction, target, timeframe_days, binds)
      VALUES (@id, @name, @connectionId, @sql, @unit, @direction, @target, @timeframeDays, @binds)`),
    deleteKpisNotIn: (ids) => db.prepare(`DELETE FROM kpi_definitions WHERE id NOT IN (${ids.map(() => '?').join(',') || "''"})`).run(...ids),
    clientsUsing: db.prepare('SELECT id, name FROM clients WHERE connection_id = ? ORDER BY name, id'),
    krsUsing: db.prepare(`SELECT kr.id, kr.title, g.id AS goal_id, g.title AS goal_title
      FROM key_results kr JOIN goals g ON g.id = kr.goal_id
      WHERE kr.live_config IS NOT NULL AND json_extract(kr.live_config, '$.connectionId') = ?
      ORDER BY g.title, kr.sort_order, kr.id`),
    kpisUsing: db.prepare('SELECT id, name FROM kpi_definitions WHERE connection_id = ? ORDER BY name, id'),
  };

  const connectionParams = (c) => ({
    id: String(c.id), name: c.name ?? '', type: c.type ?? 'oracle', host: c.host ?? '', port: num(c.port),
    service: c.service ?? '', schema: c.schema ?? '', user: c.user ?? '', password: c.password ?? '',
    clientDir: c.clientDir ?? null,
  });
  const kpiParams = (k) => ({
    id: String(k.id), name: k.name ?? '', connectionId: k.connectionId ?? '', sql: k.sql ?? '', unit: k.unit ?? '',
    direction: k.direction ?? 'hi', target: Number(k.target) || 0, timeframeDays: num(k.timeframeDays),
    binds: k.binds === undefined || k.binds === null ? null : JSON.stringify(k.binds),
  });

  function loadConfig() {
    const setting = q.setting.get('poll_interval_ms');
    return {
      connections: q.connections.all().map(connectionFromRow),
      kpiDefinitions: q.kpis.all().map(kpiFromRow),
      pollIntervalMs: setting ? Number(setting.value) : DEFAULT_POLL_INTERVAL_MS,
    };
  }

  /**
   * Full replace of whichever sections are present: connections and KPI
   * definitions are upserted by id and anything missing from the list is
   * deleted — the semantics the JSON file always had. A section left out
   * (e.g. a save with only `connections`) is left alone.
   */
  const saveConfig = db.transaction((config) => {
    if (Array.isArray(config.connections)) {
      const rows = config.connections.map(connectionParams);
      for (const row of rows) q.upsertConnection.run(row);
      q.deleteConnectionsNotIn(rows.map((r) => r.id));
    }
    if (Array.isArray(config.kpiDefinitions)) {
      const rows = config.kpiDefinitions.map(kpiParams);
      for (const row of rows) q.upsertKpi.run(row);
      q.deleteKpisNotIn(rows.map((r) => r.id));
    }
    if (config.pollIntervalMs !== undefined && Number.isFinite(Number(config.pollIntervalMs))) {
      q.putSetting.run('poll_interval_ms', String(Number(config.pollIntervalMs)));
    }
  });

  /** Everything that still names this connection — the delete refusal names them back. */
  function referencesTo(connectionId) {
    return {
      clients: q.clientsUsing.all(connectionId).map((r) => ({ id: r.id, name: r.name })),
      keyResults: q.krsUsing.all(connectionId).map((r) => ({ id: r.id, title: r.title, goalId: r.goal_id, goalTitle: r.goal_title })),
      kpiDefinitions: q.kpisUsing.all(connectionId).map((r) => ({ id: r.id, name: r.name })),
    };
  }

  /**
   * One-shot import of the pre-D-3 config.json. Runs on the first start that
   * finds no import marker: rows already in the database win (INSERT OR
   * IGNORE), the outcome is recorded, and the file is renamed `.migrated` —
   * left in place as the operator's backup for one release. A file that
   * appears later is not touched: the marker says the import has happened.
   * `dryRun` reports what would be imported and writes nothing, marker included.
   */
  function importLegacyConfig(configPath, { dryRun = false } = {}) {
    if (q.setting.get(IMPORT_MARKER)) return { status: 'already-imported' };
    if (!configPath || !fs.existsSync(configPath)) {
      if (!dryRun) q.putSetting.run(IMPORT_MARKER, 'nothing-to-import');
      return { status: 'nothing-to-import' };
    }

    let legacy;
    try { legacy = JSON.parse(fs.readFileSync(configPath, 'utf8')); }
    catch (err) { return { status: 'unreadable', error: err.message }; }
    const connections = Array.isArray(legacy.connections) ? legacy.connections.filter((c) => c && c.id) : [];
    const kpiDefinitions = Array.isArray(legacy.kpiDefinitions) ? legacy.kpiDefinitions.filter((k) => k && k.id) : [];

    if (dryRun) return { status: 'dry-run', connections: connections.length, kpiDefinitions: kpiDefinitions.length, renamedTo: null };

    db.transaction(() => {
      for (const c of connections) q.insertConnectionIfAbsent.run(connectionParams(c));
      for (const k of kpiDefinitions) q.insertKpiIfAbsent.run(kpiParams(k));
      if (Number.isFinite(Number(legacy.pollIntervalMs)) && !q.setting.get('poll_interval_ms')) {
        q.putSetting.run('poll_interval_ms', String(Number(legacy.pollIntervalMs)));
      }
      q.putSetting.run(IMPORT_MARKER, JSON.stringify({ at: new Date().toISOString(), from: configPath, connections: connections.length, kpiDefinitions: kpiDefinitions.length }));
    })();

    let renamedTo = `${configPath}.migrated`;
    try { fs.renameSync(configPath, renamedTo); }
    catch (err) {
      // The rows are in and the marker is set, so the file can never import
      // twice; say why it is still there rather than fail the start.
      console.warn(`  WARNING: imported ${configPath} but could not rename it to .migrated (${err.message}).`);
      renamedTo = null;
    }
    return { status: 'imported', connections: connections.length, kpiDefinitions: kpiDefinitions.length, renamedTo };
  }

  function loadHistory() {
    try { return JSON.parse(fs.readFileSync(historyPath, 'utf8')); }
    catch { return {}; }
  }

  function saveHistory(history) {
    atomicWriteJSON(historyPath, history);
  }

  return { loadConfig, saveConfig, referencesTo, importLegacyConfig, loadHistory, saveHistory };
}

module.exports = { createConfigStore };
