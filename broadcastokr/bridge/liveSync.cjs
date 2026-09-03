/**
 * Bridge-side live-KR sync: runs the live queries on a schedule regardless of
 * whether any browser is open, so live Key Results never go stale and N open
 * clients no longer fire N duplicate query timers. The bridge writes raw
 * facts only (current value, sync status, history); progress semantics stay
 * client-owned — _mergeChanges recomputes via krProgress on merge.
 */

const HISTORY_CAP = 100;
const HISTORY_PRUNE_TO = 75;

function isMonitorActive(until) {
  return !!until && new Date(until) > new Date();
}

/** True when the goal itself or any of its clients is under monitoring. */
function isMonitored(db, goalRow) {
  if (isMonitorActive(goalRow.monitor_until)) return true;
  const clientIds = goalRow.client_ids ? JSON.parse(goalRow.client_ids) : [];
  for (const clientId of clientIds) {
    const client = db.prepare('SELECT monitor_until FROM clients WHERE id = ?').get(clientId);
    if (client && isMonitorActive(client.monitor_until)) return true;
  }
  return false;
}

/**
 * The single write path for an externally-produced KR value (bridge loop or
 * agent ingest): raw facts + monitored history; progress stays client-owned.
 * `kr` needs id, monitor_until, client_ids (the goal join columns).
 */
function applySyncedValue(db, kr, value, timestamp = new Date().toISOString()) {
  db.prepare('UPDATE key_results SET current_val=?, sync_status=?, sync_error=NULL, last_sync_at=? WHERE id=?')
    .run(value, 'ok', timestamp, kr.id);

  if (isMonitored(db, kr)) {
    db.prepare('INSERT INTO kr_history (kr_id, timestamp, value, actor, source) VALUES (?, ?, ?, ?, ?)')
      .run(kr.id, timestamp, value, 'system', 'sync');
    const count = db.prepare('SELECT COUNT(*) AS c FROM kr_history WHERE kr_id = ?').get(kr.id).c;
    if (count > HISTORY_CAP) {
      db.prepare(`DELETE FROM kr_history WHERE id IN (
        SELECT id FROM kr_history WHERE kr_id = ? ORDER BY timestamp ASC LIMIT ?
      )`).run(kr.id, count - HISTORY_PRUNE_TO);
    }
  }
}

/**
 * One sync pass over every live KR. `executeQuery({connectionId, sql,
 * timeframeDays, binds})` resolves to `{status, current?, error?}` — injected
 * so the loop is testable and reusable by the future connector agent.
 */
async function runKRSyncOnce(db, { executeQuery }) {
  const liveKRs = db.prepare(`
    SELECT kr.id, kr.goal_id, kr.current_val, kr.live_config,
           g.monitor_until, g.client_ids
    FROM key_results kr JOIN goals g ON kr.goal_id = g.id
    WHERE kr.live_config IS NOT NULL AND g.archived = 0
  `).all();

  let synced = 0;
  const touchedGoals = new Set();

  for (const kr of liveKRs) {
    let config;
    try {
      config = JSON.parse(kr.live_config);
    } catch {
      continue;
    }

    const result = await executeQuery({
      connectionId: config.connectionId,
      sql: config.sql,
      timeframeDays: config.timeframeDays,
      binds: config.binds,
    });

    const now = new Date().toISOString();
    if (result.status === 'ok' && typeof result.current === 'number') {
      applySyncedValue(db, kr, result.current, now);
      synced++;
    } else {
      db.prepare('UPDATE key_results SET sync_status=?, sync_error=? WHERE id=?')
        .run(result.status || 'error', result.error || 'Sync failed', kr.id);
    }
    touchedGoals.add(kr.goal_id);
  }

  // Bump touched goals so /api/sync/changes propagates the new values
  for (const goalId of touchedGoals) {
    db.prepare("UPDATE goals SET updated_at=datetime('now') WHERE id=?").run(goalId);
  }

  return { synced, total: liveKRs.length };
}

/** Pass at startup, then on the interval. Returns a stop function. */
function startKRSyncLoop(db, { executeQuery, intervalMs = 15 * 60 * 1000 }) {
  const run = () => runKRSyncOnce(db, { executeQuery })
    .catch((err) => console.error(`[kr-sync] pass failed: ${err.message}`));
  run();
  const timer = setInterval(run, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}

module.exports = { runKRSyncOnce, startKRSyncLoop, applySyncedValue };
