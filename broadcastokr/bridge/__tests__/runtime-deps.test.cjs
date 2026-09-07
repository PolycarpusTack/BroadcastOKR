const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { builtinModules } = require('node:module');

// F3 (review 2026-09-07): the instance image installs bridge/package.json, not
// the application manifest. A module the bridge requires — or imports lazily,
// as routes/auth.cjs does with openid-client — that is missing from the
// bridge manifest builds fine and fails at the first sign-in. This pins the
// bridge's runtime require graph to its own manifest and lockfile.

const BRIDGE = path.join(__dirname, '..');
const SKIP_DIRS = new Set(['__tests__', 'node_modules', 'logs', 'backups']);
const builtins = new Set(builtinModules.flatMap((m) => [m, `node:${m}`]));

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(path.join(dir, entry.name), out);
    } else if (entry.name.endsWith('.cjs')) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

/** Bare module specifiers from require() and import() calls; relative paths are not external. */
function externalSpecifiers(text) {
  const found = new Set();
  for (const m of text.matchAll(/\b(?:require|import)\((['"])([^'"]+)\1\)/g)) {
    const spec = m[2];
    if (spec.startsWith('.') || spec.startsWith('/')) continue;
    const pkg = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
    found.add(pkg);
  }
  return found;
}

describe('bridge runtime dependency graph (F3)', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(BRIDGE, 'package.json'), 'utf8'));
  const declared = new Set([
    ...Object.keys(manifest.dependencies || {}),
    ...Object.keys(manifest.optionalDependencies || {}),
  ]);
  const usedBy = new Map();
  for (const file of walk(BRIDGE)) {
    for (const spec of externalSpecifiers(fs.readFileSync(file, 'utf8'))) {
      if (builtins.has(spec)) continue;
      if (!usedBy.has(spec)) usedBy.set(spec, []);
      usedBy.get(spec).push(path.relative(BRIDGE, file));
    }
  }

  it('every module the bridge requires or imports is declared in bridge/package.json', () => {
    const missing = [...usedBy].filter(([spec]) => !declared.has(spec));
    assert.deepEqual(missing, [], `undeclared in bridge/package.json: ${missing.map(([s, f]) => `${s} (${f.join(', ')})`).join('; ')}`);
  });

  it('the SSO client is a production dependency, not an accident of the root install', () => {
    assert.ok(usedBy.has('openid-client'), 'routes/auth.cjs imports openid-client');
    assert.ok(manifest.dependencies['openid-client'], 'openid-client must be in bridge dependencies');
  });

  it('the bridge lockfile exists and resolves every declared dependency', () => {
    const lockPath = path.join(BRIDGE, 'package-lock.json');
    assert.ok(fs.existsSync(lockPath), 'bridge/package-lock.json is what the image installs from (npm ci)');
    const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    for (const dep of declared) {
      assert.ok(lock.packages[`node_modules/${dep}`], `${dep} missing from bridge/package-lock.json — run npm install --package-lock-only in bridge/`);
    }
    // The lockfile's own root manifest must agree with package.json, or npm ci refuses the build.
    for (const [dep, range] of Object.entries(manifest.dependencies)) {
      assert.equal(lock.packages[''].dependencies[dep], range, `${dep} range drifted between manifest and lockfile`);
    }
  });

  it('the instance image installs from the lockfile', () => {
    const dockerfile = fs.readFileSync(path.join(BRIDGE, '..', 'Dockerfile'), 'utf8');
    assert.match(dockerfile, /COPY bridge\/package\.json bridge\/package-lock\.json/);
    assert.match(dockerfile, /npm ci --omit=dev/);
    assert.doesNotMatch(dockerfile, /npm install --omit=dev/);
  });
});
