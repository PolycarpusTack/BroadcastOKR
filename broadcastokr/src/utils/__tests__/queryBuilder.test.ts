import { describe, it, expect } from 'vitest';
import { buildKRQuery, columnKind, qualifiedTable } from '../queryBuilder';

describe('buildKRQuery', () => {
  it('counts rows, with the schema folded per dialect', () => {
    expect(buildKRQuery({ table: 'psitransmission', measure: 'count' }, 'postgres', 'PSI'))
      .toEqual({ sql: 'SELECT COUNT(*) AS value FROM psi.psitransmission', usesTimeframe: false });
    expect(buildKRQuery({ table: 'psitransmission', measure: 'count' }, 'oracle', 'psi').sql)
      .toBe('SELECT COUNT(*) AS value FROM PSI.PSITRANSMISSION');
  });

  it('percent-where rounds to one decimal and survives an empty table', () => {
    const spec = { table: 'psimaterialpart', measure: 'percent' as const, condition: { column: 'mat_readyforrep', op: 'eq' as const, value: '1', kind: 'number' as const } };
    expect(buildKRQuery(spec, 'postgres', 'psi').sql)
      .toBe('SELECT ROUND(100.0 * SUM(CASE WHEN mat_readyforrep = 1 THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1) AS value FROM psi.psimaterialpart');
    expect(buildKRQuery(spec, 'oracle', 'PSI').sql)
      .toBe('SELECT ROUND(SUM(CASE WHEN mat_readyforrep = 1 THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0) * 100, 1) AS value FROM PSI.PSIMATERIALPART');
  });

  it('percent without a condition is refused', () => {
    expect(() => buildKRQuery({ table: 't', measure: 'percent' }, 'postgres', 'psi')).toThrow(/condition/);
  });

  it('average of a column, with an optional filter', () => {
    expect(buildKRQuery({ table: 'psitransmission', measure: 'average', column: 'tx_icduration', condition: { column: 'tx_icduration', op: 'gt', value: '0', kind: 'number' } }, 'postgres', 'psi').sql)
      .toBe('SELECT ROUND(AVG(tx_icduration), 1) AS value FROM psi.psitransmission WHERE tx_icduration > 0');
    expect(() => buildKRQuery({ table: 't', measure: 'average' }, 'postgres', 'psi')).toThrow(/column/);
  });

  it('a date column adds the bridge binds and flags the timeframe', () => {
    const built = buildKRQuery({ table: 'psitransmission', measure: 'count', condition: { column: 'tx_livesubtitling', op: 'eq', value: '1', kind: 'number' }, dateColumn: 'tx_txdate' }, 'postgres', 'psi');
    expect(built.usesTimeframe).toBe(true);
    expect(built.sql).toBe('SELECT COUNT(*) AS value FROM psi.psitransmission WHERE tx_livesubtitling = 1 AND tx_txdate >= :start_date AND tx_txdate <= :end_date');
  });

  it('quotes and escapes text literals; null checks take no value', () => {
    expect(buildKRQuery({ table: 't', measure: 'count', condition: { column: 'ch_kind', op: 'ne', value: "O'Reilly", kind: 'text' } }, 'postgres', 'psi').sql)
      .toBe("SELECT COUNT(*) AS value FROM psi.t WHERE ch_kind <> 'O''Reilly'");
    expect(buildKRQuery({ table: 't', measure: 'count', condition: { column: 'ch_kind', op: 'is_null' } }, 'postgres', 'psi').sql)
      .toBe('SELECT COUNT(*) AS value FROM psi.t WHERE ch_kind IS NULL');
    expect(buildKRQuery({ table: 't', measure: 'count', condition: { column: 'x', op: 'not_null' } }, 'oracle', 'psi').sql)
      .toBe('SELECT COUNT(*) AS value FROM PSI.T WHERE x IS NOT NULL');
  });

  it('a non-numeric value against a numeric column is refused, and unknown kinds infer', () => {
    expect(() => buildKRQuery({ table: 't', measure: 'count', condition: { column: 'n', op: 'eq', value: 'abc', kind: 'number' } }, 'postgres', 'psi')).toThrow(/not a number/);
    expect(buildKRQuery({ table: 't', measure: 'count', condition: { column: 'n', op: 'eq', value: '42' } }, 'postgres', 'psi').sql).toContain('n = 42');
    expect(buildKRQuery({ table: 't', measure: 'count', condition: { column: 'n', op: 'eq', value: 'TV' } }, 'postgres', 'psi').sql).toContain("n = 'TV'");
  });

  it('rejects anything that is not a plain identifier — no injection through names', () => {
    expect(() => buildKRQuery({ table: 't; DROP TABLE x', measure: 'count' }, 'postgres', 'psi')).toThrow(/Table/);
    expect(() => buildKRQuery({ table: 't', measure: 'count', condition: { column: 'a OR 1=1', op: 'is_null' } }, 'postgres', 'psi')).toThrow(/Column/);
    expect(() => buildKRQuery({ table: 't', measure: 'count', dateColumn: 'd--' }, 'postgres', 'psi')).toThrow(/Date column/);
    expect(() => qualifiedTable('t', 'postgres', 'bad schema')).toThrow(/Schema/);
  });

  it('defaults the schema per dialect when blank', () => {
    expect(qualifiedTable('t', 'postgres', '')).toBe('public.t');
    expect(qualifiedTable('t', 'oracle', ' ')).toBe('PSI.T');
  });
});

describe('columnKind', () => {
  it('classifies both dialects’ type names', () => {
    expect(columnKind('integer')).toBe('number');
    expect(columnKind('numeric')).toBe('number');
    expect(columnKind('NUMBER')).toBe('number');
    expect(columnKind('text')).toBe('text');
    expect(columnKind('VARCHAR2')).toBe('text');
    expect(columnKind('character varying')).toBe('text');
    expect(columnKind('timestamp without time zone')).toBe('date');
    expect(columnKind('DATE')).toBe('date');
  });
});
