const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');

// FF-8 (R3): a feature outside the instance's tier is refused server-side
// where it enters, caps refuse past the licence, and the usage report says
// what the instance holds. One instance per tier, plus the desktop default.

const SERVER = path.join(__dirname, '..', 'server.cjs');
const BASE_PORT = 6500 + Math.floor(Math.random() * 40);
const json = (method, body, extra = {}) => ({
  method, headers: { 'Content-Type': 'application/json', ...extra },
  body: body === undefined ? undefined : JSON.stringify(body),
});

async function startInstance(port, env) {
  const server = spawn(process.execPath, [SERVER], {
    env: {
      ...process.env,
      BRIDGE_MODE: 'client', BRIDGE_INSECURE_NO_AUTH: '1',
      BRIDGE_DB_PATH: ':memory:', BRIDGE_PORT: String(port), BRIDGE_HOST: '127.0.0.1',
      BRIDGE_API_KEY: '', BRIDGE_ENCRYPTION_KEY: 'k', BRIDGE_KR_SYNC_INTERVAL_MS: '3600000',
      ...env,
    },
    stdio: 'ignore',
  });
  const base = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 15000;
  for (;;) {
    try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* not up */ }
    if (Date.now() > deadline) { server.kill(); throw new Error(`instance on ${port} did not start`); }
    await new Promise((r) => setTimeout(r, 200));
  }
  await fetch(`${base}/api/sync/migrate-from-local`, json('POST', {
    users: [{ id: 1, name: 'Olive Owner', role: 'owner', av: 'O', color: '#000', dept: '', title: '' }],
  }));
  await fetch(`${base}/api/clients`, json('POST', { id: 'c0', name: 'Pinned', connectionId: '', color: '#000', channels: [] }));
  return { server, base };
}

const liveGoal = (id) => ({
  id, title: 'G', status: 'behind', progress: 0, owner: 1, channel: 0, period: 'Q3 2026',
  keyResults: [{ id: `${id}-kr`, title: 'KR', start: 0, target: 100, current: 0, progress: 0, status: 'behind',
    liveConfig: { connectionId: 'none', sql: 'SELECT 1', unit: 'n', direction: 'hi' } }],
});
const manualGoal = (id) => ({ id, title: 'G', status: 'behind', progress: 0, owner: 1, channel: 0, period: 'Q3 2026',
  keyResults: [{ id: `${id}-kr`, title: 'KR', start: 0, target: 100, current: 0, progress: 0, status: 'behind' }] });
const template = (id) => ({ id, title: 'T', category: 'Custom', period: 'Q3 2026', krTemplates: [] });

async function probe(base, tier) {
  const r = {};
  r.health = await (await fetch(`${base}/api/health`)).json();
  r.manualGoal = (await fetch(`${base}/api/goals`, json('POST', manualGoal(`m-${tier}`)))).status;
  r.liveGoal = (await fetch(`${base}/api/goals`, json('POST', liveGoal(`l-${tier}`)))).status;
  r.executeBatch = (await fetch(`${base}/api/kpi/execute-batch`, json('POST', { queries: [] }))).status;
  r.syncNow = (await fetch(`${base}/api/kpi/sync-now`, json('POST', {}))).status;
  r.kpiPoll = (await fetch(`${base}/api/kpi/poll`)).status;
  r.template = (await fetch(`${base}/api/goal-templates`, json('POST', template(`t-${tier}`)))).status;
  r.enrolToken = (await fetch(`${base}/api/agents/enrol-token`, json('POST', {}))).status;
  const shared = { ...manualGoal(`s-${tier}`) };
  shared.keyResults[0].sharedWithMediagenix = true;
  r.sharedGoal = (await fetch(`${base}/api/goals`, json('POST', shared))).status;
  return r;
}

