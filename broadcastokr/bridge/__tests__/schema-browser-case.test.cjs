const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { getTablesQuery, getColumnsQuery, normalizePgRows, coerceNumeric } = require('../whatson/core.cjs');

// R1 rig, finding 33: the connection form defaults the schema to "PSI"; Postgres
// compares information_schema names case-sensitively, so the table browser found
// nothing on a Postgres connection saved with that default.

// R1 rig, finding 14: pg returns count()/numeric as strings, Oracle as numbers.
describe('Postgres rows are normalized like Oracle rows', () => {
  it('turns numeric strings into numbers and upper-cases column names', () => {
    assert.deepEqual(normalizePgRows([{ value: '9' }, { value: '90.0' }, { num_rows: '84' }]),
      [{ VALUE: 9 }, { VALUE: 90 }, { NUM_ROWS: 84 }]);
  });

  it('leaves text, dates, nulls, and unsafe integers alone', () => {
    assert.equal(coerceNumeric('TV'), 'TV');
    assert.equal(coerceNumeric('2025-01-01'), '2025-01-01');
    assert.equal(coerceNumeric(null), null);
    assert.equal(coerceNumeric(7), 7);
    assert.equal(coerceNumeric('12345678901234567890'), '12345678901234567890');
    assert.equal(coerceNumeric('1e5'), '1e5');
  });

  it('reports an unanalyzed table as an unknown row count, not -1', () => {
    assert.match(getTablesQuery({ type: 'postgres', schema: 'psi' }).sql, /CASE WHEN reltuples < 0 THEN NULL/);
  });
});

describe('schema browser folds the schema name per dialect', () => {
  it('Postgres: lower case, default public', () => {
    assert.deepEqual(getTablesQuery({ type: 'postgres', schema: 'PSI' }).params, ['psi']);
    assert.deepEqual(getColumnsQuery({ type: 'postgres', schema: 'PSI' }, 'psitransmission').params, ['psi', 'psitransmission']);
    assert.deepEqual(getTablesQuery({ type: 'postgres' }).params, ['public']);
  });

  it('Oracle: upper case, default the user', () => {
    assert.deepEqual(getTablesQuery({ type: 'oracle', schema: 'psi', user: 'x' }).params, { owner: 'PSI' });
    assert.deepEqual(getTablesQuery({ type: 'oracle', user: 'brokr_reader' }).params, { owner: 'BROKR_READER' });
    assert.equal(getColumnsQuery({ type: 'oracle', schema: 'psi', user: 'x' }, 'PSITRANSMISSION').params.owner, 'PSI');
  });
});
