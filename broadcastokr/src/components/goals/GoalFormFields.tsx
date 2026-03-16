import { useState, useMemo, useRef, useEffect, type CSSProperties } from 'react';
import { CHANNELS, USERS } from '../../constants';
import type { Theme, LiveKRConfig, Client, ClientChannel } from '../../types';
import type { DBConnection, TableInfo, ColumnInfo } from '../../hooks/useBridge';
import { PRIMARY_COLOR, COLOR_DANGER, COLOR_INFO, FONT_MONO } from '../../constants/config';

export interface GoalFormKR {
  title: string;
  start: number;
  target: number;
  /** If present, this KR is live — synced from a database */
  liveConfig?: LiveKRConfig;
}

interface GoalFormFieldsProps {
  title: string;
  setTitle: (v: string) => void;
  channel: number;
  setChannel: (v: number) => void;
  owner: number;
  setOwner: (v: number) => void;
  period: string;
  setPeriod: (v: string) => void;
  krs: GoalFormKR[];
  setKRs: (v: GoalFormKR[]) => void;
  theme: Theme;
  selectStyle: CSSProperties;
  /** Database connections available (empty = bridge not connected) */
  connections?: DBConnection[];
  /** Get tables for a connection */
  getTables?: (connectionId: string) => Promise<TableInfo[]>;
  /** Get columns for a table */
  getColumns?: (connectionId: string, tableName: string) => Promise<ColumnInfo[]>;
  /** Preview SQL query */
  previewQuery?: (connectionId: string, sql: string) => Promise<Record<string, unknown>[]>;
  /** Available clients (empty = no client feature) */
  clients?: Client[];
  selectedClientIds?: string[];
  setSelectedClientIds?: (v: string[]) => void;
  channelScopeType?: 'all' | 'selected';
  setChannelScopeType?: (v: 'all' | 'selected') => void;
  selectedChannelIds?: string[];
  setSelectedChannelIds?: (v: string[]) => void;
}

const PERIODS = ['Q1 2026', 'Q2 2026', 'Q3 2026', 'Q4 2026', 'Annual 2026'];

