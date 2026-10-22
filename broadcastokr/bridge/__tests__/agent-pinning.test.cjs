const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const https = require('node:https');
const os = require('node:os');
const path = require('node:path');
const { execFile, execFileSync } = require('node:child_process');
const { promisify } = require('node:util');
const { postJson, fetchPin, validatePins, addPin } = require('../agentTransport.cjs');
const { runAgentPass } = require('../agentCore.cjs');

// ADR 2026-10-22 (R4) decision 2: opt-in SPKI pinning, two slots. Without pins
// the agent trusts the CAs as before; with pins the leaf key must match one.

// Two throwaway self-signed certificates for localhost, made per run: Node can
// make keys but not certificates, and no private key belongs in the repository.
const TLS = fs.mkdtempSync(path.join(os.tmpdir(), 'brokr-tls-'));
function makeCert(name) {
  execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:P-256', '-nodes',
    '-keyout', path.join(TLS, `${name}.key`), '-out', path.join(TLS, `${name}.crt`), '-days', '1',
    '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'], { stdio: 'ignore' });
}
let NO_OPENSSL = false;
try { makeCert('a'); makeCert('b'); } catch { NO_OPENSSL = 'openssl is not on PATH; the TLS cases need it to make test certificates'; }
const read = (f) => fs.readFileSync(path.join(TLS, f), 'utf8');
const certA = NO_OPENSSL ? '' : read('a.crt');
const certB = NO_OPENSSL ? '' : read('b.crt');
// Computed independently of the module under test
const pinOf = (pem) => `sha256/${crypto.createHash('sha256')
  .update(new crypto.X509Certificate(pem).publicKey.export({ type: 'spki', format: 'der' })).digest('base64')}`;
const PIN_A = NO_OPENSSL ? `sha256/${Buffer.alloc(32, 1).toString('base64')}` : pinOf(certA);
const PIN_B = NO_OPENSSL ? `sha256/${Buffer.alloc(32, 2).toString('base64')}` : pinOf(certB);
process.on('exit', () => fs.rmSync(TLS, { recursive: true, force: true }));

