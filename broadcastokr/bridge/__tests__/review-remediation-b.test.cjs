const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { startMockIdp } = require('./helpers/mockIdp.cjs');

// Review remediation 2026-09-07, Epic B: F7 (goal/task aggregates commit all or
// nothing) and F4 (a member's check-in is one authorised command with an
// idempotent retry). Every refusal is followed by a full readback of the rows.

const SERVER = path.join(__dirname, '..', 'server.cjs');
const PORT = 5200 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${PORT}`;
const CLIENT_ID = 'brokr-remediation-b';

const json = (method, body, cookie) => ({
  method,
  headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
  body: body === undefined ? undefined : JSON.stringify(body),
});

function cookieOf(res, name) {
  const hit = (res.headers.getSetCookie?.() || []).find((c) => c.startsWith(`${name}=`));
  return hit ? hit.split(';')[0] : null;
}

const goalBody = (id, extra = {}) => ({
  id, title: `Goal ${id}`, status: 'behind', progress: 0, owner: 1, channel: 0, period: 'Q3',
  keyResults: [
    { id: `${id}-kr1`, title: 'Manual KR', start: 0, target: 100, current: 40, progress: 0.4, status: 'at_risk' },
    { id: `${id}-kr2`, title: 'Live KR', start: 0, target: 10, current: 3, progress: 0.3, status: 'behind', liveConfig: { connectionId: 'c1', sql: 'SELECT 1', unit: '', direction: 'hi' } },
  ],
  ...extra,
});

describe('review remediation B: F7 atomic aggregates, F4 check-in command', () => {
  let server;
  let idp;
  let owner;
  let member;
  let memberName;

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
  const getGoal = async (id, cookie = owner) => {
    const res = await fetch(`${BASE}/api/goals/${id}`, { headers: { Cookie: cookie } });
    return res.status === 404 ? null : res.json();
  };
  const getTask = async (id) => (await (await fetch(`${BASE}/api/tasks`, { headers: { Cookie: owner } })).json()).find((t) => t.id === id) || null;

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
    owner = await signIn({ sub: 'own', name: 'Owner', email: 'o@x' });
    memberName = 'Member Person';
    member = await signIn({ sub: 'mem', name: memberName, email: 'm@x' });

    assert.equal((await fetch(`${BASE}/api/goals`, json('POST', goalBody('g1'), owner))).status, 201);
    assert.equal((await fetch(`${BASE}/api/goals`, json('POST', goalBody('g2'), owner))).status, 201);
  });

  after(() => {
    if (server) server.kill();
    idp?.close();
  });

  // ── F7: goals ─────────────────────────────────────────────────────────────

  it('F7: invalid nested input leaves the whole goal as it was', async () => {
    const before = await getGoal('g1');
    const bad = { ...before, title: 'Renamed', keyResults: [{ ...before.keyResults[0], start: 'zero' }, before.keyResults[1]] };
    const res = await fetch(`${BASE}/api/goals/g1`, json('PUT', bad, owner));
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error, 'invalid_goal');
    assert.deepEqual(await getGoal('g1'), before);
  });

  it('F7: a KR id owned by another goal cannot be pulled across', async () => {
    const g1 = await getGoal('g1');
    const g2 = await getGoal('g2');
    const theft = { ...g1, keyResults: [...g1.keyResults, { ...g2.keyResults[0], title: 'stolen' }] };
    const res = await fetch(`${BASE}/api/goals/g1`, json('PUT', theft, owner));
    assert.equal(res.status, 409);
    const body = await res.json();
    assert.equal(body.error, 'kr_owned_by_other_goal');
    assert.equal(body.krId, 'g2-kr1');
    assert.deepEqual(await getGoal('g1'), g1);
    assert.deepEqual(await getGoal('g2'), g2);
  });

  it('F7: duplicate create is an explicit 409 with the stored row; stale version still 409s', async () => {
    const dup = await fetch(`${BASE}/api/goals`, json('POST', goalBody('g1', { title: 'Second attempt' }), owner));
    assert.equal(dup.status, 409);
    const body = await dup.json();
    assert.equal(body.error, 'duplicate');
    assert.equal(body.current.title, 'Goal g1');

    const g1 = await getGoal('g1');
    const stale = await fetch(`${BASE}/api/goals/g1`, json('PUT', { ...g1, title: 'Stale', version: g1.version - 1 }, owner));
    assert.equal(stale.status, 409);
    assert.equal((await stale.json()).error, 'version_conflict');
    assert.deepEqual(await getGoal('g1'), g1);
  });

  it('F7: a valid update commits parent and KRs together, once', async () => {
    const g1 = await getGoal('g1');
    const res = await fetch(`${BASE}/api/goals/g1`, json('PUT', {
      ...g1, title: 'Goal g1 v2',
      keyResults: [{ ...g1.keyResults[0], target: 200 }, g1.keyResults[1], { id: 'g1-kr3', title: 'New', start: 0, target: 5, current: 0, progress: 0, status: 'behind' }],
    }, owner));
    assert.equal(res.status, 200);
    const after1 = await getGoal('g1');
    assert.equal(after1.title, 'Goal g1 v2');
    assert.equal(after1.version, g1.version + 1);
    assert.deepEqual(after1.keyResults.map((k) => k.id), ['g1-kr1', 'g1-kr2', 'g1-kr3']);
    assert.equal(after1.keyResults[0].target, 200);
  });

  // ── F7: tasks ─────────────────────────────────────────────────────────────

  it('F7: task create validates, refuses duplicates, and commits subtasks with the parent', async () => {
    const t = { id: 't1', title: 'Task', status: 'todo', priority: 'medium', assignee: 1, channel: 0, due: '2026-09-10', taskType: 'task',
      subtasks: [{ text: 'a', done: false }, { text: 'b', done: true }] };
    assert.equal((await fetch(`${BASE}/api/tasks`, json('POST', { ...t, subtasks: [{ text: 5 }] }, owner))).status, 400);
    assert.equal(await getTask('t1'), null, 'nothing was written for the invalid create');
    assert.equal((await fetch(`${BASE}/api/tasks`, json('POST', t, owner))).status, 201);
    const stored = await getTask('t1');
    assert.deepEqual(stored.subtasks, t.subtasks);
    const dup = await fetch(`${BASE}/api/tasks`, json('POST', { ...t, title: 'again' }, owner));
    assert.equal(dup.status, 409);
    assert.equal((await dup.json()).error, 'duplicate');
    assert.equal((await getTask('t1')).title, 'Task');
  });

  it('F7: an invalid task update leaves parent, subtasks and version untouched', async () => {
    const before = await getTask('t1');
    const res = await fetch(`${BASE}/api/tasks/t1`, json('PUT', { ...before, title: 'Renamed', subtasks: [{ text: 'a', done: false }, { done: true }] }, owner));
    assert.equal(res.status, 400);
    assert.deepEqual(await getTask('t1'), before);
  });

  // ── F4: the check-in command ──────────────────────────────────────────────

  it('F4: a member check-in persists the value and history in one command, attributed to the session', async () => {
    const before = await getGoal('g1', member);
    const res = await fetch(`${BASE}/api/goals/g1/check-in`, json('POST', {
      krId: 'g1-kr1', value: 55, confidence: 'high', note: 'on track', actor: 'Spoofed Owner', operationId: 'op-1',
    }, member));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.applied, 'value');
    assert.equal(body.version, before.version + 1);
    const kr = body.goal.keyResults.find((k) => k.id === 'g1-kr1');
    assert.equal(kr.current, 55);
    assert.equal(kr.history.length, 1);
    assert.equal(kr.history[0].value, 55);
    assert.equal(kr.history[0].actor, memberName, 'attribution comes from the session, not the body');
    assert.equal(kr.history[0].note, 'on track');

    // Another session sees the authoritative value without any PUT from the member
    const seenByOwner = await getGoal('g1');
    assert.equal(seenByOwner.keyResults.find((k) => k.id === 'g1-kr1').current, 55);
    assert.equal(seenByOwner.version, before.version + 1);
  });

  it('F4: the same operation replays the same answer; a different body under it is refused', async () => {
    const replay = await fetch(`${BASE}/api/goals/g1/check-in`, json('POST', {
      krId: 'g1-kr1', value: 55, confidence: 'high', note: 'on track', operationId: 'op-1',
    }, member));
    assert.equal(replay.status, 200);
    const body = await replay.json();
    assert.equal(body.replayed, true);
    assert.equal(body.goal.keyResults.find((k) => k.id === 'g1-kr1').history.length, 1, 'no second history row');
    const goal = await getGoal('g1');
    assert.equal(goal.keyResults.find((k) => k.id === 'g1-kr1').history.length, 1);

    const conflict = await fetch(`${BASE}/api/goals/g1/check-in`, json('POST', { krId: 'g1-kr1', value: 56, operationId: 'op-1' }, member));
    assert.equal(conflict.status, 409);
    assert.equal((await conflict.json()).error, 'operation_conflict');
    assert.deepEqual(await getGoal('g1'), goal);

    // A different member's operation id space is their own
    const other = await fetch(`${BASE}/api/goals/g1/check-in`, json('POST', { krId: 'g1-kr1', value: 60, operationId: 'op-1' }, owner));
    assert.equal(other.status, 200);
    assert.equal((await other.json()).replayed, undefined);
  });

  it('F4: a live KR keeps its synced value; only the annotation is recorded', async () => {
    const before = await getGoal('g1');
    const res = await fetch(`${BASE}/api/goals/g1/check-in`, json('POST', { krId: 'g1-kr2', value: 9, note: 'looks right', operationId: 'op-live' }, member));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.applied, 'history');
    const kr = body.goal.keyResults.find((k) => k.id === 'g1-kr2');
    assert.equal(kr.current, before.keyResults.find((k) => k.id === 'g1-kr2').current);
    assert.equal(kr.history[0].value, 9);
  });

  it('F4: invalid input and wrong associations fail without side effects', async () => {
    const before = await getGoal('g1');
    for (const [body, status] of [
      [{ krId: 'g1-kr1', value: 'NaN' }, 400],
      [{ krId: 'g1-kr1', value: Infinity }, 400],
      [{ krId: 'g1-kr1' }, 400],
      [{ krId: 'g2-kr1', value: 1 }, 404],
      [{ krId: 'nope', value: 1 }, 404],
      [{ krId: 'g1-kr1', value: 1, operationId: 'x'.repeat(129) }, 400],
    ]) {
      const res = await fetch(`${BASE}/api/goals/g1/check-in`, json('POST', body, member));
      assert.equal(res.status, status, JSON.stringify(body));
    }
    assert.deepEqual(await getGoal('g1'), before);
    assert.equal((await fetch(`${BASE}/api/goals/nope/check-in`, json('POST', { krId: 'g1-kr1', value: 1 }, member))).status, 404);
  });

  it('F4: a stale full-goal write cannot roll an accepted check-in back', async () => {
    const current = await getGoal('g1');
    const staleCopy = { ...current, version: current.version - 2, keyResults: current.keyResults.map((k) => (k.id === 'g1-kr1' ? { ...k, current: 40 } : k)) };
    const res = await fetch(`${BASE}/api/goals/g1`, json('PUT', staleCopy, owner));
    assert.equal(res.status, 409);
    assert.equal((await res.json()).error, 'version_conflict');
    assert.equal((await getGoal('g1')).keyResults.find((k) => k.id === 'g1-kr1').current, 60);
  });
});
