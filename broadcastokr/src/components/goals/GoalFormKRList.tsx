import type { CSSProperties } from 'react';
import type { Theme, LiveKRConfig } from '../../types';
import type { DBConnection, TableInfo, ColumnInfo } from '../../hooks/useBridge';
import { COLOR_INFO } from '../../constants/config';
import { LiveKRConfigPanel } from './LiveKRConfigPanel';

export interface GoalFormKR {
  id?: string;
  title: string;
  start: number;
  target: number;
  /** If present, this KR is live — synced from a database */
  liveConfig?: LiveKRConfig;
}

export interface GoalFormKRListProps {
  theme: Theme;
  krs: GoalFormKR[];
  setKRs: (krs: GoalFormKR[]) => void;
  selectStyle: CSSProperties;
  connections?: DBConnection[];
  getTables?: (connectionId: string) => Promise<TableInfo[]>;
  getColumns?: (connectionId: string, tableName: string) => Promise<ColumnInfo[]>;
  previewQuery?: (connectionId: string, sql: string) => Promise<Record<string, unknown>[]>;
}

export function GoalFormKRList({
  theme, krs, setKRs, selectStyle,
  connections = [], getTables, getColumns, previewQuery,
}: GoalFormKRListProps) {
  const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: 8, border: `1px solid ${theme.borderInput}`, background: theme.bgInput, color: theme.text, fontSize: 13, outline: 'none', boxSizing: 'border-box' as const };
  const krInputStyle = { ...inputStyle, padding: '8px 10px', borderRadius: 6, fontSize: 12 };
  const labelStyle = { fontSize: 12, fontWeight: 600 as const, color: theme.textMuted, display: 'block' as const, marginBottom: 4 };

  const bridgeAvailable = connections.length > 0;

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
  );
}
