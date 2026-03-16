import { useState, useEffect } from 'react';
import type { Theme } from '../../types';
import type { DBConnection, KPIDefinition, KPITemplate, TableInfo, ColumnInfo } from '../../hooks/useBridge';
import { Modal } from '../ui/Modal';
import { PillBadge } from '../ui/PillBadge';
import { selectStyle as makeSelectStyle } from '../../utils/styles';
import { inputStyle, labelStyle, buttonStyle } from '../../styles/formStyles';
import { PRIMARY_COLOR, COLOR_DANGER, COLOR_INFO, COLOR_WARNING, COLOR_DB_POSTGRES, FONT_BODY, FONT_MONO } from '../../constants/config';

type Tab = 'connections' | 'templates' | 'custom' | 'manage';

interface KPIConfigModalProps {
  open: boolean;
  onClose: () => void;
  theme: Theme;
  connected: boolean;
  testConnection: (conn: Omit<DBConnection, 'id'>) => Promise<{ ok: boolean; message: string }>;
  getTables: (connectionId: string) => Promise<TableInfo[]>;
  getColumns: (connectionId: string, tableName: string) => Promise<ColumnInfo[]>;
  previewQuery: (connectionId: string, sql: string) => Promise<Record<string, unknown>[]>;
  getTemplates: () => Promise<KPITemplate[]>;
  saveKPI: (kpi: KPIDefinition) => Promise<{ ok: boolean; kpi: KPIDefinition }>;
  deleteKPI: (id: string) => Promise<void>;
  getKPIDefinitions: () => Promise<KPIDefinition[]>;
  getConnections: () => Promise<DBConnection[]>;
  saveConnection: (conn: DBConnection) => Promise<{ ok: boolean; connection: DBConnection }>;
  deleteConnection: (id: string) => Promise<void>;
}

/** @deprecated Use buttonStyle from formStyles.ts — kept temporarily for small variant */
const btnStyle = (bg: string) => buttonStyle(bg);

const defaultConn: Omit<DBConnection, 'id'> = {
  name: '',
  type: 'oracle',
  host: 'localhost',
  port: 1521,
  service: '',
  schema: '',
  user: '',
  password: '',
  clientDir: '',
};

