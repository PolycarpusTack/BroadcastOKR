const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadOrCreateCredentialKey } = require('../../electron/credentialKey.cjs');

/** A safeStorage stand-in: reversible, and switchable off to mimic a missing keyring. */
function fakeSafeStorage(available = true) {
  return {
    isEncryptionAvailable: () => available,
    encryptString: (s) => Buffer.from(`SEALED(${s})`),
    decryptString: (buf) => {
      const m = /^SEALED\((.*)\)$/.exec(buf.toString('utf8'));
      if (!m) throw new Error('not a sealed blob');
      return m[1];
    },
  };
}

describe('desktop credential key (review 2026-09-02, F3)', () => {
  let dataDir;
  const keyFile = () => path.join(dataDir, 'credential-key');
  const now = () => new Date('2026-09-02T20:00:00Z');

  beforeEach(() => { dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brokr-key-')); });
  afterEach(() => fs.rmSync(dataDir, { recursive: true, force: true }));

  it('mints a sealed, self-describing key on first run and reads it back', () => {
    const ss = fakeSafeStorage(true);
    const first = loadOrCreateCredentialKey({ dataDir, safeStorage: ss, now });
    assert.equal(first.warning, undefined);
    assert.ok(fs.readFileSync(keyFile(), 'utf8').startsWith('sealed:'));
    const again = loadOrCreateCredentialKey({ dataDir, safeStorage: ss, now });
    assert.equal(again.key, first.key);
  });

  it('never overwrites a key it cannot unseal — moves it aside and says so', () => {
    const ss = fakeSafeStorage(true);
    fs.writeFileSync(keyFile(), 'sealed:' + Buffer.from('garbage').toString('base64'));
    const result = loadOrCreateCredentialKey({ dataDir, safeStorage: ss, now });
    assert.match(result.warning, /could not be unsealed/);
    assert.match(result.warning, /re-entering/);
    const aside = fs.readdirSync(dataDir).find((f) => f.startsWith('credential-key.unreadable-'));
    assert.ok(aside, 'the unreadable file must be preserved under a timestamped name');
    assert.equal(fs.readFileSync(path.join(dataDir, aside), 'utf8'), 'sealed:' + Buffer.from('garbage').toString('base64'));
    // and a fresh, readable key now exists
    assert.equal(loadOrCreateCredentialKey({ dataDir, safeStorage: ss, now }).key, result.key);
  });

  it('runs on an ephemeral key, leaving the file alone, when the keychain is temporarily unavailable', () => {
    const before = loadOrCreateCredentialKey({ dataDir, safeStorage: fakeSafeStorage(true), now });
    const fileBefore = fs.readFileSync(keyFile(), 'utf8');

    const during = loadOrCreateCredentialKey({ dataDir, safeStorage: fakeSafeStorage(false), now });
    assert.notEqual(during.key, before.key);
    assert.equal(during.persisted, false);
    assert.match(during.warning, /keychain is unavailable/);
    assert.equal(fs.readFileSync(keyFile(), 'utf8'), fileBefore, 'the sealed key must survive the outage');

    const after = loadOrCreateCredentialKey({ dataDir, safeStorage: fakeSafeStorage(true), now });
    assert.equal(after.key, before.key, 'when the keychain returns, so do the credentials');
  });

  it('upgrades a plain key in place once sealing becomes available, without changing it', () => {
    const plain = loadOrCreateCredentialKey({ dataDir, safeStorage: fakeSafeStorage(false), now });
    assert.ok(fs.readFileSync(keyFile(), 'utf8').startsWith('plain:'));
    const sealed = loadOrCreateCredentialKey({ dataDir, safeStorage: fakeSafeStorage(true), now });
    assert.equal(sealed.key, plain.key);
    assert.ok(fs.readFileSync(keyFile(), 'utf8').startsWith('sealed:'));
  });

  it('reads the pre-marker formats from the first 0.9.0 builds and marks them', () => {
    const ss = fakeSafeStorage(true);
    fs.writeFileSync(keyFile(), ss.encryptString('legacy-sealed-key'));
    assert.equal(loadOrCreateCredentialKey({ dataDir, safeStorage: ss, now }).key, 'legacy-sealed-key');
    assert.ok(fs.readFileSync(keyFile(), 'utf8').startsWith('sealed:'));

    fs.writeFileSync(keyFile(), 'legacy-plain-key\n');
    assert.equal(loadOrCreateCredentialKey({ dataDir, safeStorage: fakeSafeStorage(false), now }).key, 'legacy-plain-key');
    assert.ok(fs.readFileSync(keyFile(), 'utf8').startsWith('plain:'));
  });
});
