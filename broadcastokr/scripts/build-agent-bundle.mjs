#!/usr/bin/env node
/**
 * Build the connector-agent bundle (R7): the files a customer site needs to
 * run `agent.cjs` — nothing of the bridge's HTTP surface, database, or tests.
 *
 * Usage: node scripts/build-agent-bundle.mjs [--out <dir>]   (default dist-agent)
 *
 * Output: <out>/brokr-agent-<version>/ (staging) and <out>/brokr-agent-<version>.tgz.
 * The require graph of the staged files is checked to be closed before the
 * tarball is written, so a new bridge-internal require in agent code fails
 * here rather than at the customer site.
 */
import { readdirSync, readFileSync, mkdirSync, cpSync, writeFileSync, rmSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BRIDGE = join(ROOT, 'bridge');

const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const OUT = resolve(outIdx >= 0 ? args[outIdx + 1] : join(ROOT, 'dist-agent'));

const bridgePkg = JSON.parse(readFileSync(join(BRIDGE, 'package.json'), 'utf8'));
const version = bridgePkg.version;
const name = `brokr-agent-${version}`;
const staging = join(OUT, name);

/** Everything the agent entrypoint reaches, plus the WHATS'ON core as a unit. */
const FILES = [
  'agent.cjs',
  'agentCore.cjs',
  'protocol.cjs',
  'utils/crypto.cjs',
  'utils/atomicWrite.cjs',
  ...readdirSync(join(BRIDGE, 'whatson')).filter((f) => f.endsWith('.cjs')).map((f) => `whatson/${f}`),
];

rmSync(staging, { recursive: true, force: true });
mkdirSync(staging, { recursive: true });
for (const rel of FILES) {
  mkdirSync(dirname(join(staging, rel)), { recursive: true });
  cpSync(join(BRIDGE, rel), join(staging, rel));
}

// Manifest: only what the agent needs. The DB drivers stay optional — a site
// installs the one its WHATS'ON runs on.
writeFileSync(join(staging, 'package.json'), JSON.stringify({
  name: 'brokr-agent',
  version,
  private: true,
  description: 'BroadcastOKR connector agent — runs at the customer site, pushes scalar KR values to a BroadcastOKR instance',
  main: 'agent.cjs',
  bin: { 'brokr-agent': 'agent.cjs' },
  engines: { node: '>=22' },
  optionalDependencies: bridgePkg.optionalDependencies,
}, null, 2) + '\n');

writeFileSync(join(staging, 'README.md'), `# BroadcastOKR connector agent ${version}

Runs at the customer site, outbound-only. It executes the SQL in its local
\`agent-config.json\` against the site's WHATS'ON database and pushes numeric
values to the BroadcastOKR instance. No SQL ever arrives from the cloud.

\`\`\`bash
npm install                      # installs the optional DB driver(s) available for this platform
node agent.cjs enroll --instance https://<instance> --token <enrolment token> --name "<site>" --dir /etc/brokr-agent
node agent.cjs run --dir /etc/brokr-agent
\`\`\`

The enrolment token comes from the instance's Settings page (or the cockpit's
Tenant modal) and is single-use, valid 15 minutes. See docs/operations.md,
"Connector agent", in the BroadcastOKR repository.
`);

/** The require graph must close inside the staging directory. */
function checkRequireGraph(dir) {
  const broken = [];
  const walk = (d) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!entry.name.endsWith('.cjs')) continue;
      const text = readFileSync(full, 'utf8');
      for (const m of text.matchAll(/require\((['"])(\.{1,2}\/[^'"]+)\1\)/g)) {
        const target = resolve(dirname(full), m[2]);
        const candidates = [target, `${target}.cjs`, `${target}.js`, join(target, 'index.cjs')];
        if (!candidates.some((c) => existsSync(c) && statSync(c).isFile())) {
          broken.push(`${relative(dir, full)} → ${m[2]}`);
        }
      }
    }
  };
  walk(dir);
  return broken;
}

const broken = checkRequireGraph(staging);
if (broken.length > 0) {
  console.error('FAIL: the agent bundle is not self-contained:\n  ' + broken.join('\n  '));
  process.exit(1);
}

/**
 * A minimal ustar writer: no dependency, same result on Windows runners and
 * developer PCs (Windows' bundled tar refuses some temp paths). Entries are
 * `<name>/<relative path>` so the archive unpacks into one directory.
 */
function tarEntries(dir, prefix) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = join(dir, entry.name);
    const rel = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) { out.push({ path: `${rel}/`, dir: true }); out.push(...tarEntries(full, rel)); }
    else out.push({ path: rel, data: readFileSync(full), mode: entry.name.endsWith('.cjs') ? 0o755 : 0o644 });
  }
  return out;
}
function tarHeader(entry) {
  const h = Buffer.alloc(512);
  const write = (off, len, value) => h.write(String(value).slice(0, len), off, len, 'utf8');
  const octal = (off, len, n) => write(off, len, n.toString(8).padStart(len - 1, '0'));
  write(0, 100, entry.path);
  octal(100, 8, entry.dir ? 0o755 : entry.mode);
  octal(108, 8, 0); octal(116, 8, 0);
  octal(124, 12, entry.dir ? 0 : entry.data.length);
  octal(136, 12, Math.floor(Date.now() / 1000));
  write(148, 8, '        ');
  write(156, 1, entry.dir ? '5' : '0');
  write(257, 6, 'ustar\0'); write(263, 2, '00');
  let sum = 0;
  for (const b of h) sum += b;
  write(148, 8, sum.toString(8).padStart(6, '0') + '\0 ');
  return h;
}
function tarGz(dir, prefix) {
  const chunks = [];
  for (const entry of tarEntries(dir, prefix)) {
    chunks.push(tarHeader(entry));
    if (!entry.dir) {
      chunks.push(entry.data);
      const pad = (512 - (entry.data.length % 512)) % 512;
      if (pad) chunks.push(Buffer.alloc(pad));
    }
  }
  chunks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(chunks));
}

const tarball = join(OUT, `${name}.tgz`);
rmSync(tarball, { force: true });
writeFileSync(tarball, tarGz(staging, name));
console.log(`OK: ${relative(ROOT, tarball)} (${FILES.length} files, require graph closed)`);
