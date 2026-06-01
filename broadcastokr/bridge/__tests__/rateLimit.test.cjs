const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

// Force a tiny limit for the test before requiring the middleware factory.
process.env.BRIDGE_RATE_LIMIT = '3';
process.env.BRIDGE_RATE_WINDOW_MS = '60000';
const { createRateLimitMiddleware } = require('../middleware/rateLimit.cjs');

describe('rate limit middleware', () => {
  let server;
  let base;

  before(async () => {
    const app = express();
    app.use(createRateLimitMiddleware());
    app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
    app.get('/api/goals', (req, res) => res.json([]));
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', resolve);
    });
    base = `http://127.0.0.1:${server.address().port}`;
  });

  after(() => {
    server.close();
  });

  it('allows requests under the limit then returns 429', async () => {
    const codes = [];
    for (let i = 0; i < 5; i++) {
      const res = await fetch(`${base}/api/goals`);
      codes.push(res.status);
    }
    // limit is 3 → first 3 ok (200), rest throttled (429)
    assert.equal(codes.filter((c) => c === 200).length, 3);
    assert.ok(codes.includes(429), 'expected at least one 429 once over the limit');
  });

  it('never throttles /api/health', async () => {
    const codes = [];
    for (let i = 0; i < 10; i++) {
      const res = await fetch(`${base}/api/health`);
      codes.push(res.status);
    }
    assert.ok(codes.every((c) => c === 200), 'health checks must never be rate limited');
  });
});
