const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { assertReadOnlySelect, scanCode, SqlEnvelopeError } = require('../whatson/sqlEnvelope.cjs');
const core = require('../whatson/core.cjs');
const templates = require('../whatson/templates.cjs');

// ADR-A2 (F2): the read-only SQL envelope — scanner corpus, the reported
// bypass, and the driver-side lifecycle observed through fake drivers.

/** Every SQL string the repository itself ships (both dialects). */
function repositoryCorpus() {
  const seen = new Map();
  for (const t of templates.getKpiTemplates({ connections: [{ type: 'oracle' }, { type: 'postgres' }] })) {
    seen.set(t.sql, `template ${t.id || t.name || ''}`.trim());
  }
  for (const type of ['oracle', 'postgres']) {
    const conn = { type, schema: 'psi', user: 'psi' };
    seen.set(core.getTablesQuery(conn).sql, `${type} tables`);
    seen.set(core.getColumnsQuery(conn, 'PSITRANSMISSION').sql, `${type} columns`);
    seen.set(core.getTestQuery(conn), `${type} test`);
  }
  return [...seen];
}

// What src/utils/queryBuilder.ts emits, per dialect (count / percent-where / average, with binds)
const BUILDER_SHAPES = [
  `SELECT COUNT(*) AS value FROM PSI.PSITRANSMISSION WHERE TX_TXDATE >= :start_date AND TX_TXDATE <= :end_date`,
  `SELECT ROUND(SUM(CASE WHEN TX_LIVESUBTITLING = 1 THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0) * 100, 1) AS value FROM PSI.PSITRANSMISSION WHERE TX_ID_CHANNEL = 'VRT 1'`,
  `SELECT ROUND(100.0 * SUM(CASE WHEN tx_livesubtitling = 1 THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1) AS value FROM psi.psitransmission WHERE tx_txdate >= :start_date`,
  `SELECT ROUND(AVG(TX_ICDURATION), 1) AS value FROM PSI.PSITRANSMISSION WHERE TX_TITLE = 'O''Neill''s hour'`,
];

const POSITIVE = [
  ...BUILDER_SHAPES,
  `SELECT 1`,
  `SELECT 1 AS test FROM DUAL`,
  `SELECT * FROM (SELECT 1) AS t`,
  `SELECT * FROM t WHERE name = 'a;b'`,
  `SELECT /* comment; with ; semicolons */ 1`,
  `SELECT 1 -- trailing comment; with semicolon`,
  `SELECT "weird;column" FROM "my""table"`,
  `SELECT $$literal; with ; semicolons$$ AS v`,
  `SELECT $tag$ DROP TABLE nothing; $tag$ AS v`,
  `select q'[it's; a "quoted" thing]' as v from dual`,
  `select nq'{;}' as v from dual`,
  `SELECT E'it\\'s; ok' AS v`,
  `SELECT COUNT(*) AS value FROM psi.psitransmission WHERE tx_txdate >= date_trunc('month', CURRENT_DATE) AND tx_txdate < date_trunc('month', CURRENT_DATE) + interval '1 month'`,
  `SELECT set_id, lock_status, updated_at, deleted_flag, into_bin FROM psi.psischedule`,
  `SELECT REPLACE(title, ';', ',') AS value FROM psi.psischedule`,
  `SELECT COUNT(*) AS value FROM PSI.PSITRANSMISSION WHERE TX_TXDATE >= TRUNC(SYSDATE, 'MM')`,
  `SELECT t.x FROM t WHERE t.y = $1`,
  `SELECT 1 UNION ALL SELECT 2`,
];

