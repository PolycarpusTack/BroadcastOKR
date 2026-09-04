const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// R7: the agent bundle is self-contained — every relative require inside it
// resolves — and its entrypoint runs from the staging directory.

const ROOT = path.join(__dirname, '..', '..');
const SCRIPT = path.join(ROOT, 'scripts', 'build-agent-bundle.mjs');

describe('connector-agent bundle', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'brokr-agent-bundle-'));
  after(() => fs.rmSync(out, { recursive: true, force: true }));

  it('builds a tarball whose require graph is closed and whose entrypoint runs', () => {
    const build = spawnSync(process.execPath, [SCRIPT, '--out', out], { encoding: 'utf8' });
    assert.equal(build.status, 0, build.stdout + build.stderr);
    assert.match(build.stdout, /require graph closed/);

    const version = require('../package.json').version;
    const staging = path.join(out, `brokr-agent-${version}`);
    assert.ok(fs.existsSync(path.join(out, `brokr-agent-${version}.tgz`)), 'tarball missing');
    for (const f of ['agent.cjs', 'agentCore.cjs', 'protocol.cjs', 'whatson/core.cjs', 'utils/crypto.cjs', 'package.json', 'README.md']) {
      assert.ok(fs.existsSync(path.join(staging, f)), `${f} missing from the bundle`);
    }
    assert.ok(!fs.existsSync(path.join(staging, 'server.cjs')), 'the bridge server must not ship in the agent bundle');
    assert.ok(!fs.existsSync(path.join(staging, 'routes')), 'bridge routes must not ship in the agent bundle');

    const manifest = JSON.parse(fs.readFileSync(path.join(staging, 'package.json'), 'utf8'));
    assert.equal(manifest.version, version);
    assert.ok(manifest.optionalDependencies.pg && manifest.optionalDependencies.oracledb);
    assert.equal(manifest.dependencies, undefined, 'the agent needs no hard dependency beyond Node');

    // The entrypoint loads from the staging dir (drivers optional) and prints usage
    const run = spawnSync(process.execPath, [path.join(staging, 'agent.cjs')], { encoding: 'utf8', cwd: staging });
    assert.match(run.stdout + run.stderr, /usage/i);
  });
});
