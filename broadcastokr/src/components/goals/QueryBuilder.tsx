import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { Theme } from '../../types';
import type { DBConnection, TableInfo, ColumnInfo } from '../../hooks/useBridge';
import { COLOR_DANGER } from '../../constants/config';
import {
  buildKRQuery, columnKind, MEASURE_LABELS, OP_LABELS,
  type Measure, type ConditionOp, type KRQuerySpec,
} from '../../utils/queryBuilder';

export interface QueryBuilderProps {
  connection?: DBConnection;
  getTables?: (connectionId: string) => Promise<TableInfo[]>;
  getColumns?: (connectionId: string, tableName: string) => Promise<ColumnInfo[]>;
  /** Called with fresh SQL whenever the choices describe a complete query. */
  onSql: (sql: string, usesTimeframe: boolean) => void;
  theme: Theme;
  selectStyle: CSSProperties;
  inputStyle: CSSProperties;
  labelStyle: CSSProperties;
}

interface Choices {
  table: string;
  measure: Measure;
  column: string;
  condColumn: string;
  op: ConditionOp;
  value: string;
  dateColumn: string;
}

const EMPTY: Choices = { table: '', measure: 'count', column: '', condColumn: '', op: 'eq', value: '', dateColumn: '' };
const NEEDS_VALUE: ConditionOp[] = ['eq', 'ne', 'gt', 'lt'];

/** The SQL for a set of choices, or null while they are incomplete. Throws on bad input. */
function specFor(c: Choices, columns: ColumnInfo[]): KRQuerySpec | null {
  if (!c.table) return null;
  const needsValue = NEEDS_VALUE.includes(c.op);
  const kind = columns.find((x) => x.COLUMN_NAME === c.condColumn);
  const condition = c.condColumn
    ? { column: c.condColumn, op: c.op, value: needsValue ? c.value : undefined, kind: kind ? columnKind(kind.DATA_TYPE) : undefined }
    : undefined;
  if (c.measure === 'percent' && !condition) return null;
  if (c.measure === 'average' && !c.column) return null;
  if (condition && needsValue && !c.value.trim()) return null;
  return {
    table: c.table,
    measure: c.measure,
    column: c.measure === 'average' ? c.column : undefined,
    condition,
    dateColumn: c.dateColumn || undefined,
  };
}

/**
 * Three dropdowns instead of a blank SQL box: table, what to measure, and an
 * optional "where" and "last N days". Deterministic — the SQL comes from
 * buildKRQuery and lands in the editable textarea next to this, so the owner
 * always sees exactly what will run. Mount it with `key={connection.id}` so a
 * connection change starts the choices over.
 */
