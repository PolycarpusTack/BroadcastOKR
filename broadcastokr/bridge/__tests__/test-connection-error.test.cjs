const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { describeConnectionError } = require('../routes/whatson.cjs');

// /api/test-connection is owner-only: the operator fixing the connection gets
// the driver's reason, not a bare "Connection test failed".

describe('describeConnectionError', () => {
  it('names a refused port with its code and a hint', () => {
    const err = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:1'), { code: 'ECONNREFUSED' });
    assert.equal(describeConnectionError(err),
      'Connection test failed — connect ECONNREFUSED 127.0.0.1:1 (nothing is listening on that host and port)');
  });

  it('keeps only the first line of an Oracle error and derives the ORA code', () => {
    const err = Object.assign(new Error('ORA-01017: invalid username/password; logon denied\nHelp: https://docs.oracle.com/error-help/db/ora-01017/'), { errorNum: 1017 });
    assert.equal(describeConnectionError(err), 'Connection test failed — ORA-01017: invalid username/password; logon denied');
  });

  it('explains Postgres SQLSTATE codes', () => {
    const err = Object.assign(new Error('password authentication failed for user "brokr_reader"'), { code: '28P01' });
    assert.equal(describeConnectionError(err),
      'Connection test failed — 28P01: password authentication failed for user "brokr_reader" (password authentication failed)');
    const db = Object.assign(new Error('database "brokr_rig" does not exist'), { code: '3D000' });
    assert.match(describeConnectionError(db), /3D000: database "brokr_rig" does not exist \(database does not exist\)/);
  });

  it('never crashes on odd input', () => {
    assert.equal(describeConnectionError(undefined), 'Connection test failed — unknown error');
    assert.equal(describeConnectionError('boom'), 'Connection test failed — boom');
  });
});
