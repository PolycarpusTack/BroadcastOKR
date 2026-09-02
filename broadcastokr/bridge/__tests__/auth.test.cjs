const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createAuthMiddleware } = require('../middleware/auth.cjs');

function mockReq(headers = {}) {
  return { headers, path: '/api/goals' };
}

function mockRes() {
  let statusCode = 200;
  let body = null;
  return {
    status(code) { statusCode = code; return this; },
    json(data) { body = data; },
    get statusCode() { return statusCode; },
    get body() { return body; },
  };
}

describe('auth middleware', () => {
  const middleware = createAuthMiddleware({ mode: 'desktop', apiKey: 'test-secret-key' });

  it('allows requests with valid bearer token', () => {
    const req = mockReq({ authorization: 'Bearer test-secret-key' });
    const res = mockRes();
    let nextCalled = false;
    middleware(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
  });

  it('rejects requests with missing auth header', () => {
    const req = mockReq({});
    const res = mockRes();
    let nextCalled = false;
    middleware(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 401);
  });

  it('rejects requests with wrong token', () => {
    const req = mockReq({ authorization: 'Bearer wrong-key' });
    const res = mockRes();
    let nextCalled = false;
    middleware(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 401);
  });

  it('allows /api/health without auth', () => {
    const req = mockReq({});
    req.path = '/api/health';
    const res = mockRes();
    let nextCalled = false;
    middleware(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
  });

  it('skips auth when no API key is configured', () => {
    const noAuthMiddleware = createAuthMiddleware(undefined);
    const req = mockReq({});
    const res = mockRes();
    let nextCalled = false;
    noAuthMiddleware(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
  });
});

// ── Path canonicalisation (review 2026-09-02, F1) ──
// Express routes case-insensitively and tolerates a trailing slash; every
// path-keyed decision must see the same shape the handler will.
const { canonicalPath, isSessionExempt } = require('../middleware/auth.cjs');

describe('canonicalPath / isSessionExempt', () => {
  it('lowercases and strips trailing slashes', () => {
    assert.equal(canonicalPath('/API/KPI/EXECUTE-BATCH'), '/api/kpi/execute-batch');
    assert.equal(canonicalPath('/api/kpi/execute-batch/'), '/api/kpi/execute-batch');
    assert.equal(canonicalPath('/api/goals//'), '/api/goals');
    assert.equal(canonicalPath('/'), '/');
    assert.equal(canonicalPath(''), '/');
  });

  it('never exempts an API path because of its case or a trailing slash', () => {
    for (const p of ['/API/KPI/EXECUTE-BATCH', '/api/sync/backup/', '/Api/Connections', '/API']) {
      assert.equal(isSessionExempt(p), false, `${p} must be guarded`);
    }
    assert.equal(isSessionExempt('/api/health/'), true);
    assert.equal(isSessionExempt('/API/HEALTH'), true);
    assert.equal(isSessionExempt('/index.html'), true);
    assert.equal(isSessionExempt('/apix/anything'), true);
  });
});
