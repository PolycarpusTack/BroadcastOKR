const fs = require('fs');
const path = require('path');

const PREFIX = 'broadcastokr-';

/**
 * Take one online snapshot (better-sqlite3 db.backup — safe while writes are
 * happening, unlike copying the WAL-hot file) and prune to the newest `keep`.
 *
 * Since D-3 the connections are rows in the database, so the snapshot alone is
 * the whole tenant. Before that the store was config.json and every snapshot
 * was a pair (`.db` + `.config.json`, same stamp); those pairs still exist in
 * older backup directories and are still pruned as a unit, so a surviving old
 * snapshot never loses its config half.
 *
 * Note for operators: the snapshot carries stored credentials, encrypted
 * exactly as the database holds them. The backup directory therefore needs
 * the same protection as the bridge's own data directory.
 *
 * Returns the snapshot path.
 */
async function runBackupOnce(db, dir, { keep = 14 } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = path.join(dir, `${PREFIX}${stamp}.db`);
  await db.backup(dest);

  const stamps = fs.readdirSync(dir)
    .filter((f) => f.startsWith(PREFIX) && f.endsWith('.db'))
    .map((f) => f.slice(PREFIX.length, -'.db'.length))
    .sort();
  for (const old of stamps.slice(0, Math.max(0, stamps.length - keep))) {
    for (const name of [`${PREFIX}${old}.db`, `${PREFIX}${old}.config.json`]) {
      const full = path.join(dir, name);
      if (fs.existsSync(full)) fs.unlinkSync(full);
    }
  }
  return { dbPath: dest };
}

/** Snapshot at startup, then on an interval (daily by default). */
function startBackupScheduler(db, dir, { intervalMs = 24 * 60 * 60 * 1000, keep = 14 } = {}) {
  const run = () => runBackupOnce(db, dir, { keep })
    .catch((err) => console.error(`[backup] failed: ${err.message}`));
  run();
  const timer = setInterval(run, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}

module.exports = { runBackupOnce, startBackupScheduler };