describe('FF-8: entitlements by tier', () => {
  const instances = {};

  before(async () => {
    const [starter, pro, enterprise] = await Promise.all([
      startInstance(BASE_PORT, { BRIDGE_TIER: 'starter' }),
      startInstance(BASE_PORT + 1, { BRIDGE_TIER: 'pro', BRIDGE_CAP_CHANNELS: '2', BRIDGE_CAP_SEATS: '2', BRIDGE_CAP_AGENTS: '1', BRIDGE_OPERATOR_TOKEN: 'op' }),
      startInstance(BASE_PORT + 2, { BRIDGE_TIER: 'enterprise' }),
    ]);
    Object.assign(instances, { starter, pro, enterprise });
  });

  after(() => { for (const i of Object.values(instances)) i.server.kill(); });

  it('starter: manual OKRs only — every licensed feature is refused with the feature named', async () => {
    const r = await probe(instances.starter.base, 'starter');
    assert.equal(r.health.tier, 'starter');
    assert.equal(r.manualGoal, 201);
    assert.equal(r.liveGoal, 403);
    assert.equal(r.executeBatch, 403);
    assert.equal(r.syncNow, 403);
    assert.equal(r.kpiPoll, 403);
    assert.equal(r.template, 403);
    assert.equal(r.enrolToken, 403);
    assert.equal(r.sharedGoal, 403);
    const body = await (await fetch(`${instances.starter.base}/api/kpi/execute-batch`, json('POST', { queries: [] }))).json();
    assert.deepEqual([body.error, body.feature, body.tier], ['entitlement', 'liveKRs', 'starter']);
    assert.match(body.detail, /starter licence/);
  });

  it('pro: live KRs, templates and agents pass; sharing is still refused', async () => {
    const r = await probe(instances.pro.base, 'pro');
    assert.equal(r.health.tier, 'pro');
    assert.deepEqual(r.health.entitlements, { liveKRs: true, agents: true, templates: true, sharing: false });
    assert.deepEqual(r.health.caps, { channels: 2, seats: 2, agents: 1 });
    assert.equal(r.liveGoal, 201);
    // "Passes" = not refused by the licence; execute-batch answers 400 to an empty list regardless
    assert.notEqual(r.executeBatch, 403);
    assert.equal(r.syncNow, 200);
    assert.equal(r.kpiPoll, 200);
    assert.equal(r.template, 201);
    assert.equal(r.enrolToken, 201);
    assert.equal(r.sharedGoal, 403);
  });

  it('enterprise: everything passes', async () => {
    const r = await probe(instances.enterprise.base, 'enterprise');
    assert.equal(r.health.tier, 'enterprise');
    for (const k of ['manualGoal', 'liveGoal', 'sharedGoal', 'template']) assert.equal(r[k], 201, k);
    for (const k of ['executeBatch', 'syncNow', 'kpiPoll']) assert.notEqual(r[k], 403, k);
    assert.equal(r.enrolToken, 201);
  });

  it('caps refuse past the licence: channels, seats (viewers free), agents', async () => {
    const base = instances.pro.base;
    const client = { id: 'c0', name: 'Pinned', connectionId: '', color: '#000' };
    assert.equal((await fetch(`${base}/api/clients/c0`, json('PUT', { ...client, channels: [{ id: '1', name: 'A' }, { id: '2', name: 'B' }] }))).status, 200);
    const over = await fetch(`${base}/api/clients/c0`, json('PUT', { ...client, channels: [{ id: '1', name: 'A' }, { id: '2', name: 'B' }, { id: '3', name: 'C' }] }));
    assert.equal(over.status, 403);
    assert.deepEqual(await over.json().then((b) => [b.error, b.dimension, b.cap, b.requested]), ['entitlement_cap', 'channels', 2, 3]);

    const user = (id, role) => ({ id, name: `U${id}`, role, av: 'U', color: '#000', dept: '', title: '' });
    assert.equal((await fetch(`${base}/api/users`, json('POST', user(2, 'manager')))).status, 201, 'second editor fills the cap');
    assert.equal((await fetch(`${base}/api/users`, json('POST', user(3, 'member')))).status, 201, 'viewers are free');
    const third = await fetch(`${base}/api/users`, json('POST', user(4, 'manager')));
    assert.equal(third.status, 403);
    assert.equal((await third.json()).dimension, 'seats');
    const promote = await fetch(`${base}/api/users/3`, json('PUT', { ...user(3, 'manager') }));
    assert.equal(promote.status, 403, 'promoting a viewer past the cap is refused too');

    // One agent licensed: the token minted in the probe is unused, so enrol with a fresh one
    const minted = await (await fetch(`${base}/api/agents/enrol-token`, json('POST', {}))).json();
    const enrolled = await fetch(`${base}/api/agent/enroll`, json('POST', { token: minted.token, name: 'site' }));
    assert.equal(enrolled.status, 201);
    const second = await fetch(`${base}/api/agents/enrol-token`, json('POST', {}));
    assert.equal(second.status, 403);
    assert.equal((await second.json()).dimension, 'agents');
  });

  it('reports usage for the owner and over the operator channel', async () => {
    const base = instances.pro.base;
    const usage = await (await fetch(`${base}/api/usage`)).json();
    assert.equal(usage.tier, 'pro');
    assert.deepEqual(usage.caps, { channels: 2, seats: 2, agents: 1 });
    assert.deepEqual(usage.seats, { total: 3, editors: 2, viewers: 1 });
    assert.equal(usage.channels, 2);
    assert.deepEqual(usage.agents, { active: 1, revoked: 0 });
    assert.equal(usage.liveKRs, 1);
    assert.equal(usage.sharedKRs, 0);
    assert.deepEqual(usage.goals, { active: 2, archived: 0 });
    const viaOperator = await fetch(`${base}/api/usage`, { headers: { 'X-Operator-Token': 'op' } });
    assert.equal(viaOperator.status, 200);
  });
});

describe('desktop default gates nothing', () => {
  let server;
  const port = BASE_PORT + 3;
  const base = `http://127.0.0.1:${port}`;
  before(async () => {
    const env = { ...process.env, BRIDGE_DB_PATH: ':memory:', BRIDGE_PORT: String(port), BRIDGE_HOST: '127.0.0.1', BRIDGE_API_KEY: '', BRIDGE_TIER: 'starter', BRIDGE_CAP_SEATS: '1' };
    delete env.BRIDGE_MODE;
    server = spawn(process.execPath, [SERVER], { env, stdio: 'ignore' });
    const deadline = Date.now() + 15000;
    for (;;) {
      try { if ((await fetch(`${base}/api/health`)).ok) return; } catch { /* not up */ }
      if (Date.now() > deadline) throw new Error('desktop did not start');
      await new Promise((r) => setTimeout(r, 200));
    }
  });
  after(() => server?.kill());

  it('ignores BRIDGE_TIER and caps outside client mode', async () => {
    const health = await (await fetch(`${base}/api/health`)).json();
    assert.equal(health.tier, 'enterprise');
    assert.deepEqual(health.caps, { channels: null, seats: null, agents: null });
    assert.notEqual((await fetch(`${base}/api/kpi/execute-batch`, json('POST', { queries: [] }))).status, 403);
    assert.equal((await fetch(`${base}/api/goal-templates`, json('POST', template('t-desktop')))).status, 201);
  });
});
