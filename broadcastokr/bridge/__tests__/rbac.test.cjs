const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { startMockIdp } = require('./helpers/mockIdp.cjs');

// UI-bypass battery: roles are enforced at the API, not in the sidebar.
// Every check here talks straight to routes with a session cookie.

const SERVER = path.join(__dirname, '..', 'server.cjs');
const PORT = 5000 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${PORT}`;
const CLIENT_ID = 'brokr-rbac-test';

const json = (method, body, cookie) => ({
  method,
  headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
  body: body === undefined ? undefined : JSON.stringify(body),
});

function cookieOf(res, name) {
  const hit = (res.headers.getSetCookie?.() || []).find((c) => c.startsWith(`${name}=`));
  return hit ? hit.split(';')[0] : null;
}

describe('server-enforced RBAC (client mode)', () => {
  let server;
  let idp;
  let owner;
  let member;
  let memberUserId;

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
    idp = await startMockIdp({ clientId: CLIENT_ID });
    server = spawn(process.execPath, [SERVER], {
      env: {
        ...process.env,
        BRIDGE_MODE: 'client',
        BRIDGE_OIDC_ISSUER: idp.issuer,
        BRIDGE_OIDC_CLIENT_ID: CLIENT_ID,
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

    owner = await signIn({ sub: 'o-1', name: 'Owner One', email: 'o@x' });
    member = await signIn({ sub: 'm-1', name: 'Member One', email: 'm@x' });
    const users = await (await fetch(`${BASE}/api/users`, { headers: { Cookie: owner } })).json();
    memberUserId = users.find((u) => u.name === 'Member One').id;
    const ownerUserId = users.find((u) => u.name === 'Owner One').id;

    // Seed a goal and a task as owner for the mutation tests
    await fetch(`${BASE}/api/goals`, json('POST', {
      id: 'g1', title: 'Goal', status: 'behind', progress: 0, owner: ownerUserId, channel: 0, period: 'Q1',
      keyResults: [{ id: 'kr1', title: 'KR', start: 0, target: 100, current: 0, progress: 0, status: 'behind' }],
    }, owner));
    await fetch(`${BASE}/api/tasks`, json('POST', {
      id: 't1', title: 'Task', status: 'todo', priority: 'medium', assignee: ownerUserId,
      channel: 0, due: '2026-09-01', taskType: 'task', subtasks: [],
    }, owner));
  });

  after(() => {
    if (server) server.kill();
    idp?.close();
  });

  it('members can read, check in, and move tasks — but not create or delete', async () => {
    assert.equal((await fetch(`${BASE}/api/goals`, { headers: { Cookie: member } })).status, 200);

    const checkin = await fetch(`${BASE}/api/goals/g1/check-in`,
      json('POST', { krId: 'kr1', value: 50, actor: 'ignored' }, member));
    assert.equal(checkin.status, 200);

    const tasks = await (await fetch(`${BASE}/api/tasks`, { headers: { Cookie: member } })).json();
    const move = await fetch(`${BASE}/api/tasks/t1`,
      json('PUT', { ...tasks[0], status: 'in_progress' }, member));
    assert.equal(move.status, 200);

    assert.equal((await fetch(`${BASE}/api/goals`, json('POST', { id: 'gx', title: 'Nope', status: 'behind', progress: 0, owner: 1, channel: 0, period: 'Q1', keyResults: [] }, member))).status, 403);
    assert.equal((await fetch(`${BASE}/api/goals/g1`, json('DELETE', undefined, member))).status, 403);
    assert.equal((await fetch(`${BASE}/api/tasks/t1`, json('DELETE', undefined, member))).status, 403);
  });

  it('members cannot touch credentials, config, raw SQL, or people', async () => {
    for (const [method, url, body] of [
      ['POST', '/api/connections', { name: 'sneaky' }],
      ['POST', '/api/config', { pollIntervalMs: 1 }],
      ['POST', '/api/preview-query', { connectionId: 'x', sql: 'SELECT 1' }],
      ['POST', '/api/tables', { connectionId: 'x' }],
      ['POST', '/api/sync/migrate-from-local', { users: [] }],
      ['POST', '/api/users', { name: 'Ghost', role: 'owner', av: 'G', color: '#000', dept: '', title: '' }],
    ]) {
      const res = await fetch(`${BASE}${url}`, json(method, body, member));
      assert.equal(res.status, 403, `${method} ${url} must be refused for members`);
    }
    assert.equal((await fetch(`${BASE}/api/sync/backup`, { headers: { Cookie: member } })).status, 403);
  });

  it('role escalation is owner-only, even for self', async () => {
    const users = await (await fetch(`${BASE}/api/users`, { headers: { Cookie: owner } })).json();
    const me = users.find((u) => u.id === memberUserId);

    const selfPromote = await fetch(`${BASE}/api/users/${memberUserId}`,
      json('PUT', { ...me, role: 'owner' }, member));
    assert.equal(selfPromote.status, 403);

    const ownerPromotes = await fetch(`${BASE}/api/users/${memberUserId}`,
      json('PUT', { ...me, role: 'manager' }, owner));
    assert.equal(ownerPromotes.status, 200);
  });

  it('managers create and edit but cannot delete or manage clients', async () => {
    // The member was just promoted to manager — re-sign-in not needed (role read per request)
    const create = await fetch(`${BASE}/api/goals`, json('POST', {
      id: 'g2', title: 'Manager goal', status: 'behind', progress: 0, owner: memberUserId, channel: 0, period: 'Q1', keyResults: [],
    }, member));
    assert.equal(create.status, 201);

    assert.equal((await fetch(`${BASE}/api/goals/g2`, json('DELETE', undefined, member))).status, 403);
    assert.equal((await fetch(`${BASE}/api/clients`, json('POST', { id: 'c9', name: 'X', connectionId: '', color: '#000', channels: [] }, member))).status, 403);
  });

  it('owners can do all of it', async () => {
    assert.equal((await fetch(`${BASE}/api/goals/g1`, json('DELETE', undefined, owner))).status, 200);
    const client = await fetch(`${BASE}/api/clients`, json('POST', { id: 'c1', name: 'Pinned', connectionId: '', color: '#000', channels: [] }, owner));
    assert.equal(client.status, 201);
  });
});
