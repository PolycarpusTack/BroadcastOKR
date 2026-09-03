const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { getTablesQuery, getColumnsQuery } = require('../whatson/core.cjs');

// R1 rig, finding 33: the connection form defaults the schema to "PSI"; Postgres
// compares information_schema names case-sensitively, so the table browser found
// nothing on a Postgres connection saved with that default.

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
