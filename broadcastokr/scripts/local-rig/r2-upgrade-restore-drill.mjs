#!/usr/bin/env node
/**
 * R2 drill, local, no container: upgrade a populated v0.9.2 tenant database to
 * this checkout, then back it up and restore it the way docs/operations.md says,
 * with measured times. Nothing here touches the rig's own instances or any
 * WHATS'ON database; everything lives in a fresh temp directory.
 *
 *   git archive v0.9.2 broadcastokr/bridge broadcastokr/package.json | tar -x -C <old>
 *   node scripts/local-rig/r2-upgrade-restore-drill.mjs --old <old>/broadcastokr/bridge
 *
 * The old bridge resolves its modules from this checkout's node_modules
 * (NODE_PATH). Output: a step log and a JSON summary on stdout.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, copyFileSync, existsSync, rmSync, statSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const NEW_BRIDGE = path.join(ROOT, 'bridge', 'server.cjs');
const argOld = process.argv.indexOf('--old');
if (argOld < 0) { console.error('usage: --old <path to the v0.9.2 bridge dir>'); process.exit(2); }
const OLD_BRIDGE = path.join(path.resolve(process.argv[argOld + 1]), 'server.cjs');
const PORT = Number(process.env.DRILL_PORT || 3201);
const BASE = `http://127.0.0.1:${PORT}`;
const API_KEY = randomBytes(24).toString('hex');
const ENC_KEY = randomBytes(32).toString('hex');

const work = mkdtempSync(path.join(tmpdir(), 'brokr-r2-'));
const DB = path.join(work, 'broadcastokr.db');
const summary = { work, steps: [] };
const log = (step, data = {}) => { summary.steps.push({ step, ...data }); console.error(`[r2] ${step}`, JSON.stringify(data)); };

function env(extra = {}) {
  return {
    ...process.env,
    NODE_PATH: path.join(ROOT, 'node_modules'),
    BRIDGE_MODE: 'desktop', BRIDGE_HOST: '127.0.0.1', BRIDGE_PORT: String(PORT),
    BRIDGE_API_KEY: API_KEY, BRIDGE_ENCRYPTION_KEY: ENC_KEY,
    BRIDGE_DB_PATH: DB,
    BRIDGE_CONFIG_PATH: path.join(work, 'config.json'),
    BRIDGE_HISTORY_PATH: path.join(work, 'kpi-history.json'),
    BRIDGE_LOG_DIR: path.join(work, 'logs'),
    BRIDGE_BACKUP_DIR: path.join(work, 'auto-backups'),
    ...extra,
  };
}

let running = null; // the live process, so a failure can show its output
async function start(server, label) {
  const t0 = Date.now();
  const child = spawn(process.execPath, [server], { cwd: path.dirname(path.dirname(server)), env: env(), stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { out += d; });
  for (;;) {
    if (child.exitCode !== null) throw new Error(`${label} exited ${child.exitCode}:\n${out}`);
    try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch { /* not yet */ }
    if (Date.now() - t0 > 30000) throw new Error(`${label} did not come up:\n${out}`);
    await new Promise((r) => setTimeout(r, 100));
  }
  running = { child, ms: Date.now() - t0, output: () => out };
  return running;
}

// Hard stop, like a killed service: no graceful close, the WAL stays behind.
async function kill(proc) {
  proc.child.kill('SIGKILL');
  await new Promise((r) => proc.child.once('exit', r));
}

