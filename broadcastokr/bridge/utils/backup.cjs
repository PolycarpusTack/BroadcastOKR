const fs = require('fs');
const path = require('path');

const PREFIX = 'broadcastokr-';

/** Snapshot files for one run, keyed by timestamp so they prune together. */
function snapshotNames(stamp) {
  return { db: `${PREFIX}${stamp}.db`, config: `${PREFIX}${stamp}.config.json` };
}

/**
 * Take one online snapshot (better-sqlite3 db.backup — safe while writes are
 * happening, unlike copying the WAL-hot file) and prune to the newest `keep`.
 *
 * The connection store (config.json) is copied alongside it. It lives outside
 * SQLite, so a database-only snapshot restored cleanly and then had no database
 * connections — the OKRs came back and the thing that feeds them did not. The
 * two are captured under the same timestamp and pruned together, so a restore
 * is always a matched pair.
 *
 * Note for operators: the copy carries stored credentials, encrypted exactly as
 * config.json holds them. The backup directory therefore needs the same
 * protection as the bridge's own data directory.
 *
 * Returns the snapshot paths.
 */
async function runBackupOnce(db, dir, { keep = 14, configPath } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const names = snapshotNames(stamp);
  const dest = path.join(dir, names.db);
  await db.backup(dest);

  let configDest = null;
  if (configPath && fs.existsSync(configPath)) {
    configDest = path.join(dir, names.config);
    fs.copyFileSync(configPath, configDest);
  }

  // Prune by snapshot, not by file: a .db and its .config.json are one unit.
  const stamps = fs.readdirSync(dir)
    .filter((f) => f.startsWith(PREFIX) && f.endsWith('.db'))
    .map((f) => f.slice(PREFIX.length, -'.db'.length))
    .sort();
  for (const old of stamps.slice(0, Math.max(0, stamps.length - keep))) {
    const victim = snapshotNames(old);
    for (const name of [victim.db, victim.config]) {
      const full = path.join(dir, name);
      if (fs.existsSync(full)) fs.unlinkSync(full);
    }
  }
  return { dbPath: dest, configPath: configDest };
}

/** Snapshot at startup, then on an interval (daily by default). */
function startBackupScheduler(db, dir, { intervalMs = 24 * 60 * 60 * 1000, keep = 14, configPath } = {}) {
  const run = () => runBackupOnce(db, dir, { keep, configPath })
    .catch((err) => console.error(`[backup] failed: ${err.message}`));
  run();
  const timer = setInterval(run, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}

module.exports = { runBackupOnce, startBackupScheduler };
