const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// R6-1: the operator channel. The cockpit registers a tenant instance (URL +
// per-instance operator token), then manages that instance's WHATS'ON
// connection, its pinned client's binding, and its connector agents through
// forwarded calls. On the tenant the token is a principal of its own, held to
// an allowlist. ADR: docs/gpm/state/r6-backlog-2026-09-03.md (ST0).

const SERVER = path.join(__dirname, '..', 'server.cjs');
const COCKPIT_PORT = 6300 + Math.floor(Math.random() * 40);
const TENANT_PORT = COCKPIT_PORT + 41;
const COCKPIT = `http://127.0.0.1:${COCKPIT_PORT}`;
const TENANT = `http://127.0.0.1:${TENANT_PORT}`;
const OPERATOR_TOKEN = 'op-secret-for-the-test';

const json = (method, body, extra = {}) => ({
  method, headers: { 'Content-Type': 'application/json', ...extra },
  body: body === undefined ? undefined : JSON.stringify(body),
});
const asOperator = (method, body, token = OPERATOR_TOKEN) => json(method, body, { 'X-Operator-Token': token });
/** Read once; assert on status with the body in the message without consuming it twice. */
async function expectStatus(res, status) {
  const text = await res.text();
  assert.equal(res.status, status, text);
  return text ? JSON.parse(text) : {};
}

async function waitUp(base) {
  const deadline = Date.now() + 15000;
  for (;;) {
    try { if ((await fetch(`${base}/api/health`)).ok) return; } catch { /* not up */ }
    if (Date.now() > deadline) throw new Error(`server at ${base} did not start`);
    await new Promise((r) => setTimeout(r, 200));
  }
}

