const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { encrypt, decrypt, isEncrypted } = require('../utils/crypto.cjs');

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

  // ── Ciphertext is self-identifying (enc:v1:) ──
  // Without a marker, "legacy plaintext" and "right ciphertext, wrong key" are
  // indistinguishable, and a key rotation would silently be read as data.

  it('marks ciphertext so it is distinguishable from plaintext', () => {
    const encrypted = encrypt('secret', key);
    assert.ok(encrypted.startsWith('enc:v1:'), `expected an enc:v1: marker, got ${encrypted.slice(0, 12)}`);
    assert.ok(isEncrypted(encrypted));
    assert.ok(!isEncrypted('plain-password'));
    assert.ok(!isEncrypted(''));
  });

  it('passes through never-encrypted plaintext unchanged', () => {
    // A config written while no key was configured holds a bare password.
    assert.equal(decrypt('local', key), 'local');
    assert.equal(decrypt('a-plain-password', key), 'a-plain-password');
  });

  it('still reads pre-marker ciphertext (upgrade path)', () => {
    // Values written by the previous scheme carry no prefix but are real
    // ciphertext; they must keep working until they are re-wrapped.
    const legacy = encrypt('secret', key).slice('enc:v1:'.length);
    assert.equal(decrypt(legacy, key), 'secret');
  });

  it('throws on marked ciphertext when the key is wrong, never silently passing it through', () => {
    const encrypted = encrypt('secret', key);
    assert.throws(() => decrypt(encrypted, 'wrong-key'),
      'a wrong key must fail loudly rather than return the ciphertext as a password');
  });
});
