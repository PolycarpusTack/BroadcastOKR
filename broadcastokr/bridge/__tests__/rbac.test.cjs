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
        // This suite asserts the no-key refusal path; state it rather than
        // inheriting whatever the developer happens to have configured.
        BRIDGE_ENCRYPTION_KEY: '',
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
      // Raw-SQL surfaces: SQL arrives in the body, so these are credential-grade
      ['POST', '/api/kpi/execute-batch', { queries: [{ goalId: 'g1', krIndex: 0, connectionId: 'x', sql: 'SELECT 1' }] }],
      ['POST', '/api/channels', { connectionId: 'x' }],
      ['POST', '/api/kpi/execute', { kpiId: 'x' }],
      // Operational trigger against client databases — manager grade
      ['POST', '/api/kpi/sync-now', {}],
      ['POST', '/api/sync/migrate-from-local', { users: [] }],
      ['POST', '/api/users', { name: 'Ghost', role: 'owner', av: 'G', color: '#000', dept: '', title: '' }],
    ]) {
      const res = await fetch(`${BASE}${url}`, json(method, body, member));
      assert.equal(res.status, 403, `${method} ${url} must be refused for members`);
    }
    assert.equal((await fetch(`${BASE}/api/sync/backup`, { headers: { Cookie: member } })).status, 403);
  });

  it('path shape cannot route around the policy (case, trailing slash)', async () => {
    // Review 2026-09-02 F1: with default Express routing, `/API/…` skipped the
    // session check entirely and `…/` skipped every $-anchored rule. Both must
    // now be refused — by the router (404) or the policy (401/403) — and never
    // reach a handler.
    const batch = { queries: [{ goalId: 'g1', krIndex: 0, connectionId: 'x', sql: 'SELECT 1' }] };
    for (const [who, cookie] of [['no session', null], ['member', member]]) {
      for (const [method, url, body] of [
        ['POST', '/API/KPI/EXECUTE-BATCH', batch],
        ['POST', '/api/kpi/execute-batch/', batch],
        ['POST', '/API/KPI/EXECUTE-BATCH/', batch],
        ['POST', '/api/preview-query/', { connectionId: 'x', sql: 'SELECT 1' }],
        ['GET', '/API/SYNC/BACKUP', undefined],
        ['GET', '/api/sync/backup/', undefined],
        ['GET', '/API/CONNECTIONS', undefined],
        ['DELETE', '/API/GOALS/g1', undefined],
      ]) {
        const res = await fetch(`${BASE}${url}`, json(method, body, cookie));
        assert.ok([401, 403, 404].includes(res.status),
          `${who}: ${method} ${url} returned ${res.status} — must never reach a handler`);
      }
    }
    // …and the goal the DELETE variant aimed at is still there.
    assert.equal((await fetch(`${BASE}/api/goals/g1`, { headers: { Cookie: owner } })).status, 200);
  });

  it('managers sync stored live KRs through execute-batch but cannot supply SQL of their own', async () => {
    // Review 2026-09-02 F5: every Goals-page sync path uses execute-batch with
    // the KR's stored SQL. ownerOnly broke managers; the fix verifies the query
    // against the stored liveConfig instead.
    const manager = await signIn({ sub: 'mg-1', name: 'Manager One', email: 'mg@x' });
    const users = await (await fetch(`${BASE}/api/users`, { headers: { Cookie: owner } })).json();
    const mgr = users.find((u) => u.name === 'Manager One');
    assert.equal((await fetch(`${BASE}/api/users/${mgr.id}`, json('PUT', { ...mgr, role: 'manager' }, owner))).status, 200);

    const liveConfig = { connectionId: 'no-such-connection', sql: 'SELECT 42 AS v', unit: 'count', direction: 'hi' };
    assert.equal((await fetch(`${BASE}/api/goals`, json('POST', {
      id: 'g-live', title: 'Live', status: 'behind', progress: 0, owner: mgr.id, channel: 0, period: 'Q3',
      keyResults: [{ id: 'kr-live', title: 'KR', start: 0, target: 100, current: 0, progress: 0, status: 'behind', liveConfig }],
    }, owner))).status, 201);

    const stored = { goalId: 'g-live', krIndex: 0, krId: 'kr-live', connectionId: liveConfig.connectionId, sql: liveConfig.sql };
    const adHoc = { ...stored, sql: 'SELECT * FROM psi.psitransmission' };

    const res = await fetch(`${BASE}/api/kpi/execute-batch`, json('POST', { queries: [stored, adHoc] }, manager));
    assert.equal(res.status, 200);
    const { results } = await res.json();
    // The stored query ran (it fails at the connection, not at the gate)…
    assert.equal(results[0].error, 'Connection not found');
    // …and the ad hoc one was refused before it could reach a database.
    assert.match(results[1].error, /Not a stored query/);

    // Owners keep ad hoc execution; members are still refused at the door.
    const ownerRes = await (await fetch(`${BASE}/api/kpi/execute-batch`, json('POST', { queries: [adHoc] }, owner))).json();
    assert.equal(ownerRes.results[0].error, 'Connection not found');
    assert.equal((await fetch(`${BASE}/api/kpi/execute-batch`, json('POST', { queries: [stored] }, member))).status, 403);
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

    // A manager may create users, but never mint an owner
    assert.equal((await fetch(`${BASE}/api/users`, json('POST', { name: 'Sneaky Owner', role: 'owner', av: 'S', color: '#000', dept: '', title: '' }, member))).status, 403);
    assert.equal((await fetch(`${BASE}/api/users`, json('POST', { name: 'New Member', role: 'member', av: 'N', color: '#000', dept: '', title: '' }, member))).status, 201);

    // Managers may trigger a sync pass (stored SQL only) but never supply SQL
    // themselves: the route is manager-grade, the ad hoc query is refused per result
    assert.notEqual((await fetch(`${BASE}/api/kpi/sync-now`, json('POST', {}, member))).status, 403);
    const adHoc = await fetch(`${BASE}/api/kpi/execute-batch`,
      json('POST', { queries: [{ goalId: 'g1', krIndex: 0, krId: 'kr1', connectionId: 'x', sql: 'SELECT 1' }] }, member));
    assert.equal(adHoc.status, 200);
    assert.match((await adHoc.json()).results[0].error, /Not a stored query/);
  });

  it('server-side audit recorded the sensitive actions with session actors', async () => {
    const log = await (await fetch(`${BASE}/api/activity?limit=100`, { headers: { Cookie: owner } })).json();
    const texts = log.map((e) => `${e.actor}: ${e.text}`);
    assert.ok(texts.some((t) => t.includes('Signed in via SSO')), 'sign-ins must be audited');
    assert.ok(texts.some((t) => t.includes('Changed role of Member One: member → manager')), 'role changes must be audited');
    const roleEntry = log.find((e) => e.text.includes('Changed role'));
    assert.equal(roleEntry.actor, 'Owner One', 'actor must come from the session, not a body claim');
  });

  it('refuses to store a credential it cannot protect (cloud, no encryption key)', async () => {
    // This instance runs with BRIDGE_API_KEY='' and no BRIDGE_ENCRYPTION_KEY,
    // so even an owner must not be able to park a plaintext password on disk.
    const res = await fetch(`${BASE}/api/connections`, json('POST', {
      id: 'c-secret', name: 'Prod', type: 'postgres', host: 'db', port: 5432,
      service: 'whatson', user: 'psi', password: 'hunter2',
    }, owner));
    assert.equal(res.status, 503);
    assert.match((await res.json()).error, /BRIDGE_ENCRYPTION_KEY/);

    // A masked password carries no new secret, so metadata edits still work.
    const masked = await fetch(`${BASE}/api/connections`, json('POST', {
      id: 'c-secret', name: 'Renamed', type: 'postgres', host: 'db', port: 5432,
      service: 'whatson', user: 'psi', password: '***',
    }, owner));
    assert.equal(masked.status, 200);

    // POST /api/config is the other write path to the same store (F7): the
    // same refusal applies, and masked passwords still pass.
    const viaConfig = await fetch(`${BASE}/api/config`, json('POST', {
      connections: [{ id: 'c-secret2', name: 'Bulk', type: 'postgres', host: 'db', port: 5432, service: 'w', user: 'u', password: 'hunter2' }],
    }, owner));
    assert.equal(viaConfig.status, 503);
    const viaConfigMasked = await fetch(`${BASE}/api/config`, json('POST', {
      connections: [{ id: 'c-secret', name: 'Bulk', type: 'postgres', host: 'db', port: 5432, service: 'w', user: 'u', password: '***' }],
    }, owner));
    assert.equal(viaConfigMasked.status, 200);
  });

  it('owners can do all of it', async () => {
    assert.equal((await fetch(`${BASE}/api/goals/g1`, json('DELETE', undefined, owner))).status, 200);
    const client = await fetch(`${BASE}/api/clients`, json('POST', { id: 'c1', name: 'Pinned', connectionId: '', color: '#000', channels: [] }, owner));
    assert.equal(client.status, 201);
  });
});