const NEGATIVE = [
  // The reported bypass, and its relatives
  [`SELECT '--'; DELETE FROM review_only`, /Multiple statements/],
  [`SELECT '/*'; DELETE FROM review_only`, /Multiple statements/],
  [`SELECT 1; DROP TABLE t`, /Multiple statements/],
  [`SELECT 1;`, /remove the trailing semicolon/],
  [`SELECT 1 /* */; DROP TABLE t`, /Multiple statements/],
  [`SELECT "a"; DROP TABLE t`, /Multiple statements/],
  [`SELECT $$x$$; DROP TABLE t`, /Multiple statements/],
  [`select q'[x]'; drop table t`, /Multiple statements/],
  [`SELECT E'\\''; DROP TABLE t`, /Multiple statements/],
  // Not a SELECT, or a SELECT hidden behind a comment
  [`INSERT INTO t VALUES (1)`, /Only SELECT/],
  [`DELETE FROM t`, /Only SELECT/],
  [`DROP TABLE t`, /Only SELECT/],
  [`/* SELECT 1 */ DROP TABLE t`, /Only SELECT/],
  [`-- SELECT 1\nDROP TABLE t`, /Only SELECT/],
  [`WITH x AS (SELECT 1) SELECT * FROM x`, /Only SELECT/],
  [`DO $$ BEGIN DELETE FROM t; END $$`, /Only SELECT/],
  [``, /Only SELECT/],
  [`   `, /Only SELECT/],
  // A SELECT that is not read-only
  [`SELECT * INTO backup FROM t`, /SELECT INTO/],
  [`SELECT * FROM t FOR UPDATE`, /locking clauses/],
  [`SELECT * FROM t FOR SHARE`, /locking clauses/],
  [`SELECT * FROM t FOR NO KEY UPDATE`, /locking clauses/],
  [`SELECT 1 FROM t WHERE EXISTS (DELETE FROM t RETURNING 1)`, /found DELETE/],
  [`SELECT * FROM t LOCK IN SHARE MODE`, /found LOCK/],
  // Constructs the scanner refuses to guess about
  [`SELECT 'unterminated`, /Unterminated string/],
  [`SELECT "unterminated`, /Unterminated quoted identifier/],
  [`SELECT 1 /* unterminated`, /Unterminated block comment/],
  [`SELECT $$unterminated`, /Unterminated dollar/],
  [`select q'[unterminated' from dual`, /Unterminated alternative/],
];

describe('sqlEnvelope: scanner corpus', () => {
  it('accepts every SQL string the repository ships', () => {
    for (const [sql, where] of repositoryCorpus()) {
      assert.doesNotThrow(() => assertReadOnlySelect(sql), `${where}: ${sql}`);
    }
    assert.ok(repositoryCorpus().length >= 12, 'corpus should include both dialects’ templates and schema queries');
  });

  it('accepts the builder shapes and the quoting/comment corpus', () => {
    for (const sql of POSITIVE) assert.doesNotThrow(() => assertReadOnlySelect(sql), sql);
  });

  it('rejects every negative case with an actionable message, before any driver call', () => {
    for (const [sql, message] of NEGATIVE) {
      assert.throws(() => assertReadOnlySelect(sql), (err) => {
        assert.ok(err instanceof SqlEnvelopeError, `${sql}: SqlEnvelopeError expected`);
        assert.match(err.message, message, sql);
        return true;
      });
    }
  });

  it('the code view never carries literal text, so it is safe to log', () => {
    const code = scanCode(`SELECT 'secret;value', "col""name", $$more$$, q'[x]' FROM t -- pw=hunter2\n WHERE a = E'\\'s'`);
    assert.doesNotMatch(code, /secret|hunter2|more|name/);
    assert.equal(code.replace(/\s+/g, ' ').trim(), `SELECT '?', "?", '?', '?' FROM t WHERE a = '?'`);
  });

  it('the wrapped preview keeps a trailing line comment from eating the wrapper', () => {
    const pgWrapped = core.wrapPreviewQuery({ type: 'postgres' }, 'SELECT 1 -- note');
    assert.match(scanCode(pgWrapped), /_preview LIMIT 20/);
    assert.doesNotThrow(() => assertReadOnlySelect(pgWrapped));
    const oraWrapped = core.wrapPreviewQuery({ type: 'oracle' }, 'SELECT 1 FROM DUAL -- note');
    assert.match(scanCode(oraWrapped), /ROWNUM <= 20/);
  });
});

// ── Driver lifecycle through the owned seam ──────────────────────────────────

function fakePg({ failOn } = {}) {
  const calls = [];
  const releases = [];
  const client = {
    async query(text, values) {
      calls.push([text, values]);
      if (failOn && text === failOn) throw new Error('boom');
      return { rows: [{ value: '42' }] };
    },
    release(err) { releases.push(err); },
  };
  class Pool {
    constructor(cfg) { this.cfg = cfg; }
    async connect() { return client; }
  }
  return { driver: { Pool }, calls, releases };
}