export function KPIConfigModal({
  open, onClose, theme, connected,
  testConnection, getTables, getColumns, previewQuery,
  getTemplates, saveKPI, deleteKPI, getKPIDefinitions,
  getConnections, saveConnection, deleteConnection,
}: KPIConfigModalProps) {
  const [tab, setTab] = useState<Tab>('connections');
  const [templates, setTemplates] = useState<KPITemplate[]>([]);
  const [definitions, setDefinitions] = useState<KPIDefinition[]>([]);
  const [connections, setConnections] = useState<DBConnection[]>([]);
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [selectedTable, setSelectedTable] = useState('');
  const [preview, setPreview] = useState<Record<string, unknown>[]>([]);
  const [status, setStatus] = useState('');

  // Connection form
  const [connForm, setConnForm] = useState(defaultConn);
  const [connTestResult, setConnTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [connTesting, setConnTesting] = useState(false);

  // Custom KPI form
  const [kpiName, setKpiName] = useState('');
  const [kpiSql, setKpiSql] = useState('');
  const [kpiUnit, setKpiUnit] = useState('');
  const [kpiDirection, setKpiDirection] = useState<'hi' | 'lo'>('hi');
  const [kpiTarget, setKpiTarget] = useState('');
  const [kpiTimeframe, setKpiTimeframe] = useState('30');
  const [kpiConnId, setKpiConnId] = useState('');

  const selStyle = makeSelectStyle(theme);
  const iStyle = inputStyle(theme);
  const lStyle = labelStyle(theme);
  // btnStyle is now imported from formStyles via the compat wrapper above

  useEffect(() => {
    if (!open || !connected) return;
    getTemplates().then(setTemplates).catch(() => {});
    getKPIDefinitions().then(setDefinitions).catch(() => {});
    getConnections().then((conns) => {
      setConnections(conns);
      if (conns.length > 0 && !kpiConnId) setKpiConnId(conns[0].id);
    }).catch(() => {});
  }, [open, connected, getTemplates, getKPIDefinitions, getConnections, kpiConnId]);

  // Connection management
  const handleTestConnection = async () => {
    setConnTesting(true);
    setConnTestResult(null);
    try {
      const result = await testConnection(connForm);
      setConnTestResult(result);
    } catch (e) {
      setConnTestResult({ ok: false, message: (e as Error).message });
    }
    setConnTesting(false);
  };

  const handleSaveConnection = async () => {
    if (!connForm.name || !connForm.host || !connForm.user) {
      setStatus('Please fill in name, host, and user.'); return;
    }
    try {
      const id = `conn_${Date.now()}`;
      await saveConnection({ ...connForm, id } as DBConnection);
      setStatus(`Connection "${connForm.name}" saved!`);
      setConnForm(defaultConn);
      setConnTestResult(null);
      const conns = await getConnections();
      setConnections(conns);
      if (!kpiConnId && conns.length > 0) setKpiConnId(conns[0].id);
    } catch (e) {
      setStatus(`Error: ${(e as Error).message}`);
    }
  };

  const handleDeleteConnection = async (id: string) => {
    try {
      await deleteConnection(id);
      setConnections((prev) => prev.filter((c) => c.id !== id));
      setStatus('Connection deleted.');
    } catch (e) {
      setStatus(`Error: ${(e as Error).message}`);
    }
  };

  // Schema browser
  const loadTables = async () => {
    if (!kpiConnId) { setStatus('Select a connection first.'); return; }
    try {
      setStatus('Loading tables...');
      const t = await getTables(kpiConnId);
      setTables(t);
      setStatus(`Found ${t.length} tables`);
    } catch (e) {
      setStatus(`Error: ${(e as Error).message}`);
    }
  };

  const loadColumns = async (tableName: string) => {
    setSelectedTable(tableName);
    try {
      const c = await getColumns(kpiConnId, tableName);
      setColumns(c);
    } catch (e) {
      setStatus(`Error: ${(e as Error).message}`);
    }
  };

  const runPreview = async () => {
    if (!kpiSql.trim() || !kpiConnId) return;
    try {
      setStatus('Running preview...');
      const rows = await previewQuery(kpiConnId, kpiSql);
      setPreview(rows);
      setStatus(`Preview: ${rows.length} rows`);
    } catch (e) {
      setStatus(`Error: ${(e as Error).message}`);
      setPreview([]);
    }
  };

  const saveCustomKPI = async () => {
    if (!kpiName || !kpiSql || !kpiTarget || !kpiConnId) {
      setStatus('Please fill in name, SQL, target, and select a connection.'); return;
    }
    try {
      setStatus('Saving...');
      await saveKPI({
        id: `kpi_${Date.now()}`,
        name: kpiName,
        connectionId: kpiConnId,
        sql: kpiSql,
        unit: kpiUnit || 'count',
        direction: kpiDirection,
        target: Number(kpiTarget),
        timeframeDays: Number(kpiTimeframe) || undefined,
      });
      setStatus('KPI saved!');
      setKpiName(''); setKpiSql(''); setKpiUnit(''); setKpiTarget('');
      const defs = await getKPIDefinitions();
      setDefinitions(defs);
    } catch (e) {
      setStatus(`Error: ${(e as Error).message}`);
    }
  };

  const addTemplate = async (tmpl: KPITemplate) => {
    // Find matching connection for template dbType
    const matchConn = connections.find(c => c.type === (tmpl.dbType || 'oracle')) || connections[0];
    if (!matchConn) { setStatus('Add a connection first.'); return; }
    try {
      setStatus('Adding KPI from template...');
      await saveKPI({
        id: `kpi_${Date.now()}`,
        name: tmpl.name,
        connectionId: matchConn.id,
        sql: tmpl.sql,
        unit: tmpl.unit,
        direction: tmpl.direction,
        target: tmpl.target,
        timeframeDays: tmpl.timeframeDays,
      });
      setStatus(`Added: ${tmpl.name}`);
      const defs = await getKPIDefinitions();
      setDefinitions(defs);
    } catch (e) {
      setStatus(`Error: ${(e as Error).message}`);
    }
  };

  const handleDeleteKPI = async (id: string) => {
    try {
      await deleteKPI(id);
      setDefinitions((prev) => prev.filter((d) => d.id !== id));
      setStatus('KPI deleted.');
    } catch (e) {
      setStatus(`Error: ${(e as Error).message}`);
    }
  };

  const tabBtn = (t: Tab, label: string) => (
    <button
      onClick={() => setTab(t)}
      style={{
        background: tab === t ? PRIMARY_COLOR : 'transparent',
        color: tab === t ? '#fff' : theme.textMuted,
        border: `1px solid ${tab === t ? PRIMARY_COLOR : theme.border}`,
        borderRadius: 6,
        padding: '6px 14px',
        fontSize: 12,
        fontWeight: 600,
        cursor: 'pointer',
        fontFamily: FONT_BODY,
      }}
    >
      {label}
    </button>
  );

  const updateConnForm = (field: string, value: string | number) => {
    setConnForm((prev) => ({
      ...prev,
      [field]: value,
      ...(field === 'type' ? { port: value === 'postgres' ? 5432 : 1521 } : {}),
    }));
  };

  return (
    <Modal open={open} onClose={onClose} title="Configure Live KPIs" width={760} theme={theme}>
      {!connected ? (
        <div style={{ textAlign: 'center', padding: 24, color: theme.textFaint }}>
          <p style={{ fontSize: 14, marginBottom: 8 }}>Bridge service is not running.</p>
          <p style={{ fontSize: 12 }}>Start it with: <code style={{ background: theme.bgMuted, padding: '2px 6px', borderRadius: 4 }}>npm run bridge</code></p>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            {tabBtn('connections', `Connections (${connections.length})`)}
            {tabBtn('templates', 'Templates')}
            {tabBtn('custom', 'Custom KPI')}
            {tabBtn('manage', `Manage (${definitions.length})`)}
          </div>

          {/* Connections tab */}
          {tab === 'connections' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Existing connections */}
              {connections.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: theme.text }}>Saved Connections</div>
                  {connections.map((conn) => (
                    <div key={conn.id} style={{
                      padding: '10px 14px',
                      borderRadius: 8,
                      background: theme.bgMuted,
                      border: `1px solid ${theme.borderLight}`,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                    }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>{conn.name}</div>
                        <div style={{ fontSize: 11, color: theme.textFaint, marginTop: 2 }}>
                          {conn.type === 'postgres' ? 'PostgreSQL' : 'Oracle'} &middot; {conn.host}:{conn.port}/{conn.service}
                          {conn.schema ? ` (${conn.schema})` : ''}
                        </div>
                      </div>
                      <PillBadge label={conn.type === 'postgres' ? 'PG' : 'ORA'} color={conn.type === 'postgres' ? COLOR_DB_POSTGRES : COLOR_WARNING} bold />
                      <button onClick={() => handleDeleteConnection(conn.id)} style={{ ...btnStyle('#F87171'), padding: '4px 10px' }} aria-label={`Delete ${conn.name}`}>
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add new connection form */}
              <div style={{ padding: 14, borderRadius: 8, background: theme.bgMuted, border: `1px solid ${theme.borderLight}` }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: theme.text, marginBottom: 10 }}>Add Connection</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={lStyle}>Name</label>
                    <input value={connForm.name} onChange={(e) => updateConnForm('name', e.target.value)} placeholder="e.g. WHATS'ON Production" style={iStyle} aria-label="Connection name" />
                  </div>
                  <div>
                    <label style={lStyle}>Type</label>
                    <select value={connForm.type} onChange={(e) => updateConnForm('type', e.target.value)} style={selStyle} aria-label="Database type">
                      <option value="oracle">Oracle</option>
                      <option value="postgres">PostgreSQL</option>
                    </select>
                  </div>
                  <div>
                    <label style={lStyle}>Host</label>
                    <input value={connForm.host} onChange={(e) => updateConnForm('host', e.target.value)} placeholder="localhost" style={iStyle} aria-label="Host" />
                  </div>
                  <div>
                    <label style={lStyle}>Port</label>
                    <input value={connForm.port} onChange={(e) => updateConnForm('port', Number(e.target.value))} type="number" style={iStyle} aria-label="Port" />
                  </div>
                  <div>
                    <label style={lStyle}>{connForm.type === 'postgres' ? 'Database' : 'Service/SID'}</label>
                    <input value={connForm.service} onChange={(e) => updateConnForm('service', e.target.value)} placeholder={connForm.type === 'postgres' ? 'whatson' : 'ORCL'} style={iStyle} aria-label="Service or database name" />
                  </div>
                  <div>
                    <label style={lStyle}>Schema</label>
                    <input value={connForm.schema} onChange={(e) => updateConnForm('schema', e.target.value)} placeholder={connForm.type === 'postgres' ? 'public' : 'PSI'} style={iStyle} aria-label="Schema" />
                  </div>
                  <div>
                    <label style={lStyle}>User</label>
                    <input value={connForm.user} onChange={(e) => updateConnForm('user', e.target.value)} placeholder="psi" style={iStyle} aria-label="Username" />
                  </div>
                  <div>
                    <label style={lStyle}>Password</label>
                    <input value={connForm.password} onChange={(e) => updateConnForm('password', e.target.value)} type="password" style={iStyle} aria-label="Password" />
                  </div>
                  {connForm.type === 'oracle' && (
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label style={lStyle}>Oracle Client Directory (optional)</label>
                      <input value={connForm.clientDir || ''} onChange={(e) => updateConnForm('clientDir', e.target.value)} placeholder="C:\\Oracle\\19c\\db_home\\bin" style={iStyle} aria-label="Oracle client directory" />
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
                  <button onClick={handleTestConnection} disabled={connTesting} style={btnStyle(COLOR_INFO)}>
                    {connTesting ? 'Testing...' : 'Test Connection'}
                  </button>
                  <button onClick={handleSaveConnection} style={btnStyle(PRIMARY_COLOR)}>Save Connection</button>
                  {connTestResult && (
                    <PillBadge
                      label={connTestResult.ok ? 'Connected' : 'Failed'}
                      color={connTestResult.ok ? '#2DD4BF' : '#F87171'}
                      bold
                    />
                  )}
                  {connTestResult && !connTestResult.ok && (
                    <span style={{ fontSize: 11, color: COLOR_DANGER }}>{connTestResult.message}</span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Templates tab */}
          {tab === 'templates' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {connections.length === 0 && (
                <div style={{ padding: 12, borderRadius: 8, background: `${COLOR_WARNING}18`, border: `1px solid ${COLOR_WARNING}4D`, fontSize: 12, color: COLOR_WARNING }}>
                  Add a connection first in the Connections tab before adding KPI templates.
                </div>
              )}
              {templates.map((tmpl, i) => {
                const t = tmpl;
                const alreadyAdded = definitions.some((d) => d.name === t.name);
                return (
                  <div key={i} style={{
                    padding: '12px 14px',
                    borderRadius: 8,
                    background: theme.bgMuted,
                    border: `1px solid ${theme.borderLight}`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>{t.name}</span>
                        {t.dbType && (
                          <PillBadge
                            label={t.dbType === 'postgres' ? 'PG' : 'ORA'}
                            color={t.dbType === 'postgres' ? COLOR_DB_POSTGRES : COLOR_WARNING}
                          />
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: theme.textFaint, marginTop: 2 }}>{t.description}</div>
                      <div style={{ fontSize: 10, color: theme.textMuted, marginTop: 4 }}>
                        Target: {t.target}{t.unit} | {t.direction === 'hi' ? 'Higher is better' : 'Lower is better'}
                        {t.timeframeDays ? ` | ${t.timeframeDays}d window` : ''}
                      </div>
                    </div>
                    {alreadyAdded ? (
                      <PillBadge label="Added" color="#2DD4BF" bold />
                    ) : (
                      <button onClick={() => addTemplate(t)} disabled={connections.length === 0} style={btnStyle(connections.length === 0 ? '#666' : PRIMARY_COLOR)}>Add</button>
                    )}
                  </div>
                );
              })}
              {templates.length === 0 && (
                <div style={{ color: theme.textFaint, fontSize: 13, textAlign: 'center', padding: 20 }}>Loading templates...</div>
              )}
            </div>
          )}

          {/* Custom KPI tab */}
          {tab === 'custom' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {connections.length === 0 && (
                <div style={{ padding: 12, borderRadius: 8, background: `${COLOR_WARNING}18`, border: `1px solid ${COLOR_WARNING}4D`, fontSize: 12, color: COLOR_WARNING }}>
                  Add a connection first in the Connections tab.
                </div>
              )}

              {/* Connection selector */}
              {connections.length > 0 && (
                <div>
                  <label style={lStyle}>Connection</label>
                  <select value={kpiConnId} onChange={(e) => { setKpiConnId(e.target.value); setTables([]); setColumns([]); }} style={selStyle} aria-label="Select connection">
                    {connections.map((c) => (
                      <option key={c.id} value={c.id}>{c.name} ({c.type === 'postgres' ? 'PG' : 'Oracle'})</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Schema browser */}
              <div style={{ padding: 12, borderRadius: 8, background: theme.bgMuted, border: `1px solid ${theme.borderLight}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>Schema Browser</span>
                  <button onClick={loadTables} disabled={!kpiConnId} style={btnStyle(kpiConnId ? PRIMARY_COLOR : '#666')}>Load Tables</button>
                </div>
                {tables.length > 0 && (
                  <div style={{ display: 'flex', gap: 12, maxHeight: 180, overflow: 'hidden' }}>
                    <div style={{ flex: 1, overflow: 'auto', maxHeight: 180 }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: theme.textMuted, marginBottom: 4 }}>Tables</div>
                      {tables.map((t) => (
                        <div
                          key={t.TABLE_NAME}
                          onClick={() => loadColumns(t.TABLE_NAME)}
                          style={{
                            padding: '3px 6px', fontSize: 11, cursor: 'pointer', borderRadius: 4,
                            background: selectedTable === t.TABLE_NAME ? '#3805E320' : 'transparent',
                            color: selectedTable === t.TABLE_NAME ? PRIMARY_COLOR : theme.text,
                            fontFamily: FONT_MONO,
                          }}
                        >
                          {t.TABLE_NAME} {t.NUM_ROWS !== null && <span style={{ color: theme.textFaint }}>({t.NUM_ROWS})</span>}
                        </div>
                      ))}
                    </div>
                    {columns.length > 0 && (
                      <div style={{ flex: 1, overflow: 'auto', maxHeight: 180 }}>
                        <div style={{ fontSize: 10, fontWeight: 600, color: theme.textMuted, marginBottom: 4 }}>{selectedTable} Columns</div>
                        {columns.map((c) => (
                          <div key={c.COLUMN_NAME} style={{ padding: '2px 6px', fontSize: 11, fontFamily: FONT_MONO, color: theme.text }}>
                            <span>{c.COLUMN_NAME}</span>
                            <span style={{ color: theme.textFaint, marginLeft: 6, fontSize: 10 }}>{c.DATA_TYPE}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Form fields */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={lStyle}>KPI Name</label>
                  <input value={kpiName} onChange={(e) => setKpiName(e.target.value)} placeholder="e.g. Live Subtitling Count" style={iStyle} aria-label="KPI name" />
                </div>
                <div>
                  <label style={lStyle}>Unit</label>
                  <input value={kpiUnit} onChange={(e) => setKpiUnit(e.target.value)} placeholder="e.g. tx, %, items" style={iStyle} aria-label="KPI unit" />
                </div>
              </div>

              <div>
                <label style={lStyle}>SQL Query (must return a single numeric value)</label>
                <textarea
                  value={kpiSql}
                  onChange={(e) => setKpiSql(e.target.value)}
                  placeholder="SELECT COUNT(*) AS value FROM ..."
                  rows={4}
                  style={{ ...iStyle, resize: 'vertical', fontFamily: FONT_MONO, fontSize: 11 }}
                  aria-label="SQL query"
                />
                <button onClick={runPreview} disabled={!kpiConnId} style={{ ...btnStyle(kpiConnId ? COLOR_INFO : '#666'), marginTop: 6 }}>Preview Query</button>
              </div>

              {preview.length > 0 && (
                <div style={{ padding: 8, borderRadius: 6, background: theme.bgMuted, fontSize: 11, fontFamily: FONT_MONO, maxHeight: 120, overflow: 'auto' }}>
                  {preview.map((row, i) => (
                    <div key={i} style={{ color: theme.text }}>{JSON.stringify(row)}</div>
                  ))}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <div>
                  <label style={lStyle}>Target</label>
                  <input value={kpiTarget} onChange={(e) => setKpiTarget(e.target.value)} type="number" placeholder="100" style={iStyle} aria-label="Target value" />
                </div>
                <div>
                  <label style={lStyle}>Direction</label>
                  <select value={kpiDirection} onChange={(e) => setKpiDirection(e.target.value as 'hi' | 'lo')} style={selStyle} aria-label="Direction">
                    <option value="hi">Higher is better</option>
                    <option value="lo">Lower is better</option>
                  </select>
                </div>
                <div>
                  <label style={lStyle}>Timeframe (days)</label>
                  <input value={kpiTimeframe} onChange={(e) => setKpiTimeframe(e.target.value)} type="number" placeholder="30" style={iStyle} aria-label="Timeframe in days" />
                </div>
              </div>

              <button onClick={saveCustomKPI} disabled={connections.length === 0} style={btnStyle(connections.length === 0 ? '#666' : PRIMARY_COLOR)}>Save KPI</button>
            </div>
          )}

          {/* Manage tab */}
          {tab === 'manage' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {definitions.length === 0 ? (
                <div style={{ color: theme.textFaint, fontSize: 13, textAlign: 'center', padding: 20 }}>No KPIs configured yet.</div>
              ) : definitions.map((def) => {
                const conn = connections.find(c => c.id === def.connectionId);
                return (
                  <div key={def.id} style={{
                    padding: '10px 14px',
                    borderRadius: 8,
                    background: theme.bgMuted,
                    border: `1px solid ${theme.borderLight}`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>{def.name}</span>
                        {conn && <PillBadge label={conn.type === 'postgres' ? 'PG' : 'ORA'} color={conn.type === 'postgres' ? COLOR_DB_POSTGRES : COLOR_WARNING} />}
                      </div>
                      <div style={{ fontSize: 10, color: theme.textFaint, marginTop: 2, fontFamily: FONT_MONO, maxWidth: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {def.sql}
                      </div>
                      <div style={{ fontSize: 10, color: theme.textMuted, marginTop: 2 }}>
                        Target: {def.target}{def.unit} | {def.direction === 'hi' ? 'Higher' : 'Lower'} is better
                        {def.timeframeDays ? ` | ${def.timeframeDays}d` : ''}
                        {conn ? ` | ${conn.name}` : ''}
                      </div>
                    </div>
                    <button onClick={() => handleDeleteKPI(def.id)} style={{ ...btnStyle('#F87171'), padding: '4px 10px' }} aria-label={`Delete ${def.name}`}>Delete</button>
                  </div>
                );
              })}
            </div>
          )}

          {status && (
            <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 12, padding: '6px 10px', borderRadius: 6, background: theme.bgMuted }}>
              {status}
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
