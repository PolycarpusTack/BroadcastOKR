const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SALT = 'broadcastokr-bridge-v1';

/**
 * Ciphertext is self-identifying. Without this marker a stored value is
 * ambiguous — "never encrypted" and "encrypted with a key we no longer have"
 * look identical, so a key rotation reads as data and a plaintext password
 * reads as corruption. The prefix makes the two cases decidable, which is what
 * lets `decrypt` pass plaintext through safely and still throw on a bad key.
 */
const PREFIX = 'enc:v1:';

/** True for values produced by `encrypt` (i.e. carrying the marker). */
function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

/**
 * Derive a 32-byte encryption key from the API key using PBKDF2.
 */
function deriveKey(apiKey) {
  return crypto.pbkdf2Sync(apiKey, SALT, 100000, 32, 'sha256');
}

/**
 * Encrypt a plaintext string. Returns a base64-encoded string
 * containing IV + ciphertext + auth tag.
 */
function encrypt(plaintext, apiKey) {
  const key = deriveKey(apiKey);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Pack: IV (16) + authTag (16) + ciphertext
  const packed = Buffer.concat([iv, authTag, encrypted]);
  return PREFIX + packed.toString('base64');
}

/** Raw unpack of a marker-less base64 payload. Throws on a wrong key. */
function decryptPacked(base64, apiKey) {
  const key = deriveKey(apiKey);
  const packed = Buffer.from(base64, 'base64');
  const iv = packed.subarray(0, IV_LENGTH);
  const authTag = packed.subarray(IV_LENGTH, IV_LENGTH + 16);
  const ciphertext = packed.subarray(IV_LENGTH + 16);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

/**
 * Does an unmarked value have the shape of a pre-marker ciphertext? Strict
 * base64 that unpacks to at least IV + tag (32 bytes). A heuristic — a long
 * alphanumeric plaintext password can match — so it is used only to decide
 * what NOT to do (rewrap, or trust a fallback), never to reject a read.
 */
function looksLikeCiphertext(value) {
  if (typeof value !== 'string' || value.length % 4 !== 0) return false;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return false;
  return Buffer.from(value, 'base64').length >= IV_LENGTH + 16;
}

/** Keys to try on an unmarked value, most likely first, without repeats. */
function candidateKeys(apiKey, legacyKey) {
  return [...new Set([legacyKey, apiKey].filter(Boolean))];
}

/**
 * Decrypt a stored value back to plaintext.
 *
 * `legacyKey` is the key the pre-marker scheme wrote under (in practice
 * BRIDGE_API_KEY); a value written before the marker is tried under it first.
 */
function decrypt(value, apiKey, { legacyKey } = {}) {
  // Marked ciphertext: a failure here is a real failure (wrong or rotated key)
  // and must surface, never fall back to handing the ciphertext out as a password.
  if (isEncrypted(value)) {
    return decryptPacked(value.slice(PREFIX.length), apiKey);
  }

  // Unmarked: either a value written by the pre-marker scheme, or a password
  // stored while no key was configured. Try the old scheme; if it does not
  // unpack, the value was plaintext all along. This ambiguity is bounded — it
  // exists only for values written before the marker, and `rewrapSecret`
  // upgrades them on sight.
  for (const key of candidateKeys(apiKey, legacyKey)) {
    try {
      return decryptPacked(value, key);
    } catch { /* not ciphertext under this key */ }
  }
  return value;
}

/**
 * Encrypt a stored secret unless it already carries the marker.
 *
 * Returns `null` when the value cannot be rewrapped safely: it is shaped like
 * ciphertext but unpacks under neither key. Sealing it anyway would wrap the
 * old ciphertext as if it were the password and mark the result as good —
 * exactly the silent corruption the marker exists to prevent (review
 * 2026-09-02, F2: an install with BRIDGE_API_KEY that then sets a dedicated
 * BRIDGE_ENCRYPTION_KEY, as the docs recommend). Callers leave a `null` alone
 * and say so.
 */
function rewrapSecret(value, apiKey, { legacyKey } = {}) {
  if (!value || isEncrypted(value)) return value;
  for (const key of candidateKeys(apiKey, legacyKey)) {
    try {
      return encrypt(decryptPacked(value, key), apiKey);
    } catch { /* not ciphertext under this key */ }
  }
  if (looksLikeCiphertext(value)) return null;
  return encrypt(value, apiKey);
}

module.exports = { encrypt, decrypt, isEncrypted, rewrapSecret, looksLikeCiphertext };
