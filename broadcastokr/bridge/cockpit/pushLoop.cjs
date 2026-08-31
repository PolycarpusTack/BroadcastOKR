const { buildSharePayload } = require('./sharePayload.cjs');

/**
 * Client-instance side of the channel: pushes the allowlist payload to the
 * cockpit on an interval. Push-only by design — the cockpit holds no
 * credentials against this instance. Nothing is sent when nothing is shared.
 */
function startSharePushLoop(db, { cockpitUrl, shareToken, intervalMs = 5 * 60 * 1000 }) {
  const run = async () => {
    try {
      const payload = buildSharePayload(db);
      if (payload.metrics.length === 0) return;
      const res = await fetch(`${cockpitUrl}/api/cockpit/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Share-Token': shareToken },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        console.error(`[share-push] cockpit refused payload: HTTP ${res.status}`);
      }
    } catch (err) {
      console.error(`[share-push] failed: ${err.message}`);
    }
  };
  run();
  const timer = setInterval(run, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}

module.exports = { startSharePushLoop };
