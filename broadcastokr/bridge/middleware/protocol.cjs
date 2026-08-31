const { MIN_SUPPORTED, PROTOCOL_VERSION } = require('../protocol.cjs');

/**
 * Rejects clients below the protocol floor with 426 so outdated desktops and
 * agents fail with a clear "please update" instead of subtle breakage.
 * A missing header passes while MIN_SUPPORTED is 1 (pre-protocol clients);
 * once the floor rises, missing means too old.
 */
function createProtocolMiddleware() {
  return function protocolMiddleware(req, res, next) {
    if (req.path === '/api/health') return next();

    const raw = req.headers['x-brokr-protocol'];
    if (raw === undefined) {
      if (MIN_SUPPORTED > 1) {
        return res.status(426).json({ error: 'Client too old', minSupported: MIN_SUPPORTED, current: PROTOCOL_VERSION });
      }
      return next();
    }

    const version = Number(raw);
    if (Number.isNaN(version) || version < MIN_SUPPORTED) {
      return res.status(426).json({ error: 'Client too old', minSupported: MIN_SUPPORTED, current: PROTOCOL_VERSION });
    }
    next();
  };
}

module.exports = { createProtocolMiddleware };
