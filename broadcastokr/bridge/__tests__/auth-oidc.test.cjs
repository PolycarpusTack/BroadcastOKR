const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { startMockIdp } = require('./helpers/mockIdp.cjs');

const SERVER = path.join(__dirname, '..', 'server.cjs');
const PORT = 4900 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${PORT}`;
const CLIENT_ID = 'brokr-test';

function cookieOf(res, name) {
  const set = res.headers.getSetCookie?.() || [];
  const hit = set.find((c) => c.startsWith(`${name}=`));
  return hit ? hit.split(';')[0] : null;
}

describe('OIDC sign-in (client mode)', () => {
  let server;
  let idp;
  let sessionCookie;

  before(async () => {
    idp = await startMockIdp({ clientId: CLIENT_ID });

    server = spawn(process.execPath, [SERVER], {
      env: {
        ...process.env,
        BRIDGE_MODE: 'client',
        BRIDGE_OIDC_ISSUER: idp.issuer,
        BRIDGE_OIDC_CLIENT_ID: CLIENT_ID,
        BRIDGE_OIDC_CLIENT_SECRET: 'test-secret',
        BRIDGE_BASE_URL: BASE,
        BRIDGE_DB_PATH: ':memory:', BRIDGE_PORT: String(PORT),
        BRIDGE_HOST: '127.0.0.1', BRIDGE_API_KEY: '',
      },
      stdio: 'ignore',
    });
    const deadline = Date.now() + 10000;
    for (;;) {
      try { if ((await fetch(`${BASE}/api/health`)).ok) return; } catch { /* not up */ }
      if (Date.now() > deadline) throw new Error('bridge did not start');
      await new Promise((r) => setTimeout(r, 200));
    }
  });

  after(() => {
    if (server) server.kill();
    idp?.close();
  });

  async function signIn(claims) {
    const login = await fetch(`${BASE}/api/auth/login`, { redirect: 'manual' });
    assert.equal(login.status, 302);
    const authUrl = new URL(login.headers.get('location'));
    assert.ok(authUrl.href.startsWith(idp.issuer), 'login must redirect to the IdP');
    const state = authUrl.searchParams.get('state');
    const flowCookie = cookieOf(login, 'brokr_auth_flow');
    assert.ok(flowCookie, 'PKCE flow cookie must be set');

    const code = idp.issueCode(claims);
    const callback = await fetch(`${BASE}/api/auth/callback?code=${code}&state=${state}`, {
      redirect: 'manual',
      headers: { Cookie: flowCookie },
    });
    assert.equal(callback.status, 302, 'callback must redirect into the app');
    const session = cookieOf(callback, 'brokr_session');
    assert.ok(session, 'session cookie must be set');
    return session;
  }

  it('unauthenticated API calls are refused; health stays open but trimmed', async () => {
    assert.equal((await fetch(`${BASE}/api/tasks`)).status, 401);
    const health = await (await fetch(`${BASE}/api/health`)).json();
    assert.equal(health.status, 'ok');
    assert.equal(health.database, undefined, 'operational stats must be hidden from anonymous callers');
    assert.equal(health.uptime, undefined);
  });

  it('completes the code+PKCE flow; the first user becomes owner', async () => {
    sessionCookie = await signIn({ sub: 'user-1', name: 'Owning Olive', email: 'olive@vrt.be' });

    const me = await fetch(`${BASE}/api/auth/me`, { headers: { Cookie: sessionCookie } });
    assert.equal(me.status, 200);
    const body = await me.json();
    assert.equal(body.user.name, 'Owning Olive');
    assert.equal(body.role, 'owner');
    assert.equal(body.permissions.canDelete, true);
    assert.equal(body.mode, 'client');

    const tasks = await fetch(`${BASE}/api/tasks`, { headers: { Cookie: sessionCookie } });
    assert.equal(tasks.status, 200);
  });

  it('subsequent users join as members', async () => {
    const second = await signIn({ sub: 'user-2', name: 'Member Max', email: 'max@vrt.be' });
    const me = await (await fetch(`${BASE}/api/auth/me`, { headers: { Cookie: second } })).json();
    assert.equal(me.role, 'member');
    assert.equal(me.permissions.canCreate, false);
  });

  it('returning users keep their identity (no duplicate rows)', async () => {
    const again = await signIn({ sub: 'user-1', name: 'Owning Olive', email: 'olive@vrt.be' });
    const me = await (await fetch(`${BASE}/api/auth/me`, { headers: { Cookie: again } })).json();
    assert.equal(me.role, 'owner');
  });

  it('logout invalidates the session server-side', async () => {
    await fetch(`${BASE}/api/auth/logout`, { method: 'POST', headers: { Cookie: sessionCookie } });
    const me = await fetch(`${BASE}/api/auth/me`, { headers: { Cookie: sessionCookie } });
    assert.equal(me.status, 401);
  });
});

describe('cloud modes fail closed without identity', () => {
  it('refuses to start with no OIDC config and no explicit escape', async () => {
    const env = { ...process.env, BRIDGE_MODE: 'client', BRIDGE_DB_PATH: ':memory:', BRIDGE_PORT: '4999', BRIDGE_HOST: '127.0.0.1' };
    delete env.BRIDGE_INSECURE_NO_AUTH;
    delete env.BRIDGE_OIDC_ISSUER;
    const proc = spawn(process.execPath, [SERVER], { env, stdio: 'ignore' });
    const code = await new Promise((resolve) => proc.on('exit', resolve));
    assert.equal(code, 1);
  });
});
