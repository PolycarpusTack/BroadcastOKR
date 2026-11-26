const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { spawn, fork } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// R2 drill (r1-findings #42): a bridge that is stopped without closing its
// database leaves broadcastokr.db-wal behind, and a restore that then replaces
// only the .db is silently undone by that WAL. A stop request — SIGTERM/SIGINT
// (Docker, systemd) or the {type:'shutdown'} IPC message (Electron's fork; on
// Windows a signal is a hard kill) — closes the database, which checkpoints the
// WAL into the .db and removes it.

const SERVER = path.join(__dirname, '..', 'server.cjs');
let port = 40000 + Math.floor(Math.random() * 20000); // fixed low ports collide with local services

function envFor(dir) {
  // NODE_TEST_CONTEXT would make a forked child report to this test runner over IPC instead of running
  const { NODE_TEST_CONTEXT: _ignored, ...inherited } = process.env;
  return {
    ...inherited,
    BRIDGE_MODE: 'desktop', BRIDGE_HOST: '127.0.0.1', BRIDGE_PORT: String(++port),
    BRIDGE_API_KEY: '', BRIDGE_ENCRYPTION_KEY: '',
    BRIDGE_DB_PATH: path.join(dir, 'broadcastokr.db'),
    BRIDGE_CONFIG_PATH: path.join(dir, 'config.json'),
    BRIDGE_HISTORY_PATH: path.join(dir, 'history.json'),
    BRIDGE_LOG_DIR: path.join(dir, 'logs'),
    BRIDGE_BACKUP_DIR: path.join(dir, 'backups'),
  };
}

async function waitUp(child, env) {
  const url = `http://127.0.0.1:${env.BRIDGE_PORT}`;
  for (let i = 0; i < 150; i++) {
    if (child.exitCode !== null || child.signalCode !== null) throw new Error(`bridge exited ${child.exitCode} ${child.signalCode} after ${i * 100} ms`);
    try { if ((await fetch(`${url}/api/health`)).ok) return url; } catch { /* not yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('bridge did not start');
}

async function writeSomething(url) {
  const res = await fetch(`${url}/api/clients`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'client-shutdown', name: 'written before the stop', color: '#3805E3', connectionId: '', channels: [] }),
  });
  assert.ok(res.ok, `client write → ${res.status} ${res.ok ? "" : await res.text()}`);
}

function exited(child) {
  return new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal })));
}

function afterStop(dir) {
  const db = path.join(dir, 'broadcastokr.db');
  const wal = db + '-wal';
  const Database = require('better-sqlite3');
  // Opened read-only from the .db alone: the WAL must already be folded in
  const walLeft = fs.existsSync(wal) ? fs.statSync(wal).size : 0;
  if (fs.existsSync(wal)) fs.renameSync(wal, `${wal}.left`);
  fs.rmSync(db + '-shm', { force: true });
  const copy = new Database(db, { readonly: true });
  try {
    return { walLeft, row: copy.prepare(`SELECT name AS title FROM clients WHERE id = 'client-shutdown'`).get() };
  } finally { copy.close(); }
}

describe('graceful shutdown closes the database', () => {
  it('on the IPC shutdown message (Electron fork): exit 0, no WAL left, the write is in the .db', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brokr-shutdown-'));
    const env = envFor(dir);
    const child = fork(SERVER, [], { env, silent: true, execArgv: [] }); // not the runner's --test
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    try {
      const url = await waitUp(child, env);
      await writeSomething(url);
      const done = exited(child);
      child.send({ type: 'shutdown' });
      const { code } = await done;
      assert.equal(code, 0);
      const r = afterStop(dir);
      assert.equal(r.walLeft, 0, 'WAL left behind');
      assert.equal(r.row?.title, 'written before the stop');
    } catch (e) {
      e.message += `
--- bridge output ---
${out.slice(-1500)}`;
      throw e;
    } finally {
      if (child.exitCode === null) child.kill();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('on SIGTERM (Docker, systemd)', { skip: process.platform === 'win32' && 'Windows delivers SIGTERM as a hard kill' }, async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brokr-shutdown-'));
    const env = envFor(dir);
    const child = spawn(process.execPath, [SERVER], { env, stdio: 'ignore' });
    try {
      const url = await waitUp(child, env);
      await writeSomething(url);
      const done = exited(child);
      child.kill('SIGTERM');
      const { code } = await done;
      assert.equal(code, 0);
      const r = afterStop(dir);
      assert.equal(r.walLeft, 0, 'WAL left behind');
      assert.equal(r.row?.title, 'written before the stop');
    } finally {
      if (child.exitCode === null) child.kill('SIGKILL');
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
