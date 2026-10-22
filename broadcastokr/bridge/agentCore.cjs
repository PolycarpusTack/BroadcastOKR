/**
 * Connector-agent logic, executor-injected so tests run without databases.
 * The agent's queries live ONLY in its local config file — the operator's DBA
 * can read every query it will ever run — and only numeric scalars leave.
 */
const { postJson } = require('./agentTransport.cjs');

/** One pass: execute every binding, push {krId, value, timestamp} upstream. */
async function runAgentPass(config, identity, { executeQuery, pushFn }) {
  const results = [];
  for (const binding of config.bindings || []) {
    const outcome = await executeQuery({
      connectionId: binding.connectionId,
      sql: binding.sql,
      timeframeDays: binding.timeframeDays,
    });
    if (outcome.status === 'ok' && typeof outcome.current === 'number') {
      results.push({ krId: binding.krId, value: outcome.current, timestamp: new Date().toISOString() });
    } else {
      console.error(`[agent] binding ${binding.krId} failed: ${outcome.error || outcome.status}`);
    }
  }
  if (results.length === 0) return { pushed: 0 };

  const push = pushFn || (async (payload) => {
    // Pinned when agent-config.json carries `pins` (ADR 2026-10-22)
    const res = await postJson(`${config.instanceUrl}/api/agent/ingest`, payload,
      { 'X-Agent-Token': identity.agentToken }, { pins: config.pins, ca: config.ca });
    if (!res.ok) throw new Error(`instance refused ingest: HTTP ${res.status}`);
    return res.json();
  });

  const response = await push({ results });
  return { pushed: results.length, response };
}

async function enrollAgent({ instanceUrl, enrolToken, name, pins, ca }) {
  const res = await postJson(`${instanceUrl}/api/agent/enroll`, { token: enrolToken, name }, {}, { pins, ca });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `enrolment failed: HTTP ${res.status}`);
  }
  return res.json(); // { agentId, agentToken }
}

module.exports = { runAgentPass, enrollAgent };
