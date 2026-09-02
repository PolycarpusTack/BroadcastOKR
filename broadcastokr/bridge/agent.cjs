#!/usr/bin/env node
/**
 * BrOKR connector agent — runs at the customer site, reads WHATS'ON read-only,
 * pushes numeric KR values outbound to the tenant's instance. No inbound
 * ports; no SQL ever arrives over the network.
 *
 *   node bridge/agent.cjs enroll --instance URL --token ENROL_TOKEN --name "AETN site" --dir /etc/brokr-agent
 *   node bridge/agent.cjs run --dir /etc/brokr-agent
 *
 * The directory holds:
 *   agent-config.json    connections + KR bindings + interval (operator-owned;
 *                        every query the agent will ever run is in this file)
 *   agent-identity.json  agentId + agentToken (0600, written by enroll)
 *   AGENT_DATA_KEY env   optional: decrypts `enc:`-prefixed connection passwords
 */
const fs = require('fs');
const path = require('path');
const { runAgentPass, enrollAgent } = require('./agentCore.cjs');
const { createWhatsonCore, buildBinds } = require('./whatson/core.cjs');
const { decrypt } = require('./utils/crypto.cjs');

function arg(name, fallback) {
  const idx = process.argv.indexOf(`--${name}`);
  return idx !== -1 ? process.argv[idx + 1] : fallback;
}

const command = process.argv[2];
const dir = path.resolve(arg('dir', '.'));
const identityPath = path.join(dir, 'agent-identity.json');
const configPath = path.join(dir, 'agent-config.json');

async function main() {
  if (command === 'enroll') {
    const instanceUrl = arg('instance');
    const enrolToken = arg('token');
    const name = arg('name', 'unnamed-agent');
    if (!instanceUrl || !enrolToken) {
      console.error('usage: agent.cjs enroll --instance URL --token ENROL_TOKEN --name NAME [--dir DIR]');
      process.exit(2);
    }
    fs.mkdirSync(dir, { recursive: true });
    const identity = await enrollAgent({ instanceUrl, enrolToken, name });
    fs.writeFileSync(identityPath, JSON.stringify({ agentId: identity.agentId, agentToken: identity.agentToken }, null, 2), { mode: 0o600 });
    if (!fs.existsSync(configPath)) {
      fs.writeFileSync(configPath, JSON.stringify({
        instanceUrl, intervalMs: 15 * 60 * 1000, connections: [], bindings: [],
      }, null, 2), { mode: 0o600 });
    }
    console.log(`Enrolled as ${identity.agentId}. Identity at ${identityPath}; add connections and bindings to ${configPath}.`);
    return;
  }

  if (command === 'run') {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const identity = JSON.parse(fs.readFileSync(identityPath, 'utf8'));
    const dataKey = process.env.AGENT_DATA_KEY;

    const core = createWhatsonCore({
      decryptPassword: (password) =>
        (typeof password === 'string' && password.startsWith('enc:') && dataKey
          ? decrypt(password.slice(4), dataKey)
          : password),
    });

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

  console.error('usage: agent.cjs <enroll|run> [options]');
  process.exit(2);
}

main().catch((err) => { console.error(err.message); process.exit(1); });
