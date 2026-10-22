const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { scalarResult } = require('../whatson/core.cjs');
const { convertBinds } = require('../whatson/sqlBinds.cjs');

const messages = { noRows: 'No measurement', notNumeric: 'Not numeric' };

describe('scalar measurements', () => {
  it('returns no_data for SQL NULL instead of inventing a zero', () => {
    assert.deepEqual(scalarResult([{ VALUE: null }], messages), { status: 'no_data', error: 'No measurement' });
  });
  it('returns no_data for an empty result', () => {
    assert.deepEqual(scalarResult([], messages), { status: 'no_data', error: 'No measurement' });
  });
  it('returns no_data for a blank scalar', () => {
    assert.deepEqual(scalarResult([{ VALUE: '  ' }], messages), { status: 'no_data', error: 'No measurement' });
  });
  it('preserves a genuine zero', () => {
    assert.deepEqual(scalarResult([{ VALUE: 0 }], messages), { status: 'ok', current: 0 });
  });
  it('accepts a numeric PostgreSQL string', () => {
    assert.deepEqual(scalarResult([{ VALUE: '-12.5' }], messages), { status: 'ok', current: -12.5 });
  });
  it('rejects infinity before it can serialize to NULL', () => {
    assert.deepEqual(scalarResult([{ VALUE: 'Infinity' }], messages), { status: 'error', error: 'Not numeric' });
  });
  it('rejects a boolean instead of coercing it to one', () => {
    assert.deepEqual(scalarResult([{ VALUE: true }], messages), { status: 'error', error: 'Not numeric' });
  });
});

describe('named SQL binds', () => {
  it('preserves a quoted bind name and converts the real parameter', () => {
    assert.deepEqual(convertBinds("SELECT ':start_date' AS label, :start_date AS cutoff", { start_date: '2026-01-01' }), {
      text: "SELECT ':start_date' AS label, $1 AS cutoff", values: ['2026-01-01'],
    });
  });
  it('leaves comments, quoted identifiers, dollar quotes and alternative quotes intact', () => {
    assert.deepEqual(convertBinds(`SELECT ":x", $$:x$$, $tag$:x$tag$, q'[:x]', ':x''s', :x /* :x */ -- :x\n`, { x: 7 }), {
      text: `SELECT ":x", $$:x$$, $tag$:x$tag$, q'[:x]', ':x''s', $1 /* :x */ -- :x\n`, values: [7],
    });
  });
  it('preserves PostgreSQL casts and numbers repeated real binds in order', () => {
    assert.deepEqual(convertBinds('SELECT :x::integer, :x, :missing', { x: 7, integer: 9 }), {
      text: 'SELECT $1::integer, $2, :missing', values: [7, 7],
    });
  });
  it('preserves escaped PostgreSQL strings', () => {
    assert.deepEqual(convertBinds("SELECT E'escaped\\' :x', :x", { x: 3 }), {
      text: "SELECT E'escaped\\' :x', $1", values: [3],
    });
  });
});
