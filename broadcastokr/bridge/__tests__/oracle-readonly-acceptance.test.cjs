const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const core = require('../whatson/core.cjs');

// A-2-T4 (F2): the read-only envelope against a REAL Oracle through the
// bridge's own oracledb driver and query runner, under an account that can
// write. Env-gated:
//   sqlplus -s -L "/ as sysdba" @scripts/local-rig/ro-acceptance-oracle.sql <pw>
//   BRIDGE_RO_ACCEPTANCE_ORA=brokr_ro_writer/<pw>@localhost:1521/local \
//     npm run test:bridge -- bridge/__tests__/oracle-readonly-acceptance.test.cjs
//   sqlplus -s -L "/ as sysdba" @scripts/local-rig/ro-acceptance-oracle-drop.sql
// The account name is fixed so the test can never be pointed at a real schema.

const SPEC = process.env.BRIDGE_RO_ACCEPTANCE_ORA || '';
const M = /^(brokr_ro_writer)\/([^@]+)@([^:/]+):(\d+)\/(.+)$/i.exec(SPEC);

function guard() {
  if (!SPEC) return 'BRIDGE_RO_ACCEPTANCE_ORA not set (needs the disposable brokr_ro_writer account)';
  if (!M) return 'BRIDGE_RO_ACCEPTANCE_ORA must be brokr_ro_writer/<pw>@host:port/service';
  if (!core.oracledb) return 'oracledb driver not installed';
  return false;
}
const SKIP = guard();

describe('A-2-T4 Oracle read-only acceptance (real driver)', { skip: SKIP }, () => {
  let conn;
  let c;
  let direct;

  const count = async () => (await direct.execute('SELECT COUNT(*) FROM review_only')).rows[0][0];

  before(async () => {
    const [, user, password, host, port, service] = M;
    conn = { type: 'oracle', host, port: Number(port), service, user, password };
    c = core.createWhatsonCore({ decryptPassword: (p) => p });
    await c.runQuery(conn, 'SELECT 1 AS value FROM DUAL'); // initialises the client the way the bridge does
    direct = await core.oracledb.getConnection({ user, password, connectString: `${host}:${port}/${service}` });
  });

  after(async () => {
    try { await direct?.close(); } catch { /* already gone */ }
    try { await (await c.getOraclePool(conn)).close(0); } catch { /* no pool */ }
  });

  it('control: the account really can write outside the bridge', async () => {
    await direct.execute(`INSERT INTO review_only VALUES (99, 'control')`);
    await direct.rollback();
    assert.equal(await count(), 3);
  });

  it('a supported SELECT runs inside a read-only transaction', async () => {
    const rows = await c.runQuery(conn, 'SELECT COUNT(*) AS value FROM review_only');
    assert.equal(rows[0].VALUE, 3);
  });

  it('a granted write function behind a plain SELECT is refused, rows unchanged', async () => {
    await assert.rejects(c.runQuery(conn, 'SELECT brokr_touch AS value FROM DUAL'), /ORA-/);
    assert.equal(await count(), 3);
  });

  it('KNOWN LIMIT: NEXTVAL is allowed in an Oracle read-only transaction (gaps only, no rows)', async () => {
    // Unlike PostgreSQL, Oracle lets a read-only transaction advance a sequence.
    // It changes no row; the guard is that the reader account has no SELECT on sequences.
    const rows = await c.runQuery(conn, 'SELECT review_seq.NEXTVAL AS value FROM DUAL');
    assert.equal(typeof rows[0].VALUE, 'number');
    assert.equal(await count(), 3);
  });

  it('the reported bypass, DML and locking clauses never reach the database', async () => {
    for (const sql of [
      `SELECT '--' FROM DUAL; DELETE FROM review_only`,
      'DELETE FROM review_only',
      `SELECT q'[x]' AS v FROM review_only FOR UPDATE`,
      `SELECT 1 AS v FROM DUAL; BEGIN DELETE FROM review_only; END;`,
    ]) {
      await assert.rejects(c.runQuery(conn, sql), (e) => e.name === 'SqlEnvelopeError', sql);
    }
    assert.equal(await count(), 3);
  });

  it('after refused writes the pooled connections are clean and still read-only', async () => {
    for (let i = 0; i < 6; i++) {
      await assert.rejects(c.runQuery(conn, 'SELECT brokr_touch AS value FROM DUAL'));
      const rows = await c.runQuery(conn, 'SELECT COUNT(*) AS value FROM review_only');
      assert.equal(rows[0].VALUE, 3);
    }
    assert.equal(await count(), 3);
  });

  it('KNOWN LIMIT: an AUTONOMOUS_TRANSACTION function the account may execute does write', async () => {
    // Oracle runs an autonomous transaction outside the caller's read-only
    // transaction. Nothing in the bridge can see this; only the account's grants
    // stop it. This test pins the limit so the runbook's grant rule is not optional.
    let wrote = false;
    try {
      await c.runQuery(conn, 'SELECT brokr_touch_autonomous AS value FROM DUAL');
      wrote = (await count()) > 3;
    } finally {
      await direct.execute(`DELETE FROM review_only WHERE id > 3`);
      await direct.commit();
    }
    assert.equal(wrote, true, 'if Oracle starts refusing this, update the runbook and this test');
  });

  it('KNOWN LIMIT: a DBMS_LOCK user lock taken through a granted function outlives the query', async () => {
    // Oracle has no "release all user locks"; unlike pg_advisory_lock (open to
    // every PostgreSQL role, released by the bridge) DBMS_LOCK needs an explicit
    // EXECUTE grant. The guard is the reader account's grants, not the bridge.
    const rows = await c.runQuery(conn, 'SELECT brokr_user_lock AS value FROM DUAL');
    assert.equal(rows[0].VALUE, 0, 'lock request did not succeed');
    const other = await core.oracledb.getConnection({ user: conn.user, password: conn.password, connectString: `${conn.host}:${conn.port}/${conn.service}` });
    try {
      const r = await other.execute(
        `BEGIN :rc := DBMS_LOCK.REQUEST(id => 424242, lockmode => DBMS_LOCK.X_MODE, timeout => 0, release_on_commit => FALSE); END;`,
        { rc: { dir: core.oracledb.BIND_OUT, type: core.oracledb.NUMBER } });
      assert.equal(r.outBinds.rc, 1, 'if the lock is gone, the pool now resets sessions: update the runbook and this test');
    } finally {
      await other.close();
    }
  });

  it('a runaway query is cancelled at the 15 s ceiling and the pool recovers', { timeout: 60000 }, async () => {
    const r = await c.executeScalarQuery({
      connConfig: conn,
      sql: `SELECT COUNT(*) AS value FROM all_objects a, all_objects b, all_objects c`,
    });
    assert.equal(r.status, 'timeout');
    const ok = await c.executeScalarQuery({ connConfig: conn, sql: 'SELECT COUNT(*) AS value FROM review_only' });
    assert.deepEqual([ok.status, ok.current], ['ok', 3]);
  });
});
