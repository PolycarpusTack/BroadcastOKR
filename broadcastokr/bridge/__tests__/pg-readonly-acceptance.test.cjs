const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const core = require('../whatson/core.cjs');

// A-2-T3 (F2): the read-only envelope against a REAL PostgreSQL through the
// bridge's own `pg` driver and query runner. The scanner tests prove what the
// bridge refuses; this proves what the database refuses for a SELECT the
// scanner lets through, under an account that *can* write.
//
// Env-gated. Point BRIDGE_RO_ACCEPTANCE_PG at a superuser connection string for
// a disposable database (never a wonpoc* or customer DB), e.g.
//   createdb -h localhost -p 5433 -U postgres brokr_ro_acceptance
//   BRIDGE_RO_ACCEPTANCE_PG=postgres://postgres@localhost:5433/brokr_ro_acceptance?sslmode=disable \
//     npm run test:bridge -- bridge/__tests__/pg-readonly-acceptance.test.cjs
//   dropdb -h localhost -p 5433 -U postgres brokr_ro_acceptance
// The test creates and drops its own role and objects; dropping the DB is the
// operator's step. See docs/saas/readiness/r1-findings.md (A-2-T3).

const ADMIN_URL = process.env.BRIDGE_RO_ACCEPTANCE_PG || '';
const ROLE = 'brokr_ro_writer';
const ROLE_PW = `ro-${process.pid}-${Date.now()}`;

function guard() {
  if (!ADMIN_URL) return 'BRIDGE_RO_ACCEPTANCE_PG not set (needs a disposable PostgreSQL database)';
  if (!core.pg) return 'pg driver not installed';
  const db = new URL(ADMIN_URL).pathname.slice(1);
  if (!/^brokr_ro_/.test(db)) return `refusing to run against "${db}": the database name must start with brokr_ro_`;
  return false;
}
const SKIP = guard();