export function QueryBuilder({ connection, getTables, getColumns, onSql, theme, selectStyle, inputStyle, labelStyle }: QueryBuilderProps) {
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [choices, setChoices] = useState<Choices>(EMPTY);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const connectionId = connection?.id ?? '';
  const dialect = connection?.type ?? 'postgres';
  const schema = connection?.schema ?? '';

  // Fetch on connection/table change, not on callback identity: callers may
  // pass a fresh function each render, and re-fetching per render never settles.
  const fetchers = useRef({ getTables, getColumns });
  useEffect(() => { fetchers.current = { getTables, getColumns }; });

  useEffect(() => {
    const fetchTables = fetchers.current.getTables;
    if (!fetchTables || !connectionId) return;
    let live = true;
    fetchTables(connectionId)
      .then((t) => { if (live) { setTables(t); setStatus(t.length ? '' : 'No tables found in this schema — check the connection’s Schema field'); } })
      .catch((e) => { if (live) setStatus(`Could not load tables: ${(e as Error).message}`); });
    return () => { live = false; };
  }, [connectionId]);

  useEffect(() => {
    const fetchColumns = fetchers.current.getColumns;
    if (!fetchColumns || !connectionId || !choices.table) return;
    let live = true;
    fetchColumns(connectionId, choices.table)
      .then((c) => { if (live) setColumns(c); })
      .catch((e) => { if (live) setStatus(`Could not load columns: ${(e as Error).message}`); });
    return () => { live = false; };
  }, [connectionId, choices.table]);

  /** Every change goes through here: store it, then emit SQL if it is complete. */
  const update = (patch: Partial<Choices>, cols: ColumnInfo[] = columns) => {
    const next = { ...choices, ...patch };
    setChoices(next);
    try {
      const spec = specFor(next, cols);
      setError('');
      if (spec) {
        const built = buildKRQuery(spec, dialect, schema);
        onSql(built.sql, built.usesTimeframe);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const chooseTable = (table: string) => {
    setColumns([]);
    update({ table, column: '', condColumn: '', dateColumn: '' }, []);
  };

  const kindOf = (name: string) => {
    const c = columns.find((x) => x.COLUMN_NAME === name);
    return c ? columnKind(c.DATA_TYPE) : undefined;
  };
  const numberColumns = columns.filter((c) => columnKind(c.DATA_TYPE) === 'number');
  const dateColumns = columns.filter((c) => columnKind(c.DATA_TYPE) === 'date');
  const needsValue = NEEDS_VALUE.includes(choices.op);

  const sel = { ...selectStyle, width: '100%', padding: '6px 8px', fontSize: 11 };
  const inp = { ...inputStyle, padding: '6px 8px', fontSize: 11 };
  const lbl = { ...labelStyle, fontSize: 10 };

  if (!connectionId) {
    return <div style={{ fontSize: 11, color: theme.textFaint }}>Pick a connection first.</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 8, borderRadius: 6, border: `1px solid ${theme.borderLight}`, background: theme.bgMuted }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        <div>
          <label style={lbl}>Table</label>
          <select aria-label="Builder table" value={choices.table} onChange={(e) => chooseTable(e.target.value)} style={sel}>
            <option value="">Select…</option>
            {tables.map((t) => <option key={t.TABLE_NAME} value={t.TABLE_NAME}>{t.TABLE_NAME}</option>)}
          </select>
        </div>
        <div>
          <label style={lbl}>Measure</label>
          <select aria-label="Builder measure" value={choices.measure} onChange={(e) => update({ measure: e.target.value as Measure })} style={sel}>
            {(Object.keys(MEASURE_LABELS) as Measure[]).map((m) => <option key={m} value={m}>{MEASURE_LABELS[m]}</option>)}
          </select>
        </div>
      </div>

      {choices.measure === 'average' && (
        <div>
          <label style={lbl}>Of column</label>
          <select aria-label="Builder average column" value={choices.column} onChange={(e) => update({ column: e.target.value })} style={sel} disabled={!choices.table}>
            <option value="">Select…</option>
            {numberColumns.map((c) => <option key={c.COLUMN_NAME} value={c.COLUMN_NAME}>{c.COLUMN_NAME}</option>)}
          </select>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: needsValue ? '1fr 1fr 1fr' : '1fr 1fr', gap: 6 }}>
        <div>
          <label style={lbl}>{choices.measure === 'percent' ? 'Where column' : 'Only rows where (optional)'}</label>
          <select aria-label="Builder condition column" value={choices.condColumn} onChange={(e) => update({ condColumn: e.target.value })} style={sel} disabled={!choices.table}>
            <option value="">{choices.measure === 'percent' ? 'Select…' : 'All rows'}</option>
            {columns.map((c) => <option key={c.COLUMN_NAME} value={c.COLUMN_NAME}>{c.COLUMN_NAME}</option>)}
          </select>
        </div>
        <div>
          <label style={lbl}>Condition</label>
          <select aria-label="Builder operator" value={choices.op} onChange={(e) => update({ op: e.target.value as ConditionOp })} style={sel} disabled={!choices.condColumn}>
            {(Object.keys(OP_LABELS) as ConditionOp[]).map((o) => <option key={o} value={o}>{OP_LABELS[o]}</option>)}
          </select>
        </div>
        {needsValue && (
          <div>
            <label style={lbl}>Value</label>
            <input aria-label="Builder value" value={choices.value} onChange={(e) => update({ value: e.target.value })} placeholder={kindOf(choices.condColumn) === 'number' ? '1' : 'TV'} style={inp} disabled={!choices.condColumn} />
          </div>
        )}
      </div>

      {dateColumns.length > 0 && (
        <div>
          <label style={lbl}>Only the last N days, by date column (optional — N is the Timeframe above)</label>
          <select aria-label="Builder date column" value={choices.dateColumn} onChange={(e) => update({ dateColumn: e.target.value })} style={sel}>
            <option value="">All time</option>
            {dateColumns.map((c) => <option key={c.COLUMN_NAME} value={c.COLUMN_NAME}>{c.COLUMN_NAME}</option>)}
          </select>
        </div>
      )}

      {(status || error) && (
        <div style={{ fontSize: 10, color: error ? COLOR_DANGER : theme.textFaint }}>{error || status}</div>
      )}
    </div>
  );
}