function fakeOracle({ failOn } = {}) {
  const calls = [];
  const closes = [];
  let rollbacks = 0;
  const conn = {
    async execute(sql, binds) {
      calls.push([sql, binds]);
      if (failOn && sql === failOn) throw new Error('ORA-boom');
      return { rows: [{ VALUE: 42 }] };
    },
    async rollback() { rollbacks += 1; },
    async close(opts) { closes.push(opts); },
  };
  const driver = {
    OUT_FORMAT_OBJECT: 4002,
    initOracleClient() {},
    async createPool() { return { getConnection: async () => conn }; },
  };
  return { driver, calls, closes, rollbacks: () => rollbacks };
}

const PG_CONN = { type: 'postgres', host: 'h', port: 5432, service: 'db', user: 'ro', password: 'x' };
const ORA_CONN = { type: 'oracle', host: 'h', port: 1521, service: 'db', user: 'ro', password: 'x' };

describe('core read-only lifecycle (fake drivers)', () => {
  it('PostgreSQL: BEGIN READ ONLY, the exact validated SQL, ROLLBACK, clean release', async () => {
    const pg = fakePg();
    const c = core.createWhatsonCore({ decryptPassword: (p) => p, drivers: { pg: pg.driver, oracledb: null } });
    const sql = `SELECT COUNT(*) AS value FROM psi.psitransmission WHERE tx_txdate >= :start_date`;
    const rows = await c.runQuery(PG_CONN, sql, { start_date: '2026-01-01' });
    assert.deepEqual(pg.calls.map(([t]) => t), ['BEGIN READ ONLY', sql.replace(':start_date', '$1'), 'ROLLBACK']);
    assert.deepEqual(pg.calls[1][1], ['2026-01-01']);
    assert.deepEqual(pg.releases, [undefined]);
    assert.deepEqual(rows, [{ VALUE: 42 }]);
  });

  it('PostgreSQL: a failed query still rolls back and the client is released with the error (destroyed)', async () => {
    const sql = 'SELECT 1';
    const pg = fakePg({ failOn: sql });
    const c = core.createWhatsonCore({ decryptPassword: (p) => p, drivers: { pg: pg.driver, oracledb: null } });
    await assert.rejects(() => c.runQuery(PG_CONN, sql), /boom/);
    assert.deepEqual(pg.calls.map(([t]) => t), ['BEGIN READ ONLY', sql, 'ROLLBACK']);
    assert.equal(pg.releases.length, 1);
    assert.ok(pg.releases[0] instanceof Error, 'release(err) so pg drops the connection');
  });

  it('Oracle: SET TRANSACTION READ ONLY first, rollback, close; a failure drops the connection', async () => {
    const ok = fakeOracle();
    const c = core.createWhatsonCore({ decryptPassword: (p) => p, drivers: { pg: null, oracledb: ok.driver } });
    const sql = 'SELECT 1 AS test FROM DUAL';
    await c.runQuery(ORA_CONN, sql);
    assert.deepEqual(ok.calls.map(([s]) => s), ['SET TRANSACTION READ ONLY', sql]);
    assert.equal(ok.rollbacks(), 1);
    assert.deepEqual(ok.closes, [undefined]);

    const bad = fakeOracle({ failOn: sql });
    const c2 = core.createWhatsonCore({ decryptPassword: (p) => p, drivers: { pg: null, oracledb: bad.driver } });
    await assert.rejects(() => c2.runQuery(ORA_CONN, sql), /ORA-boom/);
    assert.equal(bad.rollbacks(), 1);
    assert.deepEqual(bad.closes, [{ drop: true }]);
  });

  it('the reported payload never reaches a driver, on either dialect, through every entry point', async () => {
    const payload = `SELECT '--'; DELETE FROM review_only`;
    const pg = fakePg();
    const ora = fakeOracle();
    const c = core.createWhatsonCore({ decryptPassword: (p) => p, drivers: { pg: pg.driver, oracledb: ora.driver } });
    await assert.rejects(() => c.runQuery(PG_CONN, payload), /Multiple statements/);
    await assert.rejects(() => c.runQuery(ORA_CONN, payload), /Multiple statements/);
    await assert.rejects(() => c.runQueryWithTimeout(PG_CONN, payload), /Multiple statements/);
    const scalar = await c.executeScalarQuery({ connConfig: ORA_CONN, sql: payload, binds: {} });
    assert.equal(scalar.status, 'error');
    assert.match(scalar.error, /Multiple statements/);
    assert.equal(pg.calls.length, 0);
    assert.equal(ora.calls.length, 0);
  });
});