describe('A-2-T3 PostgreSQL read-only acceptance (real driver)', { skip: SKIP }, () => {
  let admin;
  let c;
  let conn;

  const count = async () => Number((await admin.query('SELECT count(*) AS n FROM review_only')).rows[0].n);
  const seqValue = async () => Number((await admin.query('SELECT last_value FROM review_seq')).rows[0].last_value);

  before(async () => {
    admin = new core.pg.Client({ connectionString: ADMIN_URL });
    await admin.connect();
    await admin.query(`DROP OWNED BY ${ROLE}`).catch(() => {});
    await admin.query(`DROP ROLE IF EXISTS ${ROLE}`);
    await admin.query(`CREATE ROLE ${ROLE} LOGIN PASSWORD '${ROLE_PW}'`);
    await admin.query(`
      DROP TABLE IF EXISTS review_only;
      DROP SEQUENCE IF EXISTS review_seq;
      CREATE TABLE review_only (id int PRIMARY KEY, v text);
      INSERT INTO review_only VALUES (1, 'a'), (2, 'b'), (3, 'c');
      CREATE SEQUENCE review_seq;
      -- A write the scanner cannot see: it only ever reads "SELECT brokr_touch()".
      CREATE OR REPLACE FUNCTION brokr_touch() RETURNS int LANGUAGE plpgsql AS $$
        BEGIN INSERT INTO review_only VALUES (100 + (SELECT count(*) FROM review_only), 'x'); RETURN 1; END $$;
      CREATE OR REPLACE FUNCTION brokr_touch_definer() RETURNS int LANGUAGE plpgsql SECURITY DEFINER AS $$
        BEGIN DELETE FROM review_only; RETURN 1; END $$;
      -- Write-capable on purpose: the account must not be what stops the write.
      GRANT SELECT, INSERT, UPDATE, DELETE ON review_only TO ${ROLE};
      GRANT USAGE, SELECT, UPDATE ON SEQUENCE review_seq TO ${ROLE};
      GRANT EXECUTE ON FUNCTION brokr_touch(), brokr_touch_definer() TO ${ROLE};
    `);
    const u = new URL(ADMIN_URL);
    conn = {
      type: 'postgres', host: u.hostname, port: Number(u.port || 5432),
      service: u.pathname.slice(1), user: ROLE, password: ROLE_PW,
    };
    c = core.createWhatsonCore({ decryptPassword: (p) => p });
  });

  after(async () => {
    try { await c?.getPgPool(conn).end(); } catch { /* pool may not exist */ }
    if (!admin) return;
    await admin.query(`
      DROP FUNCTION IF EXISTS brokr_touch(), brokr_touch_definer();
      DROP TABLE IF EXISTS review_only;
      DROP SEQUENCE IF EXISTS review_seq;
    `);
    await admin.query(`DROP OWNED BY ${ROLE}`).catch(() => {});
    await admin.query(`DROP ROLE IF EXISTS ${ROLE}`);
    await admin.end();
  });

  it('control: the account really can write outside the bridge', async () => {
    const direct = new core.pg.Client({ ...conn, database: conn.service, password: ROLE_PW });
    await direct.connect();
    try {
      await direct.query('BEGIN');
      await direct.query(`INSERT INTO review_only VALUES (99, 'control')`);
      await direct.query('ROLLBACK');
    } finally { await direct.end(); }
    assert.equal(await count(), 3);
  });

  it('a supported SELECT runs and sees a read-only transaction', async () => {
    const rows = await c.runQuery(conn, `SELECT count(*) AS value, current_setting('transaction_read_only') AS ro FROM review_only`);
    assert.equal(rows[0].VALUE, 3);
    assert.equal(rows[0].RO, 'on');
  });

  it('a granted write function behind a plain SELECT is refused by the database, rows unchanged', async () => {
    await assert.rejects(c.runQuery(conn, 'SELECT brokr_touch() AS value'), /read-only transaction/);
    await assert.rejects(c.runQuery(conn, 'SELECT brokr_touch_definer() AS value'), /read-only transaction/);
    assert.equal(await count(), 3);
  });

  it('nextval() is refused, the sequence does not move', async () => {
    const before = await seqValue();
    await assert.rejects(c.runQuery(conn, `SELECT nextval('review_seq') AS value`), /read-only transaction/);
    assert.equal(await seqValue(), before);
  });

  it('the reported bypass and DML never reach the database', async () => {
    for (const sql of [`SELECT '--'; DELETE FROM review_only`, 'DELETE FROM review_only', `SELECT 1 AS v FROM review_only FOR UPDATE`]) {
      await assert.rejects(c.runQuery(conn, sql), (e) => e.name === 'SqlEnvelopeError', sql);
    }
    assert.equal(await count(), 3);
  });

  it('after a refused write the pooled connection is clean and read-only again', async () => {
    for (let i = 0; i < 6; i++) {
      await assert.rejects(c.runQuery(conn, 'SELECT brokr_touch() AS value'));
      const rows = await c.runQuery(conn, `SELECT current_setting('transaction_read_only') AS ro, 1 AS value`);
      assert.equal(rows[0].RO, 'on');
    }
    const idle = await admin.query(
      `SELECT count(*) AS n FROM pg_stat_activity WHERE usename = $1 AND state LIKE 'idle in transaction%'`, [ROLE]);
    assert.equal(Number(idle.rows[0].n), 0);
    assert.equal(await count(), 3);
  });

  it('a session setting made inside the query does not leak to the next borrower', async () => {
    await c.runQuery(conn, `SELECT set_config('application_name', 'leaked', false) AS value`);
    const rows = await c.runQuery(conn, `SELECT current_setting('application_name') AS value`);
    assert.notEqual(rows[0].VALUE, 'leaked');
  });

  it('a session-level advisory lock taken by a SELECT does not outlive the query', async () => {
    // pg_advisory_lock is allowed in a read-only transaction and survives ROLLBACK:
    // left alone it stays on the pooled session and can block the customer's own jobs.
    await c.runQuery(conn, 'SELECT pg_advisory_lock(424242) IS NULL AS value');
    const held = await admin.query(`SELECT count(*) AS n FROM pg_locks WHERE locktype = 'advisory' AND objid = 424242`);
    assert.equal(Number(held.rows[0].n), 0);
  });

  it('a runaway query is cancelled database-side at the 15 s ceiling and the pool recovers', { timeout: 40000 }, async () => {
    const r = await c.executeScalarQuery({ connConfig: conn, sql: 'SELECT pg_sleep(30) IS NULL AS value' });
    assert.equal(r.status, 'timeout');
    // statement_timeout fires on the server at the same ceiling; give it a moment to land
    let active = 1;
    for (let i = 0; i < 20 && active > 0; i++) {
      await new Promise((res) => setTimeout(res, 250));
      active = Number((await admin.query(
        `SELECT count(*) AS n FROM pg_stat_activity WHERE usename = $1 AND query LIKE '%pg_sleep%' AND state = 'active'`, [ROLE])).rows[0].n);
    }
    assert.equal(active, 0, 'the sleeping statement is still running on the server');
    const ok = await c.executeScalarQuery({ connConfig: conn, sql: 'SELECT count(*) AS value FROM review_only' });
    assert.deepEqual([ok.status, ok.current], ['ok', 3]);
  });
});
