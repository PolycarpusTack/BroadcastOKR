import { type CSSProperties } from 'react';
import { CHANNELS } from '../../constants';
import { useStore } from '../../store/store';
import type { Theme, LiveKRConfig, Client, ScopedChannelRef } from '../../types';
import type { DBConnection, TableInfo, ColumnInfo } from '../../hooks/useBridge';
import { PRIMARY_COLOR, COLOR_INFO } from '../../constants/config';
import { LiveKRConfigPanel } from './LiveKRConfigPanel';
import { GoalFormChannelScope } from './GoalFormChannelScope';

export interface GoalFormKR {
  id?: string;
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
  selectedChannels?: ScopedChannelRef[];
  setSelectedChannels?: (v: ScopedChannelRef[]) => void;
}

const PERIODS = ['Q1 2026', 'Q2 2026', 'Q3 2026', 'Q4 2026', 'Annual 2026'];

export function GoalFormFields({
  title, setTitle, channel, setChannel, owner, setOwner,
  period, setPeriod, krs, setKRs, theme, selectStyle,
  connections = [], getTables, getColumns, previewQuery,
  clients = [],
  selectedClientIds = [], setSelectedClientIds,
  channelScopeType = 'all', setChannelScopeType,
  selectedChannels = [], setSelectedChannels,
}: GoalFormFieldsProps) {
  const users = useStore((s) => s.users);
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

  return (
    <>
      <div>
        <label style={labelStyle}>Title</label>
        <input aria-label="Goal title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Achieve 99.95% playout uptime" style={inputStyle} />
      </div>

      {hasClients && (
        <GoalFormChannelScope
          theme={theme}
          selectStyle={selectStyle}
          clients={clients!}
          selectedClientIds={selectedClientIds!}
          setSelectedClientIds={setSelectedClientIds!}
          channelScopeType={channelScopeType!}
          setChannelScopeType={setChannelScopeType!}
          selectedChannels={selectedChannels!}
          setSelectedChannels={setSelectedChannels!}
        />
      )}

      <div className="form-grid-3" style={{ display: 'grid', gridTemplateColumns: clientsSelected ? '1fr 1fr' : '1fr 1fr 1fr', gap: 12 }}>
        {/* Channel: category dropdown when no clients selected */}
        {!clientsSelected && (
          <div>
            <label style={labelStyle}>Category</label>
            <select aria-label="Category" value={channel} onChange={(e) => setChannel(Number(e.target.value))} style={{ ...selectStyle, width: '100%', padding: '10px 12px' }}>
              {CHANNELS.map((ch, i) => <option key={i} value={i}>{ch.icon} {ch.name}</option>)}
            </select>
          </div>
        )}
        <div>
          <label style={labelStyle}>Owner</label>
          <select aria-label="Owner" value={owner} onChange={(e) => setOwner(Number(e.target.value))} style={{ ...selectStyle, width: '100%', padding: '10px 12px' }}>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Period</label>
          <select aria-label="Period" value={period} onChange={(e) => setPeriod(e.target.value)} style={{ ...selectStyle, width: '100%', padding: '10px 12px' }}>
            {PERIODS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      </div>

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
