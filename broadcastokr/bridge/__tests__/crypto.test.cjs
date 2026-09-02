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

// ── Rewrap safety (review 2026-09-02, F2) ──
// A pre-marker value was written under BRIDGE_API_KEY. If the bridge is then
// given a dedicated BRIDGE_ENCRYPTION_KEY, rewrapping must use the key the
// value was actually written under — never pass the old ciphertext through
// as "plaintext" and seal the garbage with a marker that says it is good.
const { rewrapSecret, looksLikeCiphertext } = require('../utils/crypto.cjs');

describe('rewrapSecret', () => {
  const oldKey = 'old-BRIDGE_API_KEY';
  const newKey = 'new-dedicated-BRIDGE_ENCRYPTION_KEY';
  const legacy = encrypt('real-db-password', oldKey).slice('enc:v1:'.length);

  it('rewraps a pre-marker value under the legacy key it was written with', () => {
    const sealed = rewrapSecret(legacy, newKey, { legacyKey: oldKey });
    assert.ok(isEncrypted(sealed));
    assert.equal(decrypt(sealed, newKey), 'real-db-password');
  });

  it('refuses (null) rather than sealing ciphertext it cannot read', () => {
    assert.equal(rewrapSecret(legacy, newKey), null);
    assert.equal(rewrapSecret(legacy, newKey, { legacyKey: 'also-wrong' }), null);
  });

  it('still seals genuine plaintext, and leaves marked values alone', () => {
    const sealed = rewrapSecret('hunter2', newKey, { legacyKey: oldKey });
    assert.equal(decrypt(sealed, newKey), 'hunter2');
    const marked = encrypt('x', newKey);
    assert.equal(rewrapSecret(marked, newKey), marked);
    assert.equal(rewrapSecret('', newKey), '');
  });

  it('reads a pre-marker value under the legacy key at decrypt time too', () => {
    assert.equal(decrypt(legacy, newKey, { legacyKey: oldKey }), 'real-db-password');
  });

  it('looksLikeCiphertext is a shape test, not a proof', () => {
    assert.ok(looksLikeCiphertext(legacy));
    assert.ok(!looksLikeCiphertext('hunter2'));
    assert.ok(!looksLikeCiphertext('p@ss-word!'));
    assert.ok(!looksLikeCiphertext('a'.repeat(30)));   // too short to hold IV + tag
  });
});