async function api(method, p, body) {
  const res = await fetch(`${BASE}${p}`, {
    method,
    headers: { Authorization: `Bearer ${API_KEY}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  if (!res.ok) throw Object.assign(new Error(`${method} ${p} → ${res.status} ${text.slice(0, 200)}`), { status: res.status });
  return json;
}

function dbCounts() {
  const Database = require(path.join(ROOT, 'node_modules', 'better-sqlite3'));
  const db = new Database(DB, { readonly: true, fileMustExist: true });
  try {
    const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' ORDER BY name`).all().map((r) => r.name);
    const counts = Object.fromEntries(tables.map((t) => [t, db.prepare(`SELECT COUNT(*) AS c FROM "${t}"`).get().c]));
    const integrity = db.prepare('PRAGMA integrity_check').get().integrity_check;
    const migrations = db.prepare('SELECT name FROM _migrations ORDER BY name').all().map((r) => r.name);
    return { counts, integrity, migrations };
  } finally { db.close(); }
}

/** What the users see: the entity state, independent of timestamps the bridge stamps. */
async function fingerprint() {
  const s = await api('GET', '/api/sync/state');
  const goals = [...s.goals].sort((a, b) => a.id.localeCompare(b.id)).map((g) => ({
    id: g.id, title: g.title, owner: g.owner, period: g.period, archived: !!g.archived,
    krs: g.keyResults.map((k) => ({ id: k.id, title: k.title, start: k.start, target: k.target, current: k.current, history: (k.history || []).map((h) => [h.value, h.actor, h.source, h.note ?? null]) })),
  }));
  const tasks = [...s.tasks].sort((a, b) => a.id.localeCompare(b.id)).map((t) => ({ id: t.id, title: t.title, status: t.status, subtasks: (t.subtasks || []).map((x) => [x.text, !!x.done]) }));
  const clients = [...s.clients].sort((a, b) => a.id.localeCompare(b.id)).map((c) => ({ id: c.id, name: c.name, connectionId: c.connectionId, channels: c.channels }));
  const templates = [...(s.goalTemplates || [])].sort((a, b) => a.id.localeCompare(b.id)).map((t) => ({ id: t.id, krs: t.krTemplates.map((k) => [k.id, k.sql]) }));
  const users = [...s.users].sort((a, b) => a.id - b.id).map((u) => [u.id, u.name, u.role]);
  return JSON.stringify({ goals, tasks, clients, templates, users });
}

function seed() {
  const users = Array.from({ length: 10 }, (_, i) => ({ id: i, name: `Drill User ${i}`, role: i === 0 ? 'owner' : i < 3 ? 'manager' : 'member', av: `D${i}`, color: '#3805E3', dept: 'Ops', title: 'Planner' }));
  const clients = Array.from({ length: 5 }, (_, i) => ({ id: `client-${i}`, name: `Drill Client ${i}`, connectionId: `conn-${i % 3}`, color: '#123456', channels: [{ id: `ch-${i}`, name: `Channel ${i}` }] }));
  const goalTemplates = Array.from({ length: 3 }, (_, i) => ({ id: `tpl-${i}`, title: `Template ${i}`, category: 'ops', period: 'Q4 2026',
    krTemplates: [{ id: `krt-${i}`, title: `Fill rate ${i}`, sql: 'SELECT COUNT(*) AS value FROM psi.psitransmission', unit: '%', direction: 'higher', start: 0, target: 100 }] }));
  const day = 86400000;
  const goals = Array.from({ length: 40 }, (_, g) => ({
    id: `goal-${g}`, title: `Drill goal ${g}`, status: 'on_track', progress: 0.5, owner: g % 10, channel: 0, period: g < 30 ? 'Q4 2026' : 'Q3 2026',
    clientIds: [`client-${g % 5}`], archived: g >= 35, templateId: g < 6 ? `tpl-${g % 3}` : null,
    keyResults: Array.from({ length: 3 }, (_, k) => ({
      id: `kr-${g}-${k}`, title: `KR ${g}.${k}`, start: 0, target: 100, current: 10 * k, progress: k / 10, status: 'at_risk',
      krTemplateId: g < 6 && k === 0 ? `krt-${g % 3}` : null,
      liveConfig: k === 2 ? { connectionId: `conn-${g % 3}`, sql: 'SELECT COUNT(*) AS value FROM psi.psitransmission', unit: '#', direction: 'higher' } : undefined,
      history: Array.from({ length: 30 }, (_, h) => ({ timestamp: new Date(Date.UTC(2026, 8, 1) + h * day).toISOString(), value: h, confidence: 3, note: h % 7 ? null : `note ${h}`, actor: `Drill User ${h % 10}`, source: h % 2 ? 'sync' : 'check-in' })),
    })),
  }));
  const tasks = Array.from({ length: 100 }, (_, t) => ({ id: `task-${t}`, title: `Drill task ${t}`, status: ['backlog', 'todo', 'in_progress', 'review', 'done'][t % 5], priority: 'medium', assignee: t % 10, channel: 0, due: '2026-12-31', taskType: 'general', goalId: `goal-${t % 40}`, subtasks: [{ text: 'a', done: true }, { text: 'b', done: false }] }));
  const teams = [{ id: 'team-a', name: 'Team A', color: '#111111', icon: 'A', leadId: 1, members: [1, 3, 4] }, { id: 'team-b', name: 'Team B', color: '#222222', icon: 'B', leadId: 2, members: [2, 5] }];
  return { users, clients, goalTemplates, goals, tasks, teams };
}

async function main() {
  // 1 — v0.9.2 with a populated database
  let old = await start(OLD_BRIDGE, 'v0.9.2');
  log('v0.9.2 up on an empty database', { startMs: old.ms, health: await (await fetch(`${BASE}/api/health`)).json() });
  // v0.9.2 parses JSON bodies up to 100 kB, so the goals go in slices
  const data = seed();
  const { goals: allGoals, tasks, ...rest } = data;
  await api('POST', '/api/sync/migrate-from-local', rest);
  for (let i = 0; i < allGoals.length; i += 4) {
    await api('POST', '/api/sync/migrate-from-local', { goals: allGoals.slice(i, i + 4) });
  }
  const seeded = await api('POST', '/api/sync/migrate-from-local', { tasks }); // tasks point at goals
  for (let i = 0; i < 3; i++) {
    await api('POST', '/api/connections', { id: `conn-${i}`, name: `Drill conn ${i}`, type: i === 1 ? 'oracle' : 'postgres', host: 'localhost', port: i === 1 ? 1521 : 5433, service: 'drill', user: 'reader', password: `pw-${i}-${randomBytes(4).toString('hex')}` });
  }
  await api('DELETE', '/api/tasks/task-99'); // a v0.9.2 deletion: no tombstone table yet
  const before = await fingerprint();
  log('seeded under v0.9.2', { counts: seeded.counts });
  await kill(old);
  const oldDb = dbCounts();
  log('v0.9.2 database at rest', { migrations: oldDb.migrations.at(-1), integrity: oldDb.integrity, sizeBytes: statSync(DB).size });
  copyFileSync(DB, path.join(work, 'v092-before-upgrade.db'));
  for (const s of ['-wal', '-shm']) if (existsSync(DB + s)) copyFileSync(DB + s, path.join(work, `v092-before-upgrade.db${s}`));

  // 2 — upgrade: this checkout on the same files, same keys
  let cur = await start(NEW_BRIDGE, 'main');
  const migratedLines = cur.output().split('\n').filter((l) => /migrat|credential|re-?encrypt|unreadable/i.test(l)).map((l) => l.trim());
  const health = await api('GET', '/api/health');
  const after = await fingerprint();
  log('main up on the v0.9.2 database', { startMs: cur.ms, migrationLines: migratedLines, credentials: health.credentials, sameState: before === after });
  if (before !== after) writeFileSync(path.join(work, 'diff.json'), JSON.stringify({ before: JSON.parse(before), after: JSON.parse(after) }, null, 1));

  // 3 — the upgraded instance still works: a check-in command, a deletion that reaches the change feed
  const ci = await api('POST', '/api/goals/goal-1/check-in', { krId: 'kr-1-0', value: 77, confidence: 'high', note: 'after upgrade', operationId: `drill-${randomBytes(4).toString('hex')}` });
  const since = new Date(Date.now() - 1000).toISOString();
  await api('DELETE', '/api/goals/goal-2');
  const changes = await api('GET', `/api/sync/changes?since=${encodeURIComponent(since)}`);
  const conns = await api('GET', '/api/connections');
  const test = await fetch(`${BASE}/api/test-connection`, { method: 'POST', headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 'conn-0' }) });
  log('main works on the upgraded data', {
    checkIn: ci.goal?.keyResults?.find((k) => k.id === 'kr-1-0')?.current,
    deletionInFeed: JSON.stringify(changes.deletions || {}).includes('goal-2'),
    connections: conns.length,
    testConnectionReachesDriver: test.status, // a password that decrypted reaches the driver (and fails on the fake host); 'unreadable' would be refused earlier
  });
  const upgraded = dbCounts();
  log('upgraded database', { migrations: upgraded.migrations.slice(oldDb.migrations.length), integrity: upgraded.integrity });

  // 4 — backup through the API, then a write that the backup does not have
  const tb = Date.now();
  const res = await fetch(`${BASE}/api/sync/backup`, { headers: { Authorization: `Bearer ${API_KEY}` } });
  const snapshot = path.join(work, 'manual-backup.db');
  writeFileSync(snapshot, Buffer.from(await res.arrayBuffer()));
  log('backup via API', { status: res.status, ms: Date.now() - tb, sizeBytes: statSync(snapshot).size, autoBackups: readdirSync(path.join(work, 'auto-backups')).length });
  const atBackup = await fingerprint();
  await api('POST', '/api/goals/goal-3/check-in', { krId: 'kr-3-0', value: 99, operationId: `drill-${randomBytes(4).toString('hex')}` });
  await api('DELETE', '/api/goals/goal-4');
  const postBackup = await fingerprint();
  await kill(cur);
  log('main stopped hard after post-backup writes', { walBytes: existsSync(DB + '-wal') ? statSync(DB + '-wal').size : 0 });

  // 5a — restore exactly as the runbook says: replace broadcastokr.db (only)
  const tr = Date.now();
  copyFileSync(snapshot, DB);
  let restoredA;
  try {
    cur = await start(NEW_BRIDGE, 'main after restore (runbook as written)');
    const fpA = await fingerprint();
    restoredA = { startMs: cur.ms, totalMs: Date.now() - tr, sameAsBackup: fpA === atBackup, sameAsPostBackupWrites: fpA === postBackup, integrity: null };
    await kill(cur);
    restoredA.integrity = dbCounts().integrity;
  } catch (e) { restoredA = { error: e.message.split('\n')[0] }; }
  log('restore A — .db replaced, -wal/-shm left in place', restoredA);

  // 5b — restore with the WAL and shared-memory files removed too
  for (const s of ['-wal', '-shm']) rmSync(DB + s, { force: true });
  const tr2 = Date.now();
  copyFileSync(snapshot, DB);
  cur = await start(NEW_BRIDGE, 'main after restore (wal removed)');
  const restoredB = { startMs: cur.ms, totalMs: Date.now() - tr2, sameAsBackup: (await fingerprint()) === atBackup };
  log('restore B — .db replaced, -wal/-shm removed', restoredB);
  await kill(cur);
  restoredB.integrity = dbCounts().integrity;

  // 6 — rollback: the old binary on the upgraded schema
  try {
    old = await start(OLD_BRIDGE, 'v0.9.2 on the upgraded database');
    const s = await api('GET', '/api/sync/state');
    log('rollback — v0.9.2 on the 013 schema', { startMs: old.ms, goals: s.goals.length, tasks: s.tasks.length });
    await kill(old);
  } catch (e) { log('rollback — v0.9.2 on the 013 schema', { error: e.message.split('\n')[0] }); }

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  console.error(e);
  if (running) console.error(running.output().split(/\r?\n/).slice(-30).join('\n'));
  console.log(JSON.stringify(summary, null, 2));
  process.exit(1);
});