describe('agent instance pinning', { skip: NO_OPENSSL }, () => {
  let server, base;
  const received = [];
  before(async () => {
    server = https.createServer({ key: read('a.key'), cert: certA }, (req, res) => {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        received.push({ url: req.url, token: req.headers['x-agent-token'], body: JSON.parse(body || '{}') });
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: true, applied: 1, unknown: [] }));
      });
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `https://localhost:${server.address().port}`;
  });
  after(() => new Promise((resolve) => server.close(resolve)));

  it('without pins trusts the CA as before', async () => {
    const res = await postJson(`${base}/api/agent/ingest`, { results: [] }, {}, { ca: certA });
    assert.equal(res.status, 200);
  });

  it('with a matching pin connects', async () => {
    const res = await postJson(`${base}/api/agent/ingest`, { results: [] }, {}, { ca: certA, pins: [PIN_A] });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true, applied: 1, unknown: [] });
  });

  it('the second slot is honoured, so a key can rotate', async () => {
    const res = await postJson(`${base}/api/agent/ingest`, { results: [] }, {}, { ca: certA, pins: [PIN_B, PIN_A] });
    assert.equal(res.status, 200);
  });

  it('refuses a key that matches no pin and names the key it got, before sending anything', async () => {
    const before = received.length;
    await assert.rejects(
      postJson(`${base}/api/agent/ingest`, { secret: 1 }, { 'X-Agent-Token': 'tok' }, { ca: certA, pins: [PIN_B] }),
      (err) => err.message.includes('matches no pin') && err.message.includes(PIN_A),
    );
    assert.equal(received.length, before, 'no request may reach a server whose key is not pinned');
  });

  it('a pin never replaces the CA and host-name check', async () => {
    await assert.rejects(postJson(`${base}/api/agent/ingest`, {}, {}, { pins: [PIN_A] }));
  });

  it('reads the current pin of an instance', async () => {
    assert.equal(await fetchPin(base, { ca: certA }), PIN_A);
  });

  it('the agent pass pushes through the pinned transport', async () => {
    const config = { instanceUrl: base, pins: [PIN_A], ca: certA, bindings: [{ krId: 'kr1', connectionId: 'c', sql: 'x' }] };
    const r = await runAgentPass(config, { agentToken: 'tok-a' }, { executeQuery: async () => ({ status: 'ok', current: 7 }) });
    assert.equal(r.pushed, 1);
    const last = received.at(-1);
    assert.equal(last.token, 'tok-a');
    assert.equal(last.body.results[0].value, 7);
  });

  it('the pin command prints the pin and --write adds it to the config', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brokr-pin-'));
    try {
      fs.writeFileSync(path.join(dir, 'a.crt'), certA);
      fs.writeFileSync(path.join(dir, 'agent-config.json'), JSON.stringify({ instanceUrl: base, caFile: 'a.crt', pins: [PIN_B] }));
      const { stdout } = await promisify(execFile)(process.execPath,
        [path.join(__dirname, '..', 'agent.cjs'), 'pin', '--dir', dir, '--write']);
      assert.equal(stdout.split(/\r?\n/)[0].trim(), PIN_A);
      const config = JSON.parse(fs.readFileSync(path.join(dir, 'agent-config.json'), 'utf8'));
      assert.deepEqual(config.pins, [PIN_B, PIN_A]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('re-enrolling into an existing config keeps the operator config and adds the pin', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brokr-reenrol-'));
    try {
      const caPath = path.join(dir, 'a.crt');
      fs.writeFileSync(caPath, certA);
      const binding = { krId: 'kr1', connectionId: 'c', sql: 'SELECT 1' };
      fs.writeFileSync(path.join(dir, 'agent-config.json'), JSON.stringify({ instanceUrl: base, bindings: [binding] }));
      await promisify(execFile)(process.execPath, [path.join(__dirname, '..', 'agent.cjs'), 'enroll',
        '--instance', base, '--token', 'enrol-once', '--name', 'site', '--dir', dir, '--pin', PIN_A, '--ca-file', caPath]);
      const config = JSON.parse(fs.readFileSync(path.join(dir, 'agent-config.json'), 'utf8'));
      assert.deepEqual(config.pins, [PIN_A]);
      assert.deepEqual(config.bindings, [binding]);
      assert.equal(config.caFile, caPath);
      assert.equal(received.at(-1).url, '/api/agent/enroll');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('the agent pass fails loudly on a pin mismatch', async () => {
    const config = { instanceUrl: base, pins: [PIN_B], ca: certA, bindings: [{ krId: 'kr1', connectionId: 'c', sql: 'x' }] };
    await assert.rejects(
      runAgentPass(config, { agentToken: 'tok-a' }, { executeQuery: async () => ({ status: 'ok', current: 7 }) }),
      /matches no pin/,
    );
  });
});

describe('pin configuration', () => {
  it('accepts no pins, one or two well-formed pins', () => {
    assert.equal(validatePins({ instanceUrl: 'http://x' }), null);
    assert.equal(validatePins({ instanceUrl: 'https://x', pins: [PIN_A] }), null);
    assert.equal(validatePins({ instanceUrl: 'https://x', pins: [PIN_A, PIN_B] }), null);
  });
  it('refuses more than two, malformed pins, and pins on plain http', () => {
    assert.match(validatePins({ instanceUrl: 'https://x', pins: [PIN_A, PIN_B, PIN_A] }), /at most two/);
    assert.match(validatePins({ instanceUrl: 'https://x', pins: ['sha1/abc'] }), /sha256\//);
    assert.match(validatePins({ instanceUrl: 'http://x', pins: [PIN_A] }), /https/);
    assert.match(validatePins({ instanceUrl: 'https://x', pins: 'sha256/x' }), /must be a list/);
  });
  it('accepts an upper-case scheme the URL parser accepts', () => {
    assert.equal(validatePins({ instanceUrl: 'HTTPS://x', pins: [PIN_A] }), null);
  });
  it('adding a pin keeps at most two and drops the oldest', () => {
    assert.deepEqual(addPin([], PIN_A), [PIN_A]);
    assert.deepEqual(addPin([PIN_A], PIN_A), [PIN_A]);
    assert.deepEqual(addPin([PIN_A], PIN_B), [PIN_A, PIN_B]);
    const PIN_C = `sha256/${Buffer.alloc(32, 7).toString('base64')}`;
    assert.deepEqual(addPin([PIN_A, PIN_B], PIN_C), [PIN_B, PIN_C]);
  });
});
