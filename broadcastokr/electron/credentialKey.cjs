const path = require('path');
const { mkdirSync, existsSync, readFileSync, writeFileSync, renameSync } = require('fs');
const { randomBytes } = require('crypto');

/**
 * The desktop credential-encryption key, and the rules for touching it.
 *
 * The file is self-describing — `sealed:` (safeStorage, bound to the OS user
 * account) or `plain:` — for the same reason stored passwords carry `enc:v1:`:
 * without a marker, a keyring that is available on one run and not the next
 * (Linux without a secret service, a profile migration) makes the file
 * ambiguous, and guessing wrong either hands a DPAPI blob to the bridge as the
 * key or feeds a plaintext key to `decryptString`.
 *
 * Two rules, both learned the hard way (review 2026-09-02, F3):
 *   - never overwrite a key file that could not be read. A new key cannot
 *     decrypt what the old one wrote, so the unreadable file is moved aside
 *     with a timestamp and the reason is returned to the caller to show.
 *   - a sealed key on a machine where sealing is unavailable right now is not
 *     lost — the keyring may come back. Run on an ephemeral key, say so, and
 *     leave the file alone; the bridge reports the credentials as unreadable.
 *
 * Pure with respect to Electron: `safeStorage` is injected so this can be
 * tested under plain Node.
 */
const SEALED = 'sealed:';
const PLAIN = 'plain:';

function loadOrCreateCredentialKey({ dataDir, safeStorage, now = () => new Date() }) {
  const keyFile = path.join(dataDir, 'credential-key');
  mkdirSync(dataDir, { recursive: true });
  const canSeal = !!safeStorage?.isEncryptionAvailable?.();

  const persist = (key) => {
    const body = canSeal
      ? SEALED + safeStorage.encryptString(key).toString('base64')
      : PLAIN + key;
    writeFileSync(keyFile, body, { mode: 0o600 });
  };

  if (existsSync(keyFile)) {
    let buf;
    try {
      buf = readFileSync(keyFile);
    } catch (err) {
      // Unreadable on disk (lock, permissions): do not touch it, run ephemeral.
      return { key: randomBytes(32).toString('hex'), persisted: false,
        warning: `The stored credential key could not be read (${err.message}). Existing database passwords will not decrypt until it can.` };
    }
    // Marked files are text; a pre-marker sealed file is a raw DPAPI/keychain
    // blob, so keep the bytes and only look at the string form for the prefix.
    const raw = buf.toString('utf8').trim();

    if (raw.startsWith(SEALED)) {
      if (!canSeal) {
        return { key: randomBytes(32).toString('hex'), persisted: false,
          warning: 'The credential key is sealed to this user account but the system keychain is unavailable right now. '
            + 'Existing database passwords will not decrypt until it is back.' };
      }
      try {
        return { key: safeStorage.decryptString(Buffer.from(raw.slice(SEALED.length), 'base64')), persisted: true };
      } catch (err) {
        return setAside(keyFile, now, `The stored credential key could not be unsealed (${err.message}).`, persist);
      }
    }

    if (raw.startsWith(PLAIN)) {
      const key = raw.slice(PLAIN.length);
      // A keychain that has since become available: upgrade in place. The key
      // itself is unchanged, so nothing that was encrypted is affected.
      if (canSeal) { try { persist(key); } catch { /* keep using it unsealed */ } }
      return { key, persisted: true };
    }

    // Pre-marker file from the first 0.9.0 builds: sealed iff sealing was
    // available when it was written, which we can only assume matches now.
    try {
      const key = canSeal ? safeStorage.decryptString(buf) : raw;
      try { persist(key); } catch { /* keep using it as is */ }
      return { key, persisted: true };
    } catch (err) {
      return setAside(keyFile, now, `The stored credential key could not be read (${err.message}).`, persist);
    }
  }

  const key = randomBytes(32).toString('hex');
  try {
    persist(key);
    return { key, persisted: true };
  } catch (err) {
    return { key, persisted: false, warning: `Could not save the credential key (${err.message}). Passwords stored now will not decrypt after a restart.` };
  }
}

/** Move an unreadable key aside — never over it — then mint a fresh one. */
function setAside(keyFile, now, reason, persist) {
  const stamp = now().toISOString().replace(/[:.]/g, '-');
  const aside = `${keyFile}.unreadable-${stamp}`;
  let moved = false;
  try { renameSync(keyFile, aside); moved = true; } catch { /* leave it; do not overwrite */ }
  if (!moved) {
    return { key: randomBytes(32).toString('hex'), persisted: false,
      warning: `${reason} It was left in place; existing database passwords will need re-entering.` };
  }
  const key = randomBytes(32).toString('hex');
  try { persist(key); } catch { /* ephemeral */ }
  return { key, persisted: true, warning: `${reason} It was moved to ${path.basename(aside)} and a new key generated — existing database passwords will need re-entering.` };
}

module.exports = { loadOrCreateCredentialKey };
