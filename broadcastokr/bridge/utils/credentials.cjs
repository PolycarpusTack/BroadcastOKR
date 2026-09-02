const { encrypt, decrypt, isEncrypted, rewrapSecret } = require('./crypto.cjs');

/**
 * The single decision point for whether stored credentials can be protected.
 *
 * Previously this logic was two inline ternaries in server.cjs — `key ?
 * encrypt(v, key) : v` — which meant that with no key configured, "encryption"
 * silently became a pass-through and WHATS'ON passwords sat in config.json as
 * cleartext. Cloud modes never required a key (they validate OIDC only), so a
 * correctly-configured cloud instance could be storing plaintext credentials.
 *
 * Two changes follow from putting it in one place:
 *   - `available` is explicit, so callers can refuse to *store* a new secret
 *     rather than storing it unprotected (fail closed at the point of harm).
 *   - the no-op branch cannot be reintroduced by a future call site.
 *
 * Scope note: this fails the credential-bearing feature closed, not the whole
 * process. A cockpit instance legitimately holds no client-DB connections, and
 * a fatal boot check would also leave an operator unable to start the app to
 * remove the offending credential.
 */
function createCredentialCipher({ key, mode = 'desktop' }) {
  const available = !!key;
  // Desktop is the documented single-user trust model: one person, one machine,
  // no key required. Cloud modes are multi-user and must protect secrets, so
  // there the absence of a key closes the credential-storing routes.
  const enforced = mode !== 'desktop';

  return {
    available,
    enforced,
    /** True when a new secret must be refused rather than stored unprotected. */
    get unprotected() { return enforced && !available; },

    encrypt(value) {
      if (!available) return value;
      return encrypt(value, key);
    },

    decrypt(value) {
      if (!available) {
        // A marked value means a key was configured when this was written and
        // is now missing. Handing the ciphertext out as a password would fail
        // at the database with an unrelated error; say what actually happened.
        if (isEncrypted(value)) {
          throw new Error('Stored credential is encrypted but no encryption key is configured');
        }
        return value;
      }
      return decrypt(value, key);
    },

    /** Upgrade every stored connection password to marked ciphertext. */
    rewrapStoredConnections(store) {
      if (!available) return { rewrapped: 0, unprotected: countUnprotected(store) };

      const config = store.loadConfig();
      const connections = config.connections || [];
      let rewrapped = 0;

      const upgraded = connections.map((connection) => {
        if (!connection.password || isEncrypted(connection.password)) return connection;
        rewrapped++;
        return { ...connection, password: rewrapSecret(connection.password, key) };
      });

      if (rewrapped > 0) store.saveConfig({ ...config, connections: upgraded });
      return { rewrapped, unprotected: 0 };
    },
  };
}

/** Stored passwords sitting in the clear because no key is configured. */
function countUnprotected(store) {
  const connections = store.loadConfig().connections || [];
  return connections.filter((c) => c.password && !isEncrypted(c.password)).length;
}

module.exports = { createCredentialCipher };
