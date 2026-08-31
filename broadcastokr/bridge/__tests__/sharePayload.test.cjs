const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createDB } = require('../db/connection.cjs');
const { runMigrations } = require('../db/migrate.cjs');
const { buildSharePayload, SHARE_FIELDS } = require('../cockpit/sharePayload.cjs');

// FF-4: non-opted-in data cannot serialize into the cockpit payload — enforced
// by allowlist construction, proven by sentinel scan. This test ships BEFORE
// the channel exists.

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');
const PRIVATE = 'SENTINEL-PRIVATE';

describe('FF-4: share payload allowlist', () => {
  let db;

  beforeEach(() => {
    db = createDB(':memory:');
    runMigrations(db, MIGRATIONS_DIR);
    db.prepare('INSERT INTO users (id, name, role, av, color, dept, title) VALUES (1, ?, ?, ?, ?, ?, ?)')
      .run(`${PRIVATE}-user`, 'owner', 'A', '#000', 'E', 'D');
    db.prepare(`INSERT INTO goals (id, title, status, progress, owner, channel, period)
      VALUES ('g1', ?, 'behind', 0, 1, 0, 'Q1')`).run(`${PRIVATE}-goal-title`);

    const insertKR = db.prepare(`INSERT INTO key_results
      (id, goal_id, title, start_val, target_val, current_val, progress, status, live_config, shared_with_mediagenix, sort_order)
      VALUES (?, 'g1', ?, ?, ?, ?, 0, 'behind', ?, ?, ?)`);
    // Shared KR — its title and SQL still must never leave
    insertKR.run('kr-shared', `${PRIVATE}-shared-title`, 100, 5, 12,
      JSON.stringify({ connectionId: 'conn1', sql: `SELECT ${PRIVATE}-deal-cost`, unit: 'h', direction: 'lo' }), 1, 0);
    // Private KR — nothing of it may appear
    insertKR.run('kr-private', `${PRIVATE}-private-title`, 0, 100, 40,
      JSON.stringify({ connectionId: 'conn1', sql: `SELECT ${PRIVATE}-secret`, unit: '#', direction: 'hi' }), 0, 1);
    db.prepare(`INSERT INTO kr_history (kr_id, timestamp, value, note, actor, source)
      VALUES ('kr-shared', '2026-08-31T00:00:00Z', 10, ?, ?, 'check-in')`)
      .run(`${PRIVATE}-note`, `${PRIVATE}-actor`);
  });

  afterEach(() => db.close());

  it('serializes zero private sentinels and only allowlisted fields', () => {
    const payload = buildSharePayload(db);
    const text = JSON.stringify(payload);

    assert.ok(!text.includes(PRIVATE), `payload leaked private content: ${text}`);
    assert.equal(payload.metrics.length, 1, 'only the shared KR may appear');
    assert.equal(payload.metrics[0].krId, 'kr-shared');

    for (const metric of payload.metrics) {
      assert.deepEqual(Object.keys(metric).sort(), [...SHARE_FIELDS].sort(),
        'metric objects carry exactly the allowlisted fields');
    }
    assert.deepEqual(Object.keys(payload).sort(), ['metrics', 'protocol']);
  });

  it('carries the numeric facts and direction for the shared KR', () => {
    const [m] = buildSharePayload(db).metrics;
    assert.equal(m.value, 12);
    assert.equal(m.target, 5);
    assert.equal(m.direction, 'lo');
    assert.equal(typeof m.timestamp, 'string');
  });

  it('unsharing removes the KR from the next payload', () => {
    db.prepare("UPDATE key_results SET shared_with_mediagenix = 0 WHERE id = 'kr-shared'").run();
    assert.equal(buildSharePayload(db).metrics.length, 0);
  });
});
