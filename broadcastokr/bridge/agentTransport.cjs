/**
 * How the connector agent reaches its instance (ADR 2026-10-22, R4).
 *
 * Without `pins` the agent trusts the system CAs, exactly as before (plain
 * fetch). With `pins` — one or two `sha256/<base64>` hashes of the instance's
 * SubjectPublicKeyInfo — the normal CA and host-name checks still run and the
 * leaf key must also match a pin; otherwise the handshake fails before a byte
 * of the request (token, values) is sent. Two slots let a key rotate: pin the
 * next key, switch, drop the old one.
 *
 * `ca` is an extra trust anchor (PEM) for instances behind a private CA —
 * `caFile` in agent-config.json — and for the tests.
 */
const crypto = require('crypto');
const https = require('https');
const net = require('net');
const tls = require('tls');

const PIN_RE = /^sha256\/[A-Za-z0-9+/]{43}=$/;
const MAX_PINS = 2;

/**
 * The pin of a peer certificate as Node's TLS layer hands it over. Hashed from
 * the DER SubjectPublicKeyInfo of `raw`: `peerCert.pubkey` is the bare EC point
 * for EC keys, which no other tool would produce.
 */
function spkiPin(peerCert) {
  const spki = new crypto.X509Certificate(peerCert.raw).publicKey.export({ type: 'spki', format: 'der' });
  return `sha256/${crypto.createHash('sha256').update(spki).digest('base64')}`;
}

/** null when the config's pins are usable, otherwise what is wrong. */
function validatePins(config) {
  const pins = config.pins;
  if (pins === undefined || (Array.isArray(pins) && pins.length === 0)) return null;
  if (!Array.isArray(pins) || pins.length > MAX_PINS) return `pins: at most two entries (current and next key)`;
  const bad = pins.find((p) => typeof p !== 'string' || !PIN_RE.test(p));
  if (bad !== undefined) return `pins: '${bad}' is not a sha256/<base64> SPKI hash`;
  if (!String(config.instanceUrl || '').startsWith('https:')) return 'pins require an https:// instanceUrl';
  return null;
}

/** Add a pin, keep at most two, drop the oldest. */
function addPin(pins, pin) {
  const next = (pins || []).filter((p) => p !== pin).concat(pin);
  return next.slice(-MAX_PINS);
}

function pinnedIdentityCheck(pins) {
  return (host, cert) => {
    const err = tls.checkServerIdentity(host, cert);
    if (err) return err;
    const got = spkiPin(cert);
    if (!pins.includes(got)) return new Error(`instance key ${got} matches no pin in agent-config.json`);
    return undefined;
  };
}

/** POST JSON; resolves to { ok, status, json() } like fetch's Response. */
function postJson(url, body, headers = {}, { pins, ca } = {}) {
  const payload = JSON.stringify(body);
  const allHeaders = { 'Content-Type': 'application/json', ...headers };
  if (!pins?.length && !ca) {
    return fetch(url, { method: 'POST', headers: allHeaders, body: payload });
  }
  const target = new URL(url);
  if (target.protocol !== 'https:') return Promise.reject(new Error('pins and caFile require an https:// instance'));
  return new Promise((resolve, reject) => {
    const req = https.request(target, {
      method: 'POST',
      headers: { ...allHeaders, 'Content-Length': Buffer.byteLength(payload) },
      ...(ca && { ca: [...tls.rootCertificates, ca] }),
      ...(pins?.length && { checkServerIdentity: pinnedIdentityCheck(pins) }),
      agent: false,
    }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { text += chunk; });
      res.on('end', () => resolve({
        ok: res.statusCode >= 200 && res.statusCode < 300,
        status: res.statusCode,
        json: async () => JSON.parse(text),
      }));
    });
    req.on('error', reject);
    req.end(payload);
  });
}

/** The current pin of an instance, after the normal CA and host-name checks. */
function fetchPin(instanceUrl, { ca } = {}) {
  const target = new URL(instanceUrl);
  if (target.protocol !== 'https:') return Promise.reject(new Error('only an https:// instance has a key to pin'));
  return new Promise((resolve, reject) => {
    const socket = tls.connect({
      host: target.hostname,
      port: Number(target.port) || 443,
      servername: net.isIP(target.hostname) ? undefined : target.hostname,
      ...(ca && { ca: [...tls.rootCertificates, ca] }),
    }, () => {
      const pin = spkiPin(socket.getPeerCertificate());
      socket.end();
      resolve(pin);
    });
    socket.on('error', reject);
  });
}

module.exports = { postJson, fetchPin, validatePins, addPin, spkiPin };
