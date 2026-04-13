import { useState, type CSSProperties } from 'react';
import type { Theme, LiveKRConfig } from '../../types';
import type { DBConnection, TableInfo, ColumnInfo } from '../../hooks/useBridge';
import { PRIMARY_COLOR, COLOR_INFO, FONT_MONO } from '../../constants/config';
import type { GoalFormKR } from './GoalFormFields';

export interface LiveKRConfigPanelProps {
  config: LiveKRConfig;
  target: number;
  start: number;
  onUpdateConfig: (patch: Partial<LiveKRConfig>) => void;
  onUpdateKR: (patch: Partial<GoalFormKR>) => void;
  connections: DBConnection[];
  getTables?: (connectionId: string) => Promise<TableInfo[]>;
  getColumns?: (connectionId: string, tableName: string) => Promise<ColumnInfo[]>;
  previewQuery?: (connectionId: string, sql: string) => Promise<Record<string, unknown>[]>;
  theme: Theme;
  selectStyle: CSSProperties;
  inputStyle: CSSProperties;
  labelStyle: CSSProperties;
}

/** Inline panel for configuring a live KR's database query */
export function LiveKRConfigPanel({
  config, target, start, onUpdateConfig, onUpdateKR,
  connections, getTables, getColumns, previewQuery,
  theme, selectStyle, inputStyle, labelStyle,
}: LiveKRConfigPanelProps) {
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [selectedTable, setSelectedTable] = useState('');
  const [preview, setPreview] = useState<Record<string, unknown>[]>([]);
  const [status, setStatus] = useState('');
  const [showSchema, setShowSchema] = useState(false);

  const loadTables = async () => {
    if (!getTables || !config.connectionId) return;
    try {
      setStatus('Loading tables...');
      const t = await getTables(config.connectionId);
      setTables(t);
      setStatus(`${t.length} tables`);
      setShowSchema(true);
    } catch (e) {
      setStatus(`Error: ${(e as Error).message}`);
    }
  };

  const loadColumns = async (tableName: string) => {
    if (!getColumns || !config.connectionId) return;
    setSelectedTable(tableName);
    try {
      const c = await getColumns(config.connectionId, tableName);
      setColumns(c);
    } catch (e) {
      setStatus(`Error: ${(e as Error).message}`);
    }
  };

  const runPreview = async () => {
    if (!previewQuery || !config.connectionId || !config.sql.trim()) return;
    try {
      setStatus('Running preview...');
      const rows = await previewQuery(config.connectionId, config.sql);
      setPreview(rows);
      setStatus(`${rows.length} rows returned`);
    } catch (e) {
      setStatus(`Error: ${(e as Error).message}`);
      setPreview([]);
    }
  };

  const smallBtn = (bg: string, disabled = false): CSSProperties => ({
    background: disabled ? '#555' : bg,
    color: '#fff',
    border: 'none',
    borderRadius: 4,
    padding: '3px 8px',
    fontSize: 10,
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1,
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4 }}>
      {/* Connection + Direction + Unit + Target */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 6 }}>
        <div>
          <label style={{ ...labelStyle, fontSize: 10 }}>Connection</label>
          <select
            value={config.connectionId}
            onChange={(e) => { onUpdateConfig({ connectionId: e.target.value }); setTables([]); setColumns([]); }}
            style={{ ...selectStyle, width: '100%', padding: '6px 8px', fontSize: 11 }}
            aria-label="KR connection"
          >
            <option value="">Select...</option>
            {connections.map((c) => (
              <option key={c.id} value={c.id}>{c.name} ({c.type === 'postgres' ? 'PG' : 'ORA'})</option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ ...labelStyle, fontSize: 10 }}>Direction</label>
          <select
            value={config.direction}
            onChange={(e) => onUpdateConfig({ direction: e.target.value as 'hi' | 'lo' })}
            style={{ ...selectStyle, width: '100%', padding: '6px 8px', fontSize: 11 }}
            aria-label="KR direction"
          >
            <option value="hi">Higher is better</option>
            <option value="lo">Lower is better</option>
          </select>
        </div>
        <div>
          <label style={{ ...labelStyle, fontSize: 10 }}>Target</label>
          <input
            type="number"
            value={target}
            onChange={(e) => onUpdateKR({ target: Number(e.target.value) })}
            style={{ ...inputStyle, padding: '6px 8px', fontSize: 11 }}
            aria-label="KR target"
          />
        </div>
        <div>
          <label style={{ ...labelStyle, fontSize: 10 }}>Start</label>
          <input
            type="number"
            value={start}
            onChange={(e) => onUpdateKR({ start: Number(e.target.value) })}
            style={{ ...inputStyle, padding: '6px 8px', fontSize: 11 }}
            aria-label="KR start value"
          />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        <div>
          <label style={{ ...labelStyle, fontSize: 10 }}>Unit</label>
          <input
            value={config.unit}
            onChange={(e) => onUpdateConfig({ unit: e.target.value })}
            placeholder="e.g. tx, %, items"
            style={{ ...inputStyle, padding: '6px 8px', fontSize: 11 }}
            aria-label="KR unit"
          />
        </div>
        <div>
          <label style={{ ...labelStyle, fontSize: 10 }}>Timeframe (days)</label>
          <input
            type="number"
            value={config.timeframeDays || ''}
            onChange={(e) => onUpdateConfig({ timeframeDays: Number(e.target.value) || undefined })}
            placeholder="30"
            style={{ ...inputStyle, padding: '6px 8px', fontSize: 11 }}
            aria-label="KR timeframe"
          />
        </div>
      </div>

      {/* SQL Query */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <label style={{ ...labelStyle, fontSize: 10, marginBottom: 0 }}>SQL Query (must return a single numeric value)</label>
          <button onClick={() => setShowSchema(!showSchema)} style={smallBtn(PRIMARY_COLOR)} type="button">
            {showSchema ? 'Hide Schema' : 'Schema'}
          </button>
          <button onClick={loadTables} disabled={!config.connectionId} style={smallBtn(config.connectionId ? PRIMARY_COLOR : '#666', !config.connectionId)} type="button">
            Load Tables
          </button>
        </div>
        <textarea
          value={config.sql}
          onChange={(e) => onUpdateConfig({ sql: e.target.value })}
          placeholder="SELECT COUNT(*) AS value FROM ..."
          rows={3}
          style={{ ...inputStyle, padding: '6px 8px', fontSize: 11, fontFamily: FONT_MONO, resize: 'vertical' as const }}
          aria-label="KR SQL query"
        />
        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
          <button onClick={runPreview} disabled={!config.connectionId || !config.sql.trim()} style={smallBtn(COLOR_INFO, !config.connectionId || !config.sql.trim())} type="button">
            Preview
          </button>
          {status && <span style={{ fontSize: 10, color: theme.textFaint, lineHeight: '20px' }}>{status}</span>}
        </div>
      </div>

      {/* Schema browser */}
      {showSchema && tables.length > 0 && (
        <div style={{ display: 'flex', gap: 8, maxHeight: 130, overflow: 'hidden', fontSize: 10 }}>
          <div style={{ flex: 1, overflow: 'auto', maxHeight: 130 }}>
            <div style={{ fontWeight: 600, color: theme.textMuted, marginBottom: 2 }}>Tables</div>
            {tables.map((t) => (
              <div
                key={t.TABLE_NAME}
                onClick={() => loadColumns(t.TABLE_NAME)}
                style={{
                  padding: '2px 4px', cursor: 'pointer', borderRadius: 3,
                  background: selectedTable === t.TABLE_NAME ? `${PRIMARY_COLOR}20` : 'transparent',
                  color: selectedTable === t.TABLE_NAME ? PRIMARY_COLOR : theme.text,
                  fontFamily: FONT_MONO,
                }}
              >
                {t.TABLE_NAME}
              </div>
            ))}
          </div>
          {columns.length > 0 && (
            <div style={{ flex: 1, overflow: 'auto', maxHeight: 130 }}>
              <div style={{ fontWeight: 600, color: theme.textMuted, marginBottom: 2 }}>{selectedTable}</div>
              {columns.map((c) => (
                <div key={c.COLUMN_NAME} style={{ padding: '1px 4px', fontFamily: FONT_MONO, color: theme.text }}>
                  {c.COLUMN_NAME} <span style={{ color: theme.textFaint }}>{c.DATA_TYPE}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Preview results */}
      {preview.length > 0 && (
        <div style={{ padding: 6, borderRadius: 4, background: theme.bgInput, fontSize: 10, fontFamily: FONT_MONO, maxHeight: 80, overflow: 'auto' }}>
          {preview.map((row, ri) => (
            <div key={ri} style={{ color: theme.text }}>{JSON.stringify(row)}</div>
          ))}
        </div>
      )}
    </div>
  );
}
