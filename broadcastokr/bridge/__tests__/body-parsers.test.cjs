const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { mountJsonParsers } = require('../middleware/bodyParsers.cjs');

// Review 2026-10-22: an export with KR history is megabytes, and body-parser's
// 100 KB default refused it with 413 before the import route ran.

describe('JSON body limits', () => {
  let server, base;
  before(async () => {
    const app = express();
    mountJsonParsers(app);
    app.post('/api/sync/import', (req, res) => res.json({ bytes: JSON.stringify(req.body).length }));
    app.post('/api/goals', (req, res) => res.json({ bytes: JSON.stringify(req.body).length }));
    server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  });
  after(() => new Promise((resolve) => server.close(resolve)));

  const big = JSON.stringify({ data: 'x'.repeat(2 * 1024 * 1024) });
  const post = (p) => fetch(`${base}${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: big });

  it('accepts a multi-megabyte import', async () => {
    const res = await post('/api/sync/import');
    assert.equal(res.status, 200);
  });

  it('keeps the default limit on ordinary routes', async () => {
    const res = await post('/api/goals');
    assert.equal(res.status, 413);
  });
});
