const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { startMockIdp } = require('./helpers/mockIdp.cjs');

// Cockpit = fleet surfaces behind cloud auth: multi-client allowed, RBAC on.

const SERVER = path.join(__dirname, '..', 'server.cjs');
const PORT = 5200 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${PORT}`;

const json = (method, body, cookie) => ({
  method,
  headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
  body: body === undefined ? undefined : JSON.stringify(body),
});
const cookieOf = (res, name) => {
  const hit = (res.headers.getSetCookie?.() || []).find((c) => c.startsWith(`${name}=`));
  return hit ? hit.split(';')[0] : null;
};

describe('cockpit mode', () => {
  let server;
  let idp;
  let owner;
  let member;

  async function signIn(claims) {
    const login = await fetch(`${BASE}/api/auth/login`, { redirect: 'manual' });
    const state = new URL(login.headers.get('location')).searchParams.get('state');
    const flow = cookieOf(login, 'brokr_auth_flow');
    const code = idp.issueCode(claims);
    const cb = await fetch(`${BASE}/api/auth/callback?code=${code}&state=${state}`, {
      redirect: 'manual', headers: { Cookie: flow },
    });
    return cookieOf(cb, 'brokr_session');
  }

  before(async () => {
    idp = await startMockIdp({ clientId: 'brokr-cockpit' });
    server = spawn(process.execPath, [SERVER], {
      env: {
        ...process.env,
        BRIDGE_MODE: 'cockpit',
        BRIDGE_OIDC_ISSUER: idp.issuer,
        BRIDGE_OIDC_CLIENT_ID: 'brokr-cockpit',
        BRIDGE_OIDC_CLIENT_SECRET: 'secret',
        BRIDGE_BASE_URL: BASE,
        BRIDGE_DB_PATH: ':memory:', BRIDGE_PORT: String(PORT),
        BRIDGE_HOST: '127.0.0.1', BRIDGE_API_KEY: '',
      },
      stdio: 'ignore',
    });
    const deadline = Date.now() + 10000;
    for (;;) {
      try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch { /* not up */ }
      if (Date.now() > deadline) throw new Error('bridge did not start');
      await new Promise((r) => setTimeout(r, 200));
    }
    owner = await signIn({ sub: 'o-1', name: 'Fleet Owner', email: 'f@x' });
    member = await signIn({ sub: 'm-1', name: 'Fleet Member', email: 'm@x' });
  });

  after(() => { if (server) server.kill(); idp?.close(); });

  it('reports cockpit mode on health and /me', async () => {
    const health = await (await fetch(`${BASE}/api/health`, { headers: { Cookie: owner } })).json();
    assert.equal(health.mode, 'cockpit');
    const me = await (await fetch(`${BASE}/api/auth/me`, { headers: { Cookie: owner } })).json();
    assert.equal(me.mode, 'cockpit');
  });

  it('fleet operations allowed: multiple client rows, owner-gated', async () => {
    for (const id of ['aetn', 'vrt', 'disney']) {
      const res = await fetch(`${BASE}/api/clients`,
        json('POST', { id, name: id.toUpperCase(), connectionId: '', color: '#000', channels: [] }, owner));
      assert.equal(res.status, 201);
    }
    const clients = await (await fetch(`${BASE}/api/clients`, { headers: { Cookie: owner } })).json();
    assert.equal(clients.length, 3);

    // RBAC still bites: members cannot manage tenants
    const denied = await fetch(`${BASE}/api/clients`,
      json('POST', { id: 'x', name: 'X', connectionId: '', color: '#000', channels: [] }, member));
    assert.equal(denied.status, 403);
  });

  it('fails closed without identity, like every cloud mode', async () => {
    const env = { ...process.env, BRIDGE_MODE: 'cockpit', BRIDGE_DB_PATH: ':memory:', BRIDGE_PORT: '5299', BRIDGE_HOST: '127.0.0.1' };
    delete env.BRIDGE_INSECURE_NO_AUTH;
    delete env.BRIDGE_OIDC_ISSUER;
    const proc = spawn(process.execPath, [SERVER], { env, stdio: 'ignore' });
    assert.equal(await new Promise((r) => proc.on('exit', r)), 1);
  });
});
