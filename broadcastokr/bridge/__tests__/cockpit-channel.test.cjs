const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { startMockIdp } = require('./helpers/mockIdp.cjs');

// End-to-end shared-metrics channel: a client instance pushes only its
// opted-in KR values into a cockpit instance; the cockpit validates strictly.

const SERVER = path.join(__dirname, '..', 'server.cjs');
const COCKPIT_PORT = 5300 + Math.floor(Math.random() * 40);
const CLIENT_PORT = COCKPIT_PORT + 41;
const COCKPIT = `http://127.0.0.1:${COCKPIT_PORT}`;
const CLIENT = `http://127.0.0.1:${CLIENT_PORT}`;

const json = (method, body, extra = {}) => ({
  method, headers: { 'Content-Type': 'application/json', ...extra },
  body: body === undefined ? undefined : JSON.stringify(body),
});
const cookieOf = (res, name) => {
  const hit = (res.headers.getSetCookie?.() || []).find((c) => c.startsWith(`${name}=`));
  return hit ? hit.split(';')[0] : null;
};

async function waitUp(base) {
  const deadline = Date.now() + 10000;
  for (;;) {
    try { if ((await fetch(`${base}/api/health`)).ok) return; } catch { /* not up */ }
    if (Date.now() > deadline) throw new Error(`server at ${base} did not start`);
    await new Promise((r) => setTimeout(r, 200));
  }
}

describe('shared-metrics channel end-to-end', () => {
  let cockpit;
  let clientInstance;
  let idp;
  let owner;
  let shareToken;

  before(async () => {
    // Cockpit with real auth
    idp = await startMockIdp({ clientId: 'brokr-cockpit-ch' });
    cockpit = spawn(process.execPath, [SERVER], {
      env: {
        ...process.env,
        BRIDGE_MODE: 'cockpit',
        BRIDGE_OIDC_ISSUER: idp.issuer, BRIDGE_OIDC_CLIENT_ID: 'brokr-cockpit-ch',
        BRIDGE_OIDC_CLIENT_SECRET: 's', BRIDGE_BASE_URL: COCKPIT,
        BRIDGE_DB_PATH: ':memory:', BRIDGE_PORT: String(COCKPIT_PORT),
        BRIDGE_HOST: '127.0.0.1', BRIDGE_API_KEY: '',
      },
      stdio: 'ignore',
    });
    await waitUp(COCKPIT);

    const login = await fetch(`${COCKPIT}/api/auth/login`, { redirect: 'manual' });
    const state = new URL(login.headers.get('location')).searchParams.get('state');
    const cb = await fetch(`${COCKPIT}/api/auth/callback?code=${idp.issueCode({ sub: 'o', name: 'Ops Olga', email: 'o@mg' })}&state=${state}`, {
      redirect: 'manual', headers: { Cookie: cookieOf(login, 'brokr_auth_flow') },
    });
    owner = cookieOf(cb, 'brokr_session');

    // Register the tenant and mint its write-only token
    await fetch(`${COCKPIT}/api/clients`, json('POST', { id: 'aetn', name: 'A+E Networks', connectionId: '', color: '#F59E0B', channels: [] }, { Cookie: owner }));
    const minted = await (await fetch(`${COCKPIT}/api/cockpit/tenants`, json('POST', { clientId: 'aetn' }, { Cookie: owner }))).json();
    shareToken = minted.token;
    assert.ok(shareToken);

    // Client instance with a fast push loop
    clientInstance = spawn(process.execPath, [SERVER], {
      env: {
        ...process.env,
        BRIDGE_MODE: 'client', BRIDGE_INSECURE_NO_AUTH: '1',
        BRIDGE_COCKPIT_URL: COCKPIT, BRIDGE_SHARE_TOKEN: shareToken,
        BRIDGE_SHARE_INTERVAL_MS: '400',
        BRIDGE_DB_PATH: ':memory:', BRIDGE_PORT: String(CLIENT_PORT),
        BRIDGE_HOST: '127.0.0.1', BRIDGE_API_KEY: '',
      },
      stdio: 'ignore',
    });
    await waitUp(CLIENT);

    // Seed one shared and one private KR on the client instance
    await fetch(`${CLIENT}/api/sync/migrate-from-local`, json('POST', {
      users: [{ id: 1, name: 'Alice', role: 'owner', av: 'A', color: '#000', dept: 'E', title: 'D' }],
      goals: [{
        id: 'g1', title: 'PRIVATE-goal', status: 'behind', progress: 0, owner: 1, channel: 0, period: 'Q1',
        keyResults: [
          { id: 'kr-shared', title: 'PRIVATE-title-shared', start: 100, target: 5, current: 12, progress: 0.9, status: 'on_track' },
          { id: 'kr-private', title: 'PRIVATE-title-private', start: 0, target: 100, current: 40, progress: 0.4, status: 'at_risk' },
        ],
      }],
    }));
    const goal = await (await fetch(`${CLIENT}/api/goals/g1`)).json();
    goal.keyResults.find((k) => k.id === 'kr-shared').sharedWithMediagenix = true;
    await fetch(`${CLIENT}/api/goals/g1`, json('PUT', goal));
  });

  after(() => {
    cockpit?.kill();
    clientInstance?.kill();
    idp?.close();
  });

  it('only opted-in values arrive at the cockpit, under the tenant row', async () => {
    let fleet = [];
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      fleet = await (await fetch(`${COCKPIT}/api/cockpit/metrics`, { headers: { Cookie: owner } })).json();
      if (fleet.length > 0) break;
      await new Promise((r) => setTimeout(r, 300));
    }

    assert.equal(fleet.length, 1, 'one tenant should have reported');
    assert.equal(fleet[0].tenantName, 'A+E Networks');
    const krIds = fleet[0].metrics.map((m) => m.krId);
    assert.deepEqual(krIds, ['kr-shared']);
    assert.equal(fleet[0].metrics[0].value, 12);
    assert.equal(fleet[0].metrics[0].direction, 'lo');
    assert.ok(!JSON.stringify(fleet).includes('PRIVATE'), 'no private content may reach the cockpit');
  });

  it('rejects wrong tokens and out-of-contract payloads', async () => {
    const wrongToken = await fetch(`${COCKPIT}/api/cockpit/ingest`,
      json('POST', { protocol: 1, metrics: [] }, { 'X-Share-Token': 'nope' }));
    assert.equal(wrongToken.status, 401);

    const extraField = await fetch(`${COCKPIT}/api/cockpit/ingest`,
      json('POST', { protocol: 1, metrics: [{ krId: 'x', value: 1, target: 2, direction: 'hi', timestamp: 't', note: 'smuggled' }] }, { 'X-Share-Token': shareToken }));
    assert.equal(extraField.status, 400);

    const stringValue = await fetch(`${COCKPIT}/api/cockpit/ingest`,
      json('POST', { protocol: 1, metrics: [{ krId: 'x', value: 'row-data', target: 2, direction: 'hi', timestamp: 't' }] }, { 'X-Share-Token': shareToken }));
    assert.equal(stringValue.status, 400);
  });
});
