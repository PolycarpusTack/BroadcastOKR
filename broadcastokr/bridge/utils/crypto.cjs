const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SALT = 'broadcastokr-bridge-v1';

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
  return packed.toString('base64');
}

/**
 * Decrypt a base64-encoded encrypted string back to plaintext.
 */
function decrypt(encryptedBase64, apiKey) {
  const key = deriveKey(apiKey);
  const packed = Buffer.from(encryptedBase64, 'base64');
  const iv = packed.subarray(0, IV_LENGTH);
  const authTag = packed.subarray(IV_LENGTH, IV_LENGTH + 16);
  const ciphertext = packed.subarray(IV_LENGTH + 16);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}

module.exports = { encrypt, decrypt };
