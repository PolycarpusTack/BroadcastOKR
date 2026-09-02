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
 * Decrypt a base64-encoded encrypted string back to plaintext.
 */
function decrypt(value, apiKey) {
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
  try {
    return decryptPacked(value, apiKey);
  } catch {
    return value;
  }
}

/** Encrypt a stored secret unless it already carries the marker. */
function rewrapSecret(value, apiKey) {
  if (!value || isEncrypted(value)) return value;
  return encrypt(decrypt(value, apiKey), apiKey);
}

module.exports = { encrypt, decrypt, isEncrypted, rewrapSecret };
