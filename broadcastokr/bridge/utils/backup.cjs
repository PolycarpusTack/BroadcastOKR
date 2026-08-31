const fs = require('fs');
const path = require('path');

const PREFIX = 'broadcastokr-';

/**
 * Take one online snapshot (better-sqlite3 db.backup — safe while writes are
 * happening, unlike copying the WAL-hot file) and prune to the newest `keep`.
 * Returns the snapshot path.
 */
async function runBackupOnce(db, dir, { keep = 14 } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = path.join(dir, `${PREFIX}${stamp}.db`);
  await db.backup(dest);

  const files = fs.readdirSync(dir)
    .filter((f) => f.startsWith(PREFIX) && f.endsWith('.db'))
    .sort(); // timestamp names sort chronologically
  for (const f of files.slice(0, Math.max(0, files.length - keep))) {
    fs.unlinkSync(path.join(dir, f));
  }
  return dest;
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
