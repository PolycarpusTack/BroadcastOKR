const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// assertSelectOnly is defined inside server.cjs and not exported.
// We duplicate the logic here for testing. A future refactor should extract it.
function assertSelectOnly(sql) {
  const stripped = sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--[^\n]*/g, '');
  if (!stripped.trim().toUpperCase().startsWith('SELECT')) {
    throw new Error('Only SELECT queries are allowed');
  }
  const noStrings = stripped.replace(/'[^']*'/g, '');
  if (/;/.test(noStrings)) {
    throw new Error('Multiple statements are not allowed');
  }
}

describe('assertSelectOnly', () => {
  it('allows a simple SELECT', () => {
    assert.doesNotThrow(() => assertSelectOnly('SELECT 1'));
  });

  it('allows SELECT with subquery', () => {
    assert.doesNotThrow(() => assertSelectOnly('SELECT * FROM (SELECT 1) AS t'));
  });

  it('allows SELECT with string containing semicolons', () => {
    assert.doesNotThrow(() => assertSelectOnly("SELECT * FROM t WHERE name = 'a;b'"));
  });

  it('blocks INSERT', () => {
    assert.throws(() => assertSelectOnly('INSERT INTO t VALUES (1)'), /Only SELECT/);
  });

  it('blocks DELETE', () => {
    assert.throws(() => assertSelectOnly('DELETE FROM t'), /Only SELECT/);
  });

  it('blocks DROP TABLE', () => {
    assert.throws(() => assertSelectOnly('DROP TABLE t'), /Only SELECT/);
  });

  it('blocks stacked statements', () => {
    assert.throws(() => assertSelectOnly('SELECT 1; DROP TABLE t'), /Multiple statements/);
  });

  it('blocks stacked statements with INSERT', () => {
    assert.throws(() => assertSelectOnly('SELECT 1; INSERT INTO t VALUES (1)'), /Multiple statements/);
  });

  it('blocks SELECT hidden inside block comment', () => {
    assert.throws(() => assertSelectOnly('/* SELECT 1 */ DROP TABLE t'), /Only SELECT/);
  });

  it('blocks SELECT hidden after line comment', () => {
    assert.throws(() => assertSelectOnly('-- SELECT 1\nDROP TABLE t'), /Only SELECT/);
  });

  it('allows SELECT with block comment inside', () => {
    assert.doesNotThrow(() => assertSelectOnly('SELECT /* comment */ 1'));
  });

  it('allows SELECT with line comment inside', () => {
    assert.doesNotThrow(() => assertSelectOnly('SELECT 1 -- comment'));
  });

  it('blocks empty string', () => {
    assert.throws(() => assertSelectOnly(''), /Only SELECT/);
  });

  it('blocks whitespace-only string', () => {
    assert.throws(() => assertSelectOnly('   '), /Only SELECT/);
  });
});
