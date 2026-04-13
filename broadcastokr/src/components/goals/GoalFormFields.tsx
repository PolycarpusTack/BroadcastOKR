import { type CSSProperties } from 'react';
import { CHANNELS } from '../../constants';
import { useStore } from '../../store/store';
import type { Theme, Client, ScopedChannelRef } from '../../types';
import type { DBConnection, TableInfo, ColumnInfo } from '../../hooks/useBridge';
import { GoalFormKRList } from './GoalFormKRList';
import { GoalFormChannelScope } from './GoalFormChannelScope';

export type { GoalFormKR } from './GoalFormKRList';

interface GoalFormFieldsProps {
  title: string;
  setTitle: (v: string) => void;
  channel: number;
  setChannel: (v: number) => void;
  owner: number;
  setOwner: (v: number) => void;
  period: string;
  setPeriod: (v: string) => void;
  krs: import('./GoalFormKRList').GoalFormKR[];
  setKRs: (v: import('./GoalFormKRList').GoalFormKR[]) => void;
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
  const labelStyle = { fontSize: 12, fontWeight: 600 as const, color: theme.textMuted, display: 'block' as const, marginBottom: 4 };

  const hasClients = clients.length > 0;
  const clientsSelected = selectedClientIds.length > 0;

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

      <GoalFormKRList
        theme={theme}
        krs={krs}
        setKRs={setKRs}
        selectStyle={selectStyle}
        connections={connections}
        getTables={getTables}
        getColumns={getColumns}
        previewQuery={previewQuery}
      />
    </>
  );
}
