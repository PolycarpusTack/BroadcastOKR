/**
 * The ONLY builder of data that leaves a client instance for the cockpit.
 * Allowlist construction — each field is placed explicitly, never spread or
 * filtered from a fuller row — so a new column fails CLOSED (it simply never
 * ships) instead of open. FF-4 (sharePayload.test.cjs) sentinel-proves it.
 *
 * v1 deliberately excludes titles, notes, confidence, history, and SQL.
 * R6-2 added `krTemplateId` — an id, so the cockpit can line up the same
 * template KR across tenants and label the column on its own side; the
 * title still never leaves the instance.
 */
const SHARE_FIELDS = ['krId', 'value', 'target', 'direction', 'timestamp', 'krTemplateId'];

function buildSharePayload(db) {
  const rows = db.prepare(`
    SELECT id, current_val, target_val, start_val, live_config, last_sync_at, kr_template_id
    FROM key_results
    WHERE shared_with_mediagenix = 1
  `).all();

  return {
    protocol: 1,
    metrics: rows.map((r) => {
      let direction = Number(r.start_val) > Number(r.target_val) ? 'lo' : 'hi';
      if (r.live_config) {
        try { direction = JSON.parse(r.live_config).direction || direction; } catch { /* derived stands */ }
      }
      return {
        krId: r.id,
        value: Number(r.current_val),
        target: Number(r.target_val),
        direction,
        timestamp: r.last_sync_at || new Date().toISOString(),
        krTemplateId: r.kr_template_id || null,
      };
    }),
  };
}

module.exports = { buildSharePayload, SHARE_FIELDS };
