const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// FF-7: edition switches live ONLY in the designated modules, and no file may
// fork per edition by name. Scattered mode checks are the slow-motion fork.

const BRIDGE_DIR = path.join(__dirname, '..');
const SRC_DIR = path.join(__dirname, '..', '..', 'src');

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

describe('no-fork guardrails', () => {
  it('only bridge/editions.cjs reads BRIDGE_MODE', () => {
    const offenders = walk(BRIDGE_DIR)
      .filter((f) => f.endsWith('.cjs') && path.basename(f) !== 'editions.cjs')
      .filter((f) => fs.readFileSync(f, 'utf8').includes('BRIDGE_MODE'));
    assert.deepEqual(offenders.map((f) => path.relative(BRIDGE_DIR, f)), []);
  });

  it('only src/editions reads VITE_EDITION', () => {
    const offenders = walk(SRC_DIR)
      .filter((f) => /\.(ts|tsx)$/.test(f) && !f.includes(`${path.sep}editions${path.sep}`))
      .filter((f) => fs.readFileSync(f, 'utf8').includes('VITE_EDITION'));
    assert.deepEqual(offenders.map((f) => path.relative(SRC_DIR, f)), []);
  });

  it('no per-edition file naming (*.client.*, *.internal.*, *.cockpit.*)', () => {
    const offenders = [...walk(SRC_DIR), ...walk(BRIDGE_DIR)]
      .filter((f) => /\.(client|internal|cockpit)\.[a-z]+$/.test(path.basename(f)));
    assert.deepEqual(offenders, []);
  });
});
