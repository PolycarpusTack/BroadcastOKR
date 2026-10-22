#!/usr/bin/env node
/**
 * BrOKR connector agent — runs at the customer site, reads WHATS'ON read-only,
 * pushes numeric KR values outbound to the tenant's instance. No inbound
 * ports; no SQL ever arrives over the network.
 *
 *   node bridge/agent.cjs enroll --instance URL --token ENROL_TOKEN --name "AETN site" --dir /etc/brokr-agent [--pin sha256/…] [--ca-file PEM]
 *   node bridge/agent.cjs run --dir /etc/brokr-agent
 *   node bridge/agent.cjs pin --instance URL [--dir DIR] [--write] [--ca-file PEM]
 *
 * The directory holds:
 *   agent-config.json    connections + KR bindings + interval (operator-owned;
 *                        every query the agent will ever run is in this file);
 *                        optional `pins` (one or two sha256/<base64> SPKI hashes
 *                        of the instance key) and `caFile` (extra trust anchor)
 *                        — ADR 2026-10-22
 *   agent-identity.json  agentId + agentToken (0600, written by enroll)
 *   AGENT_DATA_KEY env   optional: decrypts stored connection passwords — values
 *                        as `encrypt()` writes them (`enc:v1:…`), or the older
 *                        `enc:` + raw-blob convention
 */
const fs = require('fs');
const path = require('path');
const { runAgentPass, enrollAgent } = require('./agentCore.cjs');
const { fetchPin, validatePins, addPin } = require('./agentTransport.cjs');
const { createWhatsonCore, buildBinds } = require('./whatson/core.cjs');
const { decrypt } = require('./utils/crypto.cjs');

/**
 * Stored agent passwords come in three shapes: plaintext, `enc:v1:…` as the
 * bridge's own `encrypt()` produces (the natural thing to paste), and the
 * original agent convention of `enc:` in front of a raw blob. Slicing a fixed
 * `enc:` off the first of those left `v1:…` behind and handed it to the
 * database as the password (review 2026-09-02, F9) — so let `decrypt` decide.
 */
function agentDecrypt(password, dataKey) {
  if (typeof password !== 'string' || !dataKey) return password;
  const legacy = password.startsWith('enc:') && !password.startsWith('enc:v1:');
  return decrypt(legacy ? password.slice(4) : password, dataKey);
}

function arg(name, fallback) {
  const idx = process.argv.indexOf(`--${name}`);
  return idx !== -1 ? process.argv[idx + 1] : fallback;
}

const command = process.argv[2];
const dir = path.resolve(arg('dir', '.'));
const identityPath = path.join(dir, 'agent-identity.json');
const configPath = path.join(dir, 'agent-config.json');

/** The config with its pins checked and `caFile` read; exits on a bad pin set. */
function loadConfig() {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const problem = validatePins(config);
  if (problem) {
    console.error(`agent-config.json: ${problem}`);
    process.exit(2);
  }
  if (config.caFile) config.ca = fs.readFileSync(path.resolve(dir, config.caFile), 'utf8');
  return config;
}

async function main() {
  if (command === 'enroll') {
    const instanceUrl = arg('instance');
    const enrolToken = arg('token');
    const name = arg('name', 'unnamed-agent');
    if (!instanceUrl || !enrolToken) {
      console.error('usage: agent.cjs enroll --instance URL --token ENROL_TOKEN --name NAME [--dir DIR] [--pin sha256/…] [--ca-file PEM]');
      process.exit(2);
    }
    // A hosted tenant's pin is known at provisioning: the enrolment itself is pinned
    const pins = arg('pin') ? [arg('pin')] : undefined;
    const problem = validatePins({ instanceUrl, pins });
    if (problem) {
      console.error(problem);
      process.exit(2);
    }
    const caFile = arg('ca-file') ? path.resolve(arg('ca-file')) : undefined;
    const ca = caFile ? fs.readFileSync(caFile, 'utf8') : undefined;
    fs.mkdirSync(dir, { recursive: true });
    const identity = await enrollAgent({ instanceUrl, enrolToken, name, pins, ca });
    fs.writeFileSync(identityPath, JSON.stringify({ agentId: identity.agentId, agentToken: identity.agentToken }, null, 2), { mode: 0o600 });
    // A re-enrolment keeps the operator's config but must not leave `run` less pinned than the enrolment was
    const config = fs.existsSync(configPath)
      ? JSON.parse(fs.readFileSync(configPath, 'utf8'))
      : { instanceUrl, intervalMs: 15 * 60 * 1000, connections: [], bindings: [] };
    if (pins) config.pins = addPin(config.pins, pins[0]);
    if (caFile) config.caFile = caFile;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), { mode: 0o600 });
    console.log(`Enrolled as ${identity.agentId}. Identity at ${identityPath}; add connections and bindings to ${configPath}.`);
    return;
  }

  if (command === 'pin') {
    const existing = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : null;
    const instanceUrl = arg('instance', existing?.instanceUrl);
    if (!instanceUrl) {
      console.error('usage: agent.cjs pin --instance URL [--dir DIR] [--write] [--ca-file PEM]');
      process.exit(2);
    }
    const caFile = arg('ca-file') || existing?.caFile;
    const ca = caFile ? fs.readFileSync(path.resolve(dir, caFile), 'utf8') : undefined;
    const pin = await fetchPin(instanceUrl, { ca });
    console.log(pin);
    if (process.argv.includes('--write')) {
      if (!existing) {
        console.error(`No ${configPath} to write to; enroll first.`);
        process.exit(2);
      }
      existing.pins = addPin(existing.pins, pin);
      fs.writeFileSync(configPath, JSON.stringify(existing, null, 2), { mode: 0o600 });
      console.log(`Pinned in ${configPath} (${existing.pins.length} of 2 slots).`);
    }
    return;
  }

  if (command === 'run') {
    const config = loadConfig();
    const identity = JSON.parse(fs.readFileSync(identityPath, 'utf8'));
    const dataKey = process.env.AGENT_DATA_KEY;

    const core = createWhatsonCore({ decryptPassword: (password) => agentDecrypt(password, dataKey) });

    // Shares the bridge's scalar contract; only the wording differs, because
    // these land in a local operator log rather than an API response.
    const executeQuery = (q) => core.executeScalarQuery(
      {
        connConfig: (config.connections || []).find((c) => c.id === q.connectionId),
        sql: q.sql,
        binds: buildBinds(q),
      },
      {
        messages: {
          noConnection: 'Connection not found in agent config',
          noRows: 'No rows',
          notNumeric: 'Non-numeric result',
          failed: (err) => err.message,
        },
      },
    );

    const pass = () => runAgentPass(config, identity, { executeQuery })
      .then((r) => console.log(`[agent] pushed ${r.pushed} values`))
      .catch((err) => console.error(`[agent] pass failed: ${err.message}`));

    console.log(`BrOKR agent ${identity.agentId} — ${config.bindings?.length ?? 0} bindings, every ${(config.intervalMs || 900000) / 1000}s`);
    await pass();
    setInterval(pass, config.intervalMs || 15 * 60 * 1000);
    return;
  }

  console.error('usage: agent.cjs <enroll|run|pin> [options]');
  process.exit(2);
}

if (require.main === module) {
  main().catch((err) => { console.error(err.message); process.exit(1); });
}

module.exports = { agentDecrypt };
