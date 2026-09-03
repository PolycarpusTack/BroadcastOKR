const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { resolveTestConnection } = require('../routes/whatson.cjs');

// R1 rig, finding 27: a stored connection re-tested from the client carries the
// mask GET /api/connections handed it, and the mask was sent to the database.

const config = { connections: [
  { id: 'c1', name: 'Prod', type: 'postgres', host: 'db', port: 5432, service: 'won', user: 'psi', password: 'enc:v1:ciphertext' },
] };
const saved = { id: 'c1', name: 'Prod', type: 'postgres', host: 'db', port: 5432, service: 'won', user: 'psi' };

describe('resolveTestConnection', () => {
  it('substitutes the stored secret for a masked password when the id is known', () => {
    assert.equal(resolveTestConnection({ ...saved, password: '***' }, config).password, 'enc:v1:ciphertext');
    assert.equal(resolveTestConnection({ ...saved, password: '' }, config).password, 'enc:v1:ciphertext');
    assert.equal(resolveTestConnection(saved, config).password, 'enc:v1:ciphertext');
  });

  it('never overrides a password the caller actually typed', () => {
    assert.equal(resolveTestConnection({ ...saved, password: 'hunter2' }, config).password, 'hunter2');
  });

  it('leaves an unknown id or a form without an id alone (the test then fails honestly)', () => {
    assert.equal(resolveTestConnection({ ...saved, id: 'nope', password: '***' }, config).password, '***');
    const { id, ...form } = saved; void id;
    assert.equal(resolveTestConnection({ ...form, password: '***' }, config).password, '***');
    assert.deepEqual(resolveTestConnection(undefined, config), {});
  });

  it('keeps every other field from the request, not from the store', () => {
    const r = resolveTestConnection({ ...saved, host: 'other-host', password: '***' }, config);
    assert.equal(r.host, 'other-host');
  });
});
