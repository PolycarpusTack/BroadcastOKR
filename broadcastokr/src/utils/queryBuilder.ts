/**
 * Deterministic SQL for the guided KR builder. Every Key Result asked for so far
 * is one of three shapes — count of rows, percent of rows where X, average of a
 * column — optionally limited to the last N days. This turns those choices into
 * the single-value SELECT the bridge expects, per dialect, with no model in the
 * loop: the generated SQL is shown and stays editable.
 *
 * Safety is the bridge's (SELECT-only, owner-only ad hoc execution); this file
 * only has to be correct. Identifiers are validated, literals are quoted and
 * escaped, and the date window uses the bridge's own binds so `timeframeDays`
 * drives it exactly as it does for presets.
 */

export type Dialect = 'oracle' | 'postgres';
export type Measure = 'count' | 'percent' | 'average';
export type ConditionOp = 'eq' | 'ne' | 'gt' | 'lt' | 'is_null' | 'not_null';
export type ColumnKind = 'number' | 'text' | 'date';

export interface QueryCondition {
  column: string;
  op: ConditionOp;
  /** Ignored for is_null / not_null. */
  value?: string;
  /** How to quote `value`; the UI derives it from the column's type. */
  kind?: ColumnKind;
}

export interface KRQuerySpec {
  table: string;
  measure: Measure;
  /** The column to average (measure = 'average'). */
  column?: string;
  /** Required for 'percent' (the "where X" part); optional filter otherwise. */
  condition?: QueryCondition;
  /** A date/timestamp column → "last N days" via :start_date / :end_date. */
  dateColumn?: string;
}

export interface BuiltQuery {
  sql: string;
  /** True when the SQL binds :start_date/:end_date — timeframeDays must be set. */
  usesTimeframe: boolean;
}

export const MEASURE_LABELS: Record<Measure, string> = {
  count: 'Count of rows',
  percent: 'Percent of rows where…',
  average: 'Average of a column',
};

export const OP_LABELS: Record<ConditionOp, string> = {
  eq: 'equals',
  ne: 'does not equal',
  gt: 'is greater than',
  lt: 'is less than',
  is_null: 'is empty',
  not_null: 'is set',
};

const IDENT = /^[A-Za-z_][A-Za-z0-9_$#]*$/;
const NUMERIC = /^-?\d+(\.\d+)?$/;

function ident(name: string, what: string): string {
  if (!IDENT.test(name)) throw new Error(`${what} "${name}" is not a plain identifier`);
  return name;
}

/** Classify a column from the schema browser's DATA_TYPE (either dialect). */
export function columnKind(dataType: string): ColumnKind {
  const t = dataType.toLowerCase();
  if (/date|time/.test(t)) return 'date';
  if (/int|num|dec|float|double|real|serial|money/.test(t)) return 'number';
  return 'text';
}

function literal(value: string | undefined, kind: ColumnKind | undefined): string {
  const v = (value ?? '').trim();
  if (kind === 'number' || (kind === undefined && NUMERIC.test(v))) {
    if (!NUMERIC.test(v)) throw new Error(`"${v}" is not a number`);
    return v;
  }
  return `'${v.replace(/'/g, "''")}'`;
}

function conditionSql(c: QueryCondition): string {
  const col = ident(c.column, 'Column');
  switch (c.op) {
    case 'is_null': return `${col} IS NULL`;
    case 'not_null': return `${col} IS NOT NULL`;
    case 'eq': return `${col} = ${literal(c.value, c.kind)}`;
    case 'ne': return `${col} <> ${literal(c.value, c.kind)}`;
    case 'gt': return `${col} > ${literal(c.value, c.kind)}`;
    case 'lt': return `${col} < ${literal(c.value, c.kind)}`;
  }
}

/** schema.table with the dialect's identifier case (PG folds down, Oracle up). */
export function qualifiedTable(table: string, dialect: Dialect, schema: string): string {
  const s = ident(schema.trim() || (dialect === 'postgres' ? 'public' : 'PSI'), 'Schema');
  const t = ident(table, 'Table');
  return dialect === 'postgres' ? `${s.toLowerCase()}.${t.toLowerCase()}` : `${s.toUpperCase()}.${t.toUpperCase()}`;
}

export function buildKRQuery(spec: KRQuerySpec, dialect: Dialect, schema: string): BuiltQuery {
  const from = qualifiedTable(spec.table, dialect, schema);
  const where: string[] = [];
  let usesTimeframe = false;

  if (spec.dateColumn) {
    const d = ident(spec.dateColumn, 'Date column');
    where.push(`${d} >= :start_date AND ${d} <= :end_date`);
    usesTimeframe = true;
  }

  let select: string;
  switch (spec.measure) {
    case 'count':
      if (spec.condition) where.unshift(conditionSql(spec.condition));
      select = 'COUNT(*)';
      break;
    case 'percent': {
      if (!spec.condition) throw new Error('Percent needs a condition: percent of rows where…');
      const hit = `SUM(CASE WHEN ${conditionSql(spec.condition)} THEN 1 ELSE 0 END)`;
      // NULLIF: an empty table yields NULL (the bridge reports "no numeric
      // value") instead of a division error.
      select = dialect === 'postgres'
        ? `ROUND(100.0 * ${hit} / NULLIF(COUNT(*), 0), 1)`
        : `ROUND(${hit} / NULLIF(COUNT(*), 0) * 100, 1)`;
      break;
    }
    case 'average': {
      if (!spec.column) throw new Error('Average needs a column');
      if (spec.condition) where.unshift(conditionSql(spec.condition));
      select = `ROUND(AVG(${ident(spec.column, 'Column')}), 1)`;
      break;
    }
  }

  const sql = `SELECT ${select} AS value FROM ${from}${where.length ? ` WHERE ${where.join(' AND ')}` : ''}`;
  return { sql, usesTimeframe };
}