describe('operator channel: cockpit → tenant', () => {
  let cockpit;
  let tenant;
  let dir;

  before(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brokr-opchan-'));
    cockpit = spawn(process.execPath, [SERVER], {
      env: {
        ...process.env,
        BRIDGE_MODE: 'cockpit', BRIDGE_INSECURE_NO_AUTH: '1',
        BRIDGE_ENCRYPTION_KEY: 'cockpit-key',
        BRIDGE_DB_PATH: path.join(dir, 'cockpit.db'), BRIDGE_BACKUP_DIR: path.join(dir, 'cockpit-backups'),
        BRIDGE_PORT: String(COCKPIT_PORT), BRIDGE_HOST: '127.0.0.1', BRIDGE_API_KEY: '',
      },
      stdio: 'ignore',
    });
    tenant = spawn(process.execPath, [SERVER], {
      env: {
        ...process.env,
        BRIDGE_MODE: 'client', BRIDGE_INSECURE_NO_AUTH: '1',
        BRIDGE_OPERATOR_TOKEN: OPERATOR_TOKEN, BRIDGE_ENCRYPTION_KEY: 'tenant-key',
        BRIDGE_DB_PATH: path.join(dir, 'tenant.db'), BRIDGE_BACKUP_DIR: path.join(dir, 'tenant-backups'),
        BRIDGE_PORT: String(TENANT_PORT), BRIDGE_HOST: '127.0.0.1', BRIDGE_API_KEY: '',
      },
      stdio: 'ignore',
    });
    await Promise.all([waitUp(COCKPIT), waitUp(TENANT)]);

    // The tenant's pinned client (provisioning seeds it) and an owner for audit joins
    await fetch(`${TENANT}/api/clients`, json('POST', { id: 'client_t0', name: 'Tenant Zero', connectionId: '', color: '#000', channels: [] }));
    // The cockpit's client row for that tenant
    await fetch(`${COCKPIT}/api/clients`, json('POST', { id: 't0', name: 'Tenant Zero', connectionId: '', color: '#000', channels: [] }));
    await fetch(`${COCKPIT}/api/clients`, json('POST', { id: 't1', name: 'Unregistered', connectionId: '', color: '#000', channels: [] }));
  });

  after(() => {
    cockpit?.kill();
    tenant?.kill();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  describe('on the tenant', () => {
    it('refuses a wrong operator token outright', async () => {
      const res = await fetch(`${TENANT}/api/connections`, asOperator('GET', undefined, 'nope'));
      assert.equal(res.status, 401);
      assert.equal((await res.json()).error, 'Invalid operator token');
    });

    it('holds the operator to the allowlist even under the dev escape', async () => {
      const ok = await fetch(`${TENANT}/api/connections`, asOperator('GET'));
      assert.equal(ok.status, 200);
      const goals = await fetch(`${TENANT}/api/goals`, asOperator('POST', { id: 'g', title: 'x' }));
      assert.equal(goals.status, 403);
      assert.equal((await goals.json()).error, 'Outside the operator channel');
      const backup = await fetch(`${TENANT}/api/sync/backup`, asOperator('GET'));
      assert.equal(backup.status, 403);
    });
  });

  describe('on the cockpit', () => {
    it('lists every client as a tenant, unregistered ones included', async () => {
      const list = await (await fetch(`${COCKPIT}/api/cockpit/tenants`)).json();
      assert.deepEqual(list.map((t) => [t.clientId, t.instanceUrl, t.operatorTokenSet, t.shareTokenMintedAt]),
        [['t0', '', false, null], ['t1', '', false, null]]);
    });

    it('refuses to forward for an unregistered tenant', async () => {
      const res = await fetch(`${COCKPIT}/api/cockpit/tenants/t1/connections`);
      assert.equal(res.status, 409);
      assert.equal((await res.json()).error, 'tenant_not_registered');
    });

    it('registers the instance: token stored as ciphertext, never echoed', async () => {
      const bad = await fetch(`${COCKPIT}/api/cockpit/tenants/t0`, json('PUT', { instanceUrl: 'not a url', operatorToken: OPERATOR_TOKEN }));
      assert.equal(bad.status, 400);

      const res = await fetch(`${COCKPIT}/api/cockpit/tenants/t0`, json('PUT', { instanceUrl: `${TENANT}/`, operatorToken: OPERATOR_TOKEN }));
      const { tenant: dto } = await expectStatus(res, 200);
      assert.equal(dto.instanceUrl, TENANT, 'trailing slash normalised away');
      assert.equal(dto.operatorTokenSet, true);
      assert.ok(!JSON.stringify(dto).includes(OPERATOR_TOKEN));

      const Database = require('better-sqlite3');
      const db = new Database(path.join(dir, 'cockpit.db'), { readonly: true });
      try {
        const row = db.prepare('SELECT operator_token FROM cockpit_tenants WHERE client_id = ?').get('t0');
        assert.ok(row.operator_token.startsWith('enc:v1:'), `expected ciphertext, got ${row.operator_token}`);
      } finally { db.close(); }
    });

    it('reports the tenant reachable with the operator token accepted and its pinned client', async () => {
      const status = await (await fetch(`${COCKPIT}/api/cockpit/tenants/t0/status`)).json();
      assert.equal(status.reachable, true);
      assert.equal(status.mode, 'client');
      assert.ok(status.version);
      assert.equal(status.operatorAccepted, true);
      assert.equal(status.client.id, 'client_t0');
    });

    it('a masked token keeps the stored one when only the URL changes', async () => {
      const res = await fetch(`${COCKPIT}/api/cockpit/tenants/t0`, json('PUT', { instanceUrl: TENANT, operatorToken: '***' }));
      assert.equal(res.status, 200);
      const status = await (await fetch(`${COCKPIT}/api/cockpit/tenants/t0/status`)).json();
      assert.equal(status.operatorAccepted, true);
    });

    it('creates a connection on the tenant, encrypted at rest there, and binds the pinned client', async () => {
      const conn = { id: 'conn_psi', name: 'PSI', type: 'postgres', host: 'db', port: 5432, service: 'w', schema: 'psi', user: 'u', password: 'pw' };
      const created = await fetch(`${COCKPIT}/api/cockpit/tenants/t0/connections`, json('POST', conn));
      assert.equal((await expectStatus(created, 200)).connection.password, '***');

      const onTenant = await (await fetch(`${TENANT}/api/connections`)).json();
      assert.deepEqual(onTenant.map((c) => [c.id, c.password]), [['conn_psi', '***']]);
      const Database = require('better-sqlite3');
      const db = new Database(path.join(dir, 'tenant.db'), { readonly: true });
      try {
        assert.ok(db.prepare('SELECT password FROM connections WHERE id = ?').get('conn_psi').password.startsWith('enc:v1:'));
      } finally { db.close(); }

      const viaCockpit = await (await fetch(`${COCKPIT}/api/cockpit/tenants/t0/connections`)).json();
      assert.deepEqual(viaCockpit.map((c) => c.id), ['conn_psi']);

      const bound = await fetch(`${COCKPIT}/api/cockpit/tenants/t0/binding`, json('PUT', { connectionId: 'conn_psi' }));
      await expectStatus(bound, 200);
      const pinned = (await (await fetch(`${TENANT}/api/clients`)).json())[0];
      assert.equal(pinned.connectionId, 'conn_psi');
      const status = await (await fetch(`${COCKPIT}/api/cockpit/tenants/t0/status`)).json();
      assert.equal(status.client.connectionId, 'conn_psi');
    });

    it('refuses to delete the bound connection through the channel too (D-3 holds)', async () => {
      const res = await fetch(`${COCKPIT}/api/cockpit/tenants/t0/connections/conn_psi`, { method: 'DELETE' });
      assert.equal(res.status, 409);
      assert.equal((await res.json()).error, 'connection_in_use');
    });

    it('mints an enrol token that enrols a real agent, lists it with last-seen, and revokes it', async () => {
      const minted = await fetch(`${COCKPIT}/api/cockpit/tenants/t0/agents/enrol-token`, json('POST', {}));
      const { token } = await expectStatus(minted, 201);
      assert.ok(token);

      const enrolled = await (await fetch(`${TENANT}/api/agent/enroll`, json('POST', { token, name: 'site-agent' }))).json();
      assert.ok(enrolled.agentId);
      await fetch(`${TENANT}/api/agent/ingest`, json('POST', { results: [{ krId: 'none', value: 1, timestamp: new Date().toISOString() }] }, { 'X-Agent-Token': enrolled.agentToken }));

      const listed = await (await fetch(`${COCKPIT}/api/cockpit/tenants/t0/agents`)).json();
      assert.deepEqual(listed.map((a) => [a.id, a.name, a.revoked, !!a.lastSeenAt]), [[enrolled.agentId, 'site-agent', false, true]]);

      const revoked = await fetch(`${COCKPIT}/api/cockpit/tenants/t0/agents/${enrolled.agentId}`, { method: 'DELETE' });
      assert.equal(revoked.status, 200);
      const after = await (await fetch(`${COCKPIT}/api/cockpit/tenants/t0/agents`)).json();
      assert.equal(after[0].revoked, true);
      const refused = await fetch(`${TENANT}/api/agent/ingest`, json('POST', { results: [] }, { 'X-Agent-Token': enrolled.agentToken }));
      assert.equal(refused.status, 401);
    });

    it('audits operator actions on the tenant under the operator actor', async () => {
      const log = await (await fetch(`${TENANT}/api/activity`)).json();
      const entries = Array.isArray(log) ? log : (log.entries || []);
      const byOperator = entries.filter((e) => e.actor === 'Mediagenix operator').map((e) => e.text);
      assert.ok(byOperator.some((t) => /Saved database connection 'PSI'/.test(t)), JSON.stringify(entries));
      assert.ok(byOperator.some((t) => /enrolment token/.test(t)));
      assert.ok(byOperator.some((t) => /Revoked agent/.test(t)));
    });

    it('answers 502 with the reason when the tenant is unreachable', async () => {
      await fetch(`${COCKPIT}/api/cockpit/tenants/t0`, json('PUT', { instanceUrl: 'http://127.0.0.1:1', operatorToken: '***' }));
      const res = await fetch(`${COCKPIT}/api/cockpit/tenants/t0/connections`);
      assert.equal(res.status, 502);
      const body = await res.json();
      assert.equal(body.error, 'tenant_unreachable');
      assert.match(body.detail, /Tenant Zero/);
      const status = await (await fetch(`${COCKPIT}/api/cockpit/tenants/t0/status`)).json();
      assert.equal(status.reachable, false);
      assert.ok(status.detail);
    });

    it('passes the tenant\'s 401 through when the registered token is wrong', async () => {
      await fetch(`${COCKPIT}/api/cockpit/tenants/t0`, json('PUT', { instanceUrl: TENANT, operatorToken: 'stale' }));
      const res = await fetch(`${COCKPIT}/api/cockpit/tenants/t0/connections`);
      assert.equal(res.status, 401);
      const status = await (await fetch(`${COCKPIT}/api/cockpit/tenants/t0/status`)).json();
      assert.equal(status.reachable, true);
      assert.equal(status.operatorAccepted, false);
    });

    it('still mints the share token and records when', async () => {
      const minted = await fetch(`${COCKPIT}/api/cockpit/tenants`, json('POST', { clientId: 't0' }));
      assert.equal(minted.status, 201);
      const list = await (await fetch(`${COCKPIT}/api/cockpit/tenants`)).json();
      const t0 = list.find((t) => t.clientId === 't0');
      assert.ok(t0.shareTokenMintedAt);
      assert.equal(t0.instanceUrl, TENANT, 'minting must not disturb the registration');
    });
  });
});
