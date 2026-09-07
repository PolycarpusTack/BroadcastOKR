const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { startMockIdp } = require('./helpers/mockIdp.cjs');

// Review remediation 2026-09-07, Epic A: F1 (role change authorised against the
// decoded target) and F5 (member task writes restricted by field). Every case
// drives the real session → middleware → route → SQLite chain and reads the
// stored state back — a refused request must leave the rows exactly as found.

const SERVER = path.join(__dirname, '..', 'server.cjs');
const PORT = 5100 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${PORT}`;
const CLIENT_ID = 'brokr-remediation-a';

const json = (method, body, cookie) => ({
  method,
  headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
  body: body === undefined ? undefined : JSON.stringify(body),
});

function cookieOf(res, name) {
  const hit = (res.headers.getSetCookie?.() || []).find((c) => c.startsWith(`${name}=`));
  return hit ? hit.split(';')[0] : null;
}

/** `2` → `%32`: every character percent-encoded, which Express decodes back for the handler. */
const percentEncode = (s) => String(s).split('').map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join('');

describe('review remediation A: F1 role-change identity, F5 member task fields', () => {
  let server;
  let idp;
  let owner;
  let manager;
  let member;
  let users;
  let managerId;
  let memberId;

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

  const getUsers = async () => (await fetch(`${BASE}/api/users`, { headers: { Cookie: owner } })).json();
  const userById = async (id) => (await getUsers()).find((u) => u.id === id);
  const getTask = async (id, cookie = owner) => (await (await fetch(`${BASE}/api/tasks`, { headers: { Cookie: cookie } })).json()).find((t) => t.id === id);

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
        BRIDGE_HOST: '127.0.0.1', BRIDGE_API_KEY: '', BRIDGE_ENCRYPTION_KEY: '',
      },
      stdio: 'ignore',
    });
    const deadline = Date.now() + 10000;
    for (;;) {
      try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch { /* not up */ }
      if (Date.now() > deadline) throw new Error('bridge did not start');
      await new Promise((r) => setTimeout(r, 200));
    }

    // First SSO user is the owner; the next two arrive as members, one is promoted.
    owner = await signIn({ sub: 'own', name: 'Owner', email: 'o@x' });
    manager = await signIn({ sub: 'mgr', name: 'Manager', email: 'g@x' });
    member = await signIn({ sub: 'mem', name: 'Member', email: 'm@x' });
    users = await getUsers();
    managerId = users.find((u) => u.name === 'Manager').id;
    memberId = users.find((u) => u.name === 'Member').id;
    const promote = await fetch(`${BASE}/api/users/${managerId}`,
      json('PUT', { ...users.find((u) => u.id === managerId), role: 'manager' }, owner));
    assert.equal(promote.status, 200);

    await fetch(`${BASE}/api/tasks`, json('POST', {
      id: 't-a3', title: 'Prepare rundown', description: 'For Monday', status: 'todo', priority: 'medium',
      assignee: memberId, channel: 0, due: '2026-09-10', taskType: 'task',
      subtasks: [{ text: 'Collect clips', done: false }, { text: 'Check slots', done: false }],
    }, owner));
  });

  after(() => {
    if (server) server.kill();
    idp?.close();
  });

  // ── F1 ────────────────────────────────────────────────────────────────────

  it('F1: a manager cannot change a role through an encoded id — and the row is untouched', async () => {
    const target = await userById(memberId);
    for (const seg of [String(memberId), percentEncode(memberId)]) {
      const res = await fetch(`${BASE}/api/users/${seg}`, json('PUT', { ...target, role: 'owner' }, manager));
      assert.equal(res.status, 403, `PUT /api/users/${seg} must be refused for a manager`);
      assert.equal((await userById(memberId)).role, 'member', `role must not change via /${seg}`);
    }
    // Self-promotion through the encoded segment, same outcome
    const self = await userById(managerId);
    const res = await fetch(`${BASE}/api/users/${percentEncode(managerId)}`, json('PUT', { ...self, role: 'owner' }, manager));
    assert.equal(res.status, 403);
    assert.equal((await userById(managerId)).role, 'manager');
  });

  it('F1: invalid, double-encoded, non-numeric and unknown targets fail closed', async () => {
    const target = await userById(memberId);
    const cases = [
      [percentEncode(percentEncode(memberId)), 400], // %2532 → "%32" after one decode: not an id
      ['abc', 400],
      [`${memberId}.0`, 400],
      [`-${memberId}`, 400],
      ['999999', 404],
    ];
    for (const [seg, expected] of cases) {
      for (const cookie of [manager, owner]) {
        const res = await fetch(`${BASE}/api/users/${seg}`, json('PUT', { ...target, role: 'owner' }, cookie));
        assert.equal(res.status, expected, `PUT /api/users/${seg} → ${expected}`);
      }
    }
    assert.equal((await userById(memberId)).role, 'member');
    // Path-shape variants never reach the handler (strict router) — and never authorise
    for (const seg of [`${memberId}/`, `${percentEncode(memberId)}/`]) {
      const res = await fetch(`${BASE}/API/USERS/${seg}`, json('PUT', { ...target, role: 'owner' }, manager));
      assert.notEqual(res.status, 200);
    }
    const upper = await fetch(`${BASE}/API/USERS/${memberId}`, json('PUT', { ...target, role: 'owner' }, manager));
    assert.notEqual(upper.status, 200);
    assert.equal((await userById(memberId)).role, 'member');
  });

  it('F1: the owner still changes roles, the manager still edits a profile', async () => {
    const target = await userById(memberId);
    const rename = await fetch(`${BASE}/api/users/${percentEncode(memberId)}`,
      json('PUT', { ...target, title: 'Playout' }, manager));
    assert.equal(rename.status, 200);
    const after1 = await userById(memberId);
    assert.equal(after1.title, 'Playout');
    assert.equal(after1.role, 'member');

    const promote = await fetch(`${BASE}/api/users/${memberId}`, json('PUT', { ...after1, role: 'manager' }, owner));
    assert.equal(promote.status, 200);
    assert.equal((await userById(memberId)).role, 'manager');
    // Repeating the same allowed assignment converges (no second role change)
    const again = await fetch(`${BASE}/api/users/${memberId}`, json('PUT', { ...after1, role: 'manager' }, owner));
    assert.equal(again.status, 200);
    const back = await fetch(`${BASE}/api/users/${memberId}`, json('PUT', { ...after1, role: 'member' }, owner));
    assert.equal(back.status, 200);
    assert.equal((await userById(memberId)).role, 'member');
  });

  // ── F5 ────────────────────────────────────────────────────────────────────

  it('F5: a member moves a task and ticks a subtask with the full DTO', async () => {
    const t = await getTask('t-a3', member);
    const move = await fetch(`${BASE}/api/tasks/t-a3`, json('PUT', { ...t, status: 'in_progress' }, member));
    assert.equal(move.status, 200);
    const t2 = await getTask('t-a3');
    assert.equal(t2.status, 'in_progress');
    assert.equal(t2.version, t.version + 1);

    const tick = await fetch(`${BASE}/api/tasks/t-a3`, json('PUT', {
      ...t2, subtasks: [{ text: 'Collect clips', done: true }, { text: 'Check slots', done: false }],
    }, member));
    assert.equal(tick.status, 200);
    const t3 = await getTask('t-a3');
    assert.deepEqual(t3.subtasks.map((s) => s.done), [true, false]);
    assert.equal(t3.title, 'Prepare rundown');
  });

  it('F5: a restricted body keeps every omitted field', async () => {
    const before = await getTask('t-a3');
    const res = await fetch(`${BASE}/api/tasks/t-a3`, json('PUT', { status: 'review', version: before.version }, member));
    assert.equal(res.status, 200);
    const after1 = await getTask('t-a3');
    assert.equal(after1.status, 'review');
    assert.equal(after1.title, before.title);
    assert.equal(after1.description, before.description);
    assert.equal(after1.assignee, before.assignee);
    assert.equal(after1.priority, before.priority);
    assert.equal(after1.due, before.due);
    assert.deepEqual(after1.subtasks, before.subtasks);
    assert.equal(after1.version, before.version + 1);
  });

  it('F5: structural, assignment and subtask-list edits are refused with zero persistence', async () => {
    const before = await getTask('t-a3');
    const attempts = [
      ['title', { ...before, title: 'Renamed' }],
      ['description', { ...before, description: 'Changed' }],
      ['priority', { ...before, priority: 'high' }],
      ['assignee', { ...before, assignee: managerId }],
      ['due', { ...before, due: '2026-12-31' }],
      ['taskType', { ...before, taskType: 'incident' }],
      ['goalId', { ...before, goalId: 'g-x' }],
      ['subtasks', { ...before, subtasks: [{ text: 'Collect clips (edited)', done: true }, { text: 'Check slots', done: false }] }],
      ['subtasks', { ...before, subtasks: [...before.subtasks, { text: 'Extra', done: false }] }],
      ['subtasks', { ...before, subtasks: [before.subtasks[0]] }],
      ['subtasks', { ...before, subtasks: [before.subtasks[1], before.subtasks[0]] }],
      // Mixed: an allowed status move bundled with a forbidden rename
      ['title', { ...before, status: 'done', title: 'Renamed' }],
    ];
    for (const [field, body] of attempts) {
      const res = await fetch(`${BASE}/api/tasks/t-a3`, json('PUT', body, member));
      assert.equal(res.status, 403, `member changing ${field} must be refused`);
      assert.equal((await res.json()).field, field);
      const now = await getTask('t-a3');
      assert.deepEqual(now, before, `no partial write after refused ${field} change`);
    }
  });

  it('F5: malformed payloads, unknown tasks and stale versions keep their contracts', async () => {
    const before = await getTask('t-a3');
    assert.equal((await fetch(`${BASE}/api/tasks/t-a3`, json('PUT', { ...before, status: 42 }, member))).status, 400);
    assert.equal((await fetch(`${BASE}/api/tasks/t-a3`, json('PUT', { ...before, subtasks: 'nope' }, member))).status, 400);
    assert.equal((await fetch(`${BASE}/api/tasks/nope`, json('PUT', { ...before, status: 'done' }, member))).status, 404);
    const stale = await fetch(`${BASE}/api/tasks/t-a3`, json('PUT', { ...before, status: 'done', version: before.version - 1 }, member));
    assert.equal(stale.status, 409);
    assert.equal((await stale.json()).error, 'version_conflict');
    assert.deepEqual(await getTask('t-a3'), before);
  });

  it('F5: owners and managers keep full edits and assignment', async () => {
    const before = await getTask('t-a3');
    const byManager = await fetch(`${BASE}/api/tasks/t-a3`, json('PUT', { ...before, title: 'Prepare rundown v2', assignee: managerId }, manager));
    assert.equal(byManager.status, 200);
    const mid = await getTask('t-a3');
    assert.equal(mid.title, 'Prepare rundown v2');
    assert.equal(mid.assignee, managerId);
    const byOwner = await fetch(`${BASE}/api/tasks/t-a3`, json('PUT', { ...mid, priority: 'high', subtasks: [{ text: 'Only one', done: false }] }, owner));
    assert.equal(byOwner.status, 200);
    const end = await getTask('t-a3');
    assert.equal(end.priority, 'high');
    assert.deepEqual(end.subtasks, [{ text: 'Only one', done: false }]);
  });
});
