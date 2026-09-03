const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { globalErrorHandler, constraintDetail } = require('../middleware/errorHandler.cjs');

// R1 rig, finding 19: POST /api/goals with owner = a name hit the users FK and
// came back as a bare 500 with the reason only in the bridge log.

function fakeRes() {
  const res = { statusCode: 200, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
}
const quiet = (fn) => { const w = console.warn, e = console.error; console.warn = () => {}; console.error = () => {}; try { return fn(); } finally { console.warn = w; console.error = e; } };

describe('globalErrorHandler', () => {
  it('answers a SQLite constraint failure with 400 and names the constraint', () => {
    const err = Object.assign(new Error('FOREIGN KEY constraint failed'), { code: 'SQLITE_CONSTRAINT_FOREIGNKEY' });
    const res = fakeRes();
    quiet(() => globalErrorHandler(err, { method: 'POST', path: '/api/goals' }, res, () => {}));
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { error: 'constraint_violation', constraint: 'foreignkey', detail: 'FOREIGN KEY constraint failed' });
  });

  it('keeps everything else a sanitized 500', () => {
    const res = fakeRes();
    quiet(() => globalErrorHandler(new Error('boom'), { method: 'GET', path: '/api/x' }, res, () => {}));
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { error: 'Internal server error' });
    assert.equal(constraintDetail(new Error('no code')), null);
    assert.equal(constraintDetail({ code: 'SQLITE_BUSY' }), null);
  });

  it('classifies the constraint kinds', () => {
    assert.equal(constraintDetail({ code: 'SQLITE_CONSTRAINT_UNIQUE', message: 'u' }).constraint, 'unique');
    assert.equal(constraintDetail({ code: 'SQLITE_CONSTRAINT_NOTNULL', message: 'n' }).constraint, 'notnull');
    assert.equal(constraintDetail({ code: 'SQLITE_CONSTRAINT', message: 'c' }).constraint, 'constraint');
  });
});
