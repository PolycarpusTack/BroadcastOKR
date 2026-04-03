const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { atomicWriteJSON } = require('../utils/atomicWrite.cjs');

const TEST_FILE = path.join(__dirname, '__test_atomic.json');

afterEach(() => {
  try { fs.unlinkSync(TEST_FILE); } catch {}
  try { fs.unlinkSync(TEST_FILE + '.tmp'); } catch {}
});

describe('atomicWriteJSON', () => {
  it('writes JSON to file', () => {
    const data = { foo: 'bar', num: 42 };
    atomicWriteJSON(TEST_FILE, data);
    const result = JSON.parse(fs.readFileSync(TEST_FILE, 'utf8'));
    assert.deepEqual(result, data);
  });

  it('does not leave .tmp file behind', () => {
    atomicWriteJSON(TEST_FILE, { a: 1 });
    assert.equal(fs.existsSync(TEST_FILE + '.tmp'), false);
  });

  it('overwrites existing file', () => {
    atomicWriteJSON(TEST_FILE, { version: 1 });
    atomicWriteJSON(TEST_FILE, { version: 2 });
    const result = JSON.parse(fs.readFileSync(TEST_FILE, 'utf8'));
    assert.equal(result.version, 2);
  });
});
