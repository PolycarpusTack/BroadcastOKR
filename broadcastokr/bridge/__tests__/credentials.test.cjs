const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { encrypt, decrypt, isEncrypted } = require('../utils/crypto.cjs');
const { createCredentialCipher } = require('../utils/credentials.cjs');

/** In-memory stand-in for createConfigStore. */
function memStore(connections) {
  let config = { connections };
  return {
    loadConfig: () => structuredClone(config),
    saveConfig: (next) => { config = structuredClone(next); },
    get config() { return config; },
  };
}

describe('createCredentialCipher.rewrapStoredConnections', () => {
  const oldKey = 'old-api-key';
  const newKey = 'new-encryption-key';

  it('upgrades plaintext and legacy ciphertext, and reports marked values it cannot read', () => {
    const store = memStore([
      { id: 'plain', password: 'hunter2' },
      { id: 'legacy', password: encrypt('legacy-pw', oldKey).slice('enc:v1:'.length) },
      { id: 'marked-ok', password: encrypt('fine', newKey) },
      { id: 'marked-foreign', password: encrypt('from-another-machine', 'some-other-key') },
      { id: 'none' },
    ]);
    const cipher = createCredentialCipher({ key: newKey, mode: 'client', legacyKey: oldKey });
    const report = cipher.rewrapStoredConnections(store);

    assert.deepEqual(report, { rewrapped: 2, unprotected: 0, unreadable: 1 });
    const byId = Object.fromEntries(store.config.connections.map((c) => [c.id, c.password]));
    assert.equal(decrypt(byId.plain, newKey), 'hunter2');
    assert.equal(decrypt(byId.legacy, newKey), 'legacy-pw');
    assert.ok(isEncrypted(byId['marked-foreign']), 'an unreadable value is left exactly as found');
    assert.throws(() => cipher.decrypt(byId['marked-foreign']));
  });

  it('never seals legacy ciphertext it cannot read as if it were a password', () => {
    // The 2026-09-02 upgrade trap: BRIDGE_API_KEY install adds a dedicated key
    // but the legacy key is not passed (or is wrong).
    const legacy = encrypt('legacy-pw', oldKey).slice('enc:v1:'.length);
    const store = memStore([{ id: 'legacy', password: legacy }]);
    const cipher = createCredentialCipher({ key: newKey, mode: 'client' });
    const report = cipher.rewrapStoredConnections(store);

    assert.equal(report.unreadable, 1);
    assert.equal(report.rewrapped, 0);
    assert.equal(store.config.connections[0].password, legacy, 'left untouched on disk');
  });

  it('with no key configured, counts plaintext as unprotected and refuses marked values', () => {
    const store = memStore([{ id: 'a', password: 'plain' }, { id: 'b', password: encrypt('x', 'k') }]);
    const cipher = createCredentialCipher({ key: undefined, mode: 'client' });
    assert.deepEqual(cipher.rewrapStoredConnections(store), { rewrapped: 0, unprotected: 1, unreadable: 0 });
    assert.equal(cipher.decrypt('plain'), 'plain');
    assert.throws(() => cipher.decrypt(encrypt('x', 'k')), /no encryption key/);
  });
});
