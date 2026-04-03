const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { encrypt, decrypt } = require('../utils/crypto.cjs');

describe('credential encryption', () => {
  const key = 'test-api-key-for-encryption';

  it('round-trips a password', () => {
    const password = 'my-secret-db-password';
    const encrypted = encrypt(password, key);
    assert.notEqual(encrypted, password);
    assert.equal(decrypt(encrypted, key), password);
  });

  it('produces different ciphertext each time (random IV)', () => {
    const password = 'same-password';
    const a = encrypt(password, key);
    const b = encrypt(password, key);
    assert.notEqual(a, b);
  });

  it('fails to decrypt with wrong key', () => {
    const encrypted = encrypt('secret', key);
    assert.throws(() => decrypt(encrypted, 'wrong-key'));
  });

  it('handles empty string', () => {
    const encrypted = encrypt('', key);
    assert.equal(decrypt(encrypted, key), '');
  });

  it('handles unicode characters', () => {
    const password = 'p@$$w0rd-ñ-日本語';
    const encrypted = encrypt(password, key);
    assert.equal(decrypt(encrypted, key), password);
  });
});