export function GoalFormFields({
  title, setTitle, channel, setChannel, owner, setOwner,
  period, setPeriod, krs, setKRs, theme, selectStyle,
  connections = [], getTables, getColumns, previewQuery,
  clients = [],
  selectedClientIds = [], setSelectedClientIds,
  channelScopeType = 'all', setChannelScopeType,
  selectedChannelIds = [], setSelectedChannelIds,
}: GoalFormFieldsProps) {
  const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: 8, border: `1px solid ${theme.borderInput}`, background: theme.bgInput, color: theme.text, fontSize: 13, outline: 'none', boxSizing: 'border-box' as const };
  const krInputStyle = { ...inputStyle, padding: '8px 10px', borderRadius: 6, fontSize: 12 };
  const labelStyle = { fontSize: 12, fontWeight: 600 as const, color: theme.textMuted, display: 'block' as const, marginBottom: 4 };

  const bridgeAvailable = connections.length > 0;
  const hasClients = clients.length > 0;
  const clientsSelected = selectedClientIds.length > 0;

  const updateKR = (i: number, patch: Partial<GoalFormKR>) => {
    const u = [...krs];
    u[i] = { ...u[i], ...patch };
    setKRs(u);
  };

  const toggleLive = (i: number) => {
    const kr = krs[i];
    if (kr.liveConfig) {
      updateKR(i, { liveConfig: undefined });
    } else {
      updateKR(i, {
        liveConfig: {
          connectionId: connections[0]?.id || '',
          sql: '',
          unit: 'count',
          direction: 'hi',
        },
      });
    }
  };

  const updateLiveConfig = (i: number, patch: Partial<LiveKRConfig>) => {
    const kr = krs[i];
    if (!kr.liveConfig) return;
    updateKR(i, { liveConfig: { ...kr.liveConfig, ...patch } });
  };

  // ── Client multi-select state ──
  const [clientDropOpen, setClientDropOpen] = useState(false);
  const [clientSearch, setClientSearch] = useState('');
  const clientDropRef = useRef<HTMLDivElement>(null);

  // ── Channel scope state ──
  const [channelSearch, setChannelSearch] = useState('');

  // Close client dropdown on outside click
  useEffect(() => {
    if (!clientDropOpen) return;
    const handler = (e: MouseEvent) => {
      if (clientDropRef.current && !clientDropRef.current.contains(e.target as Node)) {
        setClientDropOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [clientDropOpen]);

  const toggleClient = (id: string) => {
    if (!setSelectedClientIds) return;
    if (selectedClientIds.includes(id)) {
      setSelectedClientIds(selectedClientIds.filter((c) => c !== id));
    } else {
      setSelectedClientIds([...selectedClientIds, id]);
    }
  };

  const removeClient = (id: string) => {
    if (!setSelectedClientIds) return;
    setSelectedClientIds(selectedClientIds.filter((c) => c !== id));
  };

  const filteredClients = useMemo(
    () => clients.filter((c) => c.name.toLowerCase().includes(clientSearch.toLowerCase())),
    [clients, clientSearch],
  );

  // Channels from selected clients (grouped)
  const selectedClientsData = useMemo(
    () => clients.filter((c) => selectedClientIds.includes(c.id)),
    [clients, selectedClientIds],
  );

  const allScopedChannels = useMemo(
    () => selectedClientsData.flatMap((c) => c.channels.map((ch) => ({ ...ch, clientId: c.id, clientName: c.name, clientColor: c.color }))),
    [selectedClientsData],
  );

  const filteredScopedChannels = useMemo(
    () => allScopedChannels.filter((ch) => ch.name.toLowerCase().includes(channelSearch.toLowerCase())),
    [allScopedChannels, channelSearch],
  );

  const toggleChannel = (id: string) => {
    if (!setSelectedChannelIds) return;
    if (selectedChannelIds.includes(id)) {
      setSelectedChannelIds(selectedChannelIds.filter((c) => c !== id));
    } else {
      setSelectedChannelIds([...selectedChannelIds, id]);
    }
  };

  const selectAllChannels = () => {
    if (!setSelectedChannelIds) return;
    setSelectedChannelIds(filteredScopedChannels.map((ch) => ch.id));
  };

  const deselectAllChannels = () => {
    if (!setSelectedChannelIds) return;
    setSelectedChannelIds([]);
  };

  const selectedChannelCount = selectedChannelIds.length;
  const totalChannelCount = allScopedChannels.length;

  return (
    <>
      <div>
        <label style={labelStyle}>Title</label>
        <input aria-label="Goal title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Achieve 99.95% playout uptime" style={inputStyle} />
      </div>

      {/* Client multi-select */}
      {hasClients && (
        <div>
          <label style={labelStyle}>Clients</label>
          <div ref={clientDropRef} style={{ position: 'relative' }}>
            {/* Trigger area */}
            <div
              onClick={() => setClientDropOpen((o) => !o)}
              style={{
                minHeight: 42,
                padding: '6px 10px',
                borderRadius: 8,
                border: `1px solid ${clientDropOpen ? PRIMARY_COLOR : theme.borderInput}`,
                background: theme.bgInput,
                cursor: 'pointer',
                display: 'flex',
                flexWrap: 'wrap',
                gap: 4,
                alignItems: 'center',
              }}
            >
              {selectedClientIds.length === 0 ? (
                <span style={{ fontSize: 12, color: theme.textFaint }}>No clients selected (optional)</span>
              ) : (
                selectedClientsData.map((c) => (
                  <span
                    key={c.id}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '2px 6px',
                      borderRadius: 10,
                      background: c.color + '22',
                      border: `1px solid ${c.color}55`,
                      fontSize: 11,
                      color: theme.text,
                    }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.color, flexShrink: 0 }} />
                    {c.name}
                    <span
                      onClick={(e) => { e.stopPropagation(); removeClient(c.id); }}
                      style={{ cursor: 'pointer', color: theme.textFaint, fontSize: 12, lineHeight: 1, marginLeft: 2 }}
                    >
                      ×
                    </span>
                  </span>
                ))
              )}
              <span style={{ marginLeft: 'auto', color: theme.textFaint, fontSize: 12 }}>{clientDropOpen ? '▲' : '▼'}</span>
            </div>

            {/* Dropdown */}
            {clientDropOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  zIndex: 50,
                  marginTop: 4,
                  borderRadius: 8,
                  border: `1px solid ${theme.border}`,
                  background: theme.bgCard,
                  boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
                  overflow: 'hidden',
                }}
              >
                <div style={{ padding: '8px 10px', borderBottom: `1px solid ${theme.borderLight}` }}>
                  <input
                    value={clientSearch}
                    onChange={(e) => setClientSearch(e.target.value)}
                    placeholder="Search clients..."
                    autoFocus
                    style={{ ...inputStyle, padding: '6px 10px', fontSize: 12 }}
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
                <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                  {filteredClients.length === 0 ? (
                    <div style={{ padding: '10px 12px', fontSize: 12, color: theme.textFaint }}>No clients found</div>
                  ) : (
                    filteredClients.map((c) => (
                      <label
                        key={c.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '8px 12px',
                          cursor: 'pointer',
                          background: selectedClientIds.includes(c.id) ? PRIMARY_COLOR + '12' : 'transparent',
                          fontSize: 12,
                          color: theme.text,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selectedClientIds.includes(c.id)}
                          onChange={() => toggleClient(c.id)}
                          style={{ accentColor: PRIMARY_COLOR, width: 14, height: 14 }}
                        />
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: c.color, flexShrink: 0 }} />
                        <span style={{ flex: 1 }}>{c.name}</span>
                        <span style={{ fontSize: 10, color: theme.textFaint }}>{c.channels.length} ch</span>
                      </label>
                    ))
                  )}
                </div>
                <div style={{ padding: '6px 12px', borderTop: `1px solid ${theme.borderLight}`, textAlign: 'right' }}>
                  <button
                    onClick={() => setClientDropOpen(false)}
                    style={{ background: 'none', border: 'none', fontSize: 11, color: PRIMARY_COLOR, cursor: 'pointer', fontWeight: 600, padding: 0 }}
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="form-grid-3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        {/* Channel: legacy static dropdown when no clients, scope selector when clients selected */}
        <div>
          <label style={labelStyle}>Channel</label>
          {!clientsSelected ? (
            <select aria-label="Channel" value={channel} onChange={(e) => setChannel(Number(e.target.value))} style={{ ...selectStyle, width: '100%', padding: '10px 12px' }}>
              {CHANNELS.map((ch, i) => <option key={i} value={i}>{ch.icon} {ch.name}</option>)}
            </select>
          ) : (
            /* Channel scope radio buttons */
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                type="button"
                onClick={() => setChannelScopeType?.('all')}
                style={{
                  flex: 1,
                  padding: '8px 6px',
                  borderRadius: 6,
                  border: `1px solid ${channelScopeType === 'all' ? PRIMARY_COLOR : theme.border}`,
                  background: channelScopeType === 'all' ? PRIMARY_COLOR + '18' : 'transparent',
                  color: channelScopeType === 'all' ? PRIMARY_COLOR : theme.textMuted,
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                All Channels
              </button>
              <button
                type="button"
                onClick={() => setChannelScopeType?.('selected')}
                style={{
                  flex: 1,
                  padding: '8px 6px',
                  borderRadius: 6,
                  border: `1px solid ${channelScopeType === 'selected' ? PRIMARY_COLOR : theme.border}`,
                  background: channelScopeType === 'selected' ? PRIMARY_COLOR + '18' : 'transparent',
                  color: channelScopeType === 'selected' ? PRIMARY_COLOR : theme.textMuted,
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Select
              </button>
            </div>
          )}
        </div>
        <div>
          <label style={labelStyle}>Owner</label>
          <select aria-label="Owner" value={owner} onChange={(e) => setOwner(Number(e.target.value))} style={{ ...selectStyle, width: '100%', padding: '10px 12px' }}>
            {USERS.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Period</label>
          <select aria-label="Period" value={period} onChange={(e) => setPeriod(e.target.value)} style={{ ...selectStyle, width: '100%', padding: '10px 12px' }}>
            {PERIODS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      </div>

      {/* Channel picker — only when clients selected AND scope = 'selected' */}
      {clientsSelected && channelScopeType === 'selected' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <label style={labelStyle}>Select Channels</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 10, color: theme.textFaint }}>
                {selectedChannelCount} of {totalChannelCount} selected
              </span>
              <button
                onClick={selectAllChannels}
                style={{ background: 'none', border: 'none', fontSize: 10, color: PRIMARY_COLOR, cursor: 'pointer', fontWeight: 600, padding: 0 }}
              >
                All
              </button>
              <span style={{ fontSize: 10, color: theme.textFaint }}>·</span>
              <button
                onClick={deselectAllChannels}
                style={{ background: 'none', border: 'none', fontSize: 10, color: theme.textFaint, cursor: 'pointer', padding: 0 }}
              >
                None
              </button>
            </div>
          </div>
          <div style={{ marginBottom: 6 }}>
            <input
              value={channelSearch}
              onChange={(e) => setChannelSearch(e.target.value)}
              placeholder="Search channels..."
              style={{ ...inputStyle, padding: '7px 10px', fontSize: 12 }}
            />
          </div>
          <div style={{ maxHeight: 200, overflowY: 'auto', borderRadius: 8, border: `1px solid ${theme.borderLight}`, background: theme.bgMuted }}>
            {selectedClientsData.map((client) => {
              const clientChannels = client.channels.filter((ch) =>
                ch.name.toLowerCase().includes(channelSearch.toLowerCase()),
              );
              if (clientChannels.length === 0) return null;
              return (
                <div key={client.id}>
                  {/* Group header */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 10px',
                    background: theme.bgInput,
                    borderBottom: `1px solid ${theme.borderLight}`,
                    fontSize: 11,
                    fontWeight: 700,
                    color: theme.textMuted,
                  }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: client.color, flexShrink: 0 }} />
                    {client.name}
                  </div>
                  {clientChannels.map((ch) => (
                    <label
                      key={ch.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '7px 12px 7px 20px',
                        cursor: 'pointer',
                        background: selectedChannelIds.includes(ch.id) ? PRIMARY_COLOR + '10' : 'transparent',
                        borderBottom: `1px solid ${theme.borderLight}`,
                        fontSize: 12,
                        color: theme.text,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedChannelIds.includes(ch.id)}
                        onChange={() => toggleChannel(ch.id)}
                        style={{ accentColor: PRIMARY_COLOR, width: 13, height: 13 }}
                      />
                      <span style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: ch.color ?? client.color,
                        flexShrink: 0,
                      }} />
                      <span style={{ flex: 1 }}>{ch.name}</span>
                      {ch.channelKind && (
                        <span style={{ fontSize: 10, color: theme.textFaint }}>{ch.channelKind}</span>
                      )}
                    </label>
                  ))}
                </div>
              );
            })}
            {filteredScopedChannels.length === 0 && (
              <div style={{ padding: '12px', fontSize: 12, color: theme.textFaint, textAlign: 'center' }}>No channels match</div>
            )}
          </div>
          {channelScopeType === 'selected' && selectedChannelCount === 0 && (
            <div style={{ fontSize: 11, color: COLOR_DANGER, marginTop: 4 }}>Select at least one channel</div>
          )}
        </div>
      )}

      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: theme.textMuted }}>Key Results</label>
          <button
            onClick={() => setKRs([...krs, { title: '', start: 0, target: 100 }])}
            style={{ padding: '2px 8px', borderRadius: 4, border: `1px solid ${theme.border}`, background: 'transparent', color: theme.text, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
          >
            + Add KR
          </button>
        </div>
        {krs.map((kr, i) => (
          <div key={i} style={{ marginBottom: 10, padding: '10px 12px', borderRadius: 8, background: theme.bgMuted, border: `1px solid ${theme.borderLight}` }}>
            {/* KR title row + mode toggle */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: kr.liveConfig ? 8 : 0 }}>
              <input
                aria-label={`Key result ${i + 1} title`}
                value={kr.title}
                onChange={(e) => updateKR(i, { title: e.target.value })}
                placeholder={`Key Result ${i + 1}`}
                style={{ ...krInputStyle, flex: 1 }}
              />
              {!kr.liveConfig && (
                <>
                  <input
                    aria-label={`Key result ${i + 1} start value`}
                    type="number"
                    value={kr.start}
                    onChange={(e) => updateKR(i, { start: Number(e.target.value) })}
                    placeholder="Start"
                    style={{ ...krInputStyle, width: 60, textAlign: 'center' }}
                  />
                  <input
                    aria-label={`Key result ${i + 1} target value`}
                    type="number"
                    value={kr.target}
                    onChange={(e) => updateKR(i, { target: Number(e.target.value) })}
                    placeholder="Target"
                    style={{ ...krInputStyle, width: 60, textAlign: 'center' }}
                  />
                </>
              )}
              {bridgeAvailable && (
                <button
                  onClick={() => toggleLive(i)}
                  title={kr.liveConfig ? 'Switch to manual' : 'Switch to live (database)'}
                  style={{
                    padding: '4px 8px',
                    borderRadius: 4,
                    border: `1px solid ${kr.liveConfig ? COLOR_INFO : theme.border}`,
                    background: kr.liveConfig ? `${COLOR_INFO}18` : 'transparent',
                    color: kr.liveConfig ? COLOR_INFO : theme.textMuted,
                    fontSize: 10,
                    fontWeight: 700,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {kr.liveConfig ? '\u{1F4E1} Live' : '\u270B Manual'}
                </button>
              )}
              {krs.length > 1 && (
                <button
                  onClick={() => setKRs(krs.filter((_, j) => j !== i))}
                  aria-label="Remove key result"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.textFaint, fontSize: 14, padding: 2 }}
                >
                  {'\u2715'}
                </button>
              )}
            </div>

            {/* Live KR configuration */}
            {kr.liveConfig && (
              <LiveKRConfigPanel
                config={kr.liveConfig}
                target={kr.target}
                start={kr.start}
                onUpdateConfig={(patch) => updateLiveConfig(i, patch)}
                onUpdateKR={(patch) => updateKR(i, patch)}
                connections={connections}
                getTables={getTables}
                getColumns={getColumns}
                previewQuery={previewQuery}
                theme={theme}
                selectStyle={selectStyle}
                inputStyle={krInputStyle}
                labelStyle={labelStyle}
              />
            )}
          </div>
        ))}
      </div>
    </>
  );
}

/** Inline panel for configuring a live KR's database query */
function LiveKRConfigPanel({
  config, target, start, onUpdateConfig, onUpdateKR,
  connections, getTables, getColumns, previewQuery,
  theme, selectStyle, inputStyle, labelStyle,
}: {
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
}) {
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
