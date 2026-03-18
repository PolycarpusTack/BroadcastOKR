import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import { useStore } from '../store/store';
import { PillBadge } from '../components/ui/PillBadge';
import { goalStatus, progressColor } from '../utils/colors';
import {
  PRIMARY_COLOR,
  COLOR_WARNING,
  COLOR_DANGER,
  FONT_BODY,
  FONT_MONO,
} from '../constants/config';
import type { Goal, KeyResult, KRTemplate } from '../types';

interface ExecuteBatchQuery {
  goalId: string;
  krIndex: number;
  connectionId: string;
  sql: string;
  binds?: Record<string, unknown>;
  timeframeDays?: number;
}

interface ExecuteBatchResult {
  goalId: string;
  krIndex: number;
  status: 'ok' | 'error' | 'timeout' | 'no_data';
  current?: number;
  error?: string;
}

interface ComparePageProps {
  bridgeConnected?: boolean;
  executeBatch?: (
    queries: ExecuteBatchQuery[]
  ) => Promise<{ results: ExecuteBatchResult[] }>;
}

interface GridRow {
  client: { id: string; name: string; color: string; tags: string[] };
  goal: Goal;
  /** Map krTemplateId → { kr, krIndex } */
  krMap: Map<string, { kr: KeyResult; krIndex: number }>;
}

const STATUS_LABELS: Record<string, string> = {
  on_track: 'On Track',
  at_risk: 'At Risk',
  behind: 'Behind',
  done: 'Done',
};

function formatValue(value: number, unit: string): string {
  if (unit === '%') return `${value.toFixed(1)}%`;
  if (unit === 'h' || unit === 'hrs') return `${value.toFixed(1)}h`;
  if (Number.isInteger(value)) return `${value} ${unit}`.trim();
  return `${value.toFixed(2)} ${unit}`.trim();
}

export function ComparePage({ bridgeConnected = false, executeBatch }: ComparePageProps) {
  const { theme } = useTheme();
  const navigate = useNavigate();

  const goalTemplates = useStore((s) => s.goalTemplates);
  const clients = useStore((s) => s.clients);
  const goals = useStore((s) => s.goals);
  const syncLiveKRBatch = useStore((s) => s.syncLiveKRBatch);

  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [sortKrId, setSortKrId] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(true);
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set());
  const [syncing, setSyncing] = useState(false);
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);

  const selectedTemplate = useMemo(
    () => goalTemplates.find((t) => t.id === selectedTemplateId) ?? null,
    [goalTemplates, selectedTemplateId],
  );

  /** Build grid rows from materialized goals for the selected template */
  const allRows = useMemo<GridRow[]>(() => {
    if (!selectedTemplate) return [];
    return goals
      .filter((g) => g.templateId === selectedTemplate.id && g.clientIds?.length)
      .map((goal) => {
        const primaryClientId = goal.clientIds?.[0];
        const client = clients.find((c) => c.id === primaryClientId);
        if (!client) return null;
        const krMap = new Map<string, { kr: KeyResult; krIndex: number }>();
        goal.keyResults.forEach((kr, idx) => {
          if (kr.krTemplateId) krMap.set(kr.krTemplateId, { kr, krIndex: idx });
        });
        return {
          client: {
            id: client.id,
            name: client.name,
            color: client.color,
            tags: client.tags ?? [],
          },
          goal,
          krMap,
        } satisfies GridRow;
      })
      .filter((r): r is GridRow => r !== null);
  }, [selectedTemplate, goals, clients]);

  /** All unique tags across visible clients */
  const allTags = useMemo<string[]>(() => {
    const set = new Set<string>();
    allRows.forEach((r) => r.client.tags.forEach((t) => set.add(t)));
    return Array.from(set).sort();
  }, [allRows]);

  /** Tag-filtered rows */
  const filteredRows = useMemo<GridRow[]>(() => {
    if (activeTags.size === 0) return allRows;
    return allRows.filter((r) => r.client.tags.some((t) => activeTags.has(t)));
  }, [allRows, activeTags]);

  /** Sorted rows */
  const sortedRows = useMemo<GridRow[]>(() => {
    if (!sortKrId) return filteredRows;
    return [...filteredRows].sort((a, b) => {
      const av = a.krMap.get(sortKrId)?.kr.current ?? -Infinity;
      const bv = b.krMap.get(sortKrId)?.kr.current ?? -Infinity;
      return sortAsc ? av - bv : bv - av;
    });
  }, [filteredRows, sortKrId, sortAsc]);

  /** Per-KR fleet averages */
  const krAverages = useMemo<Map<string, number>>(() => {
    const map = new Map<string, number>();
    if (!selectedTemplate) return map;
    for (const krt of selectedTemplate.krTemplates) {
      const values = filteredRows
        .map((r) => r.krMap.get(krt.id)?.kr.current)
        .filter((v): v is number => v !== undefined);
      if (values.length > 0) {
        map.set(krt.id, values.reduce((a, b) => a + b, 0) / values.length);
      }
    }
    return map;
  }, [selectedTemplate, filteredRows]);

  const handleColumnHeaderClick = useCallback(
    (krtId: string) => {
      if (sortKrId === krtId) {
        setSortAsc((prev) => !prev);
      } else {
        setSortKrId(krtId);
        setSortAsc(false); // default descending on first click
      }
    },
    [sortKrId],
  );

  const toggleTag = useCallback((tag: string) => {
    setActiveTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }, []);

  const handleSyncAll = useCallback(async () => {
    if (!executeBatch || !selectedTemplate) return;
    const queries: ExecuteBatchQuery[] = [];
    for (const row of filteredRows) {
      row.goal.keyResults.forEach((kr, krIndex) => {
        if (kr.liveConfig) {
          queries.push({
            goalId: row.goal.id,
            krIndex,
            connectionId: kr.liveConfig.connectionId,
            sql: kr.liveConfig.sql,
            timeframeDays: kr.liveConfig.timeframeDays,
          });
        }
      });
    }
    if (queries.length === 0) return;
    setSyncing(true);
    try {
      const { results } = await executeBatch(queries);
      syncLiveKRBatch(
        results.map((r) => ({
          goalId: r.goalId,
          krIndex: r.krIndex,
          current: r.current,
          error: r.error,
          status: r.status,
        })),
      );
    } finally {
      setSyncing(false);
    }
  }, [executeBatch, selectedTemplate, filteredRows, syncLiveKRBatch]);

  // ── Styles ──────────────────────────────────────────────────────────────────
  const containerStyle: React.CSSProperties = {
    padding: 0,
    fontFamily: FONT_BODY,
    color: theme.text,
    minHeight: '100%',
  };

  const headerRowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    marginBottom: 20,
    flexWrap: 'wrap',
  };

  const selectStyle: React.CSSProperties = {
    background: theme.bgInput,
    color: theme.text,
    border: `1px solid ${theme.borderInput}`,
    borderRadius: 8,
    padding: '6px 12px',
    fontSize: 13,
    fontFamily: FONT_BODY,
    cursor: 'pointer',
    outline: 'none',
    minWidth: 220,
  };

  const syncBtnStyle: React.CSSProperties = {
    marginLeft: 'auto',
    padding: '7px 16px',
    background: syncing ? theme.bgMuted : PRIMARY_COLOR,
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 13,
    fontFamily: FONT_BODY,
    fontWeight: 600,
    cursor: syncing ? 'not-allowed' : 'pointer',
    opacity: syncing ? 0.7 : 1,
    transition: 'opacity 0.15s',
  };

  const offlineBannerStyle: React.CSSProperties = {
    background: COLOR_WARNING + '22',
    border: `1px solid ${COLOR_WARNING}66`,
    borderRadius: 8,
    padding: '8px 14px',
    fontSize: 13,
    color: COLOR_WARNING,
    fontFamily: FONT_BODY,
    marginBottom: 16,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  };

  const emptyStyle: React.CSSProperties = {
    textAlign: 'center',
    padding: '60px 0',
    color: theme.textMuted,
    fontSize: 14,
    fontFamily: FONT_BODY,
  };

  const tableWrapStyle: React.CSSProperties = {
    background: theme.bgCard,
    borderRadius: 12,
    border: `1px solid ${theme.border}`,
    overflow: 'auto',
  };

  const tableStyle: React.CSSProperties = {
    width: '100%',
    borderCollapse: 'collapse',
  };

  const thStyle: React.CSSProperties = {
    fontFamily: FONT_MONO,
    fontSize: 10.5,
    fontWeight: 700,
    textTransform: 'uppercase',
    color: theme.textMuted,
    padding: '10px 12px',
    textAlign: 'left',
    position: 'sticky',
    top: 0,
    background: theme.bgCard,
    borderBottom: `1px solid ${theme.border}`,
    whiteSpace: 'nowrap',
  };

  const thSortableStyle: React.CSSProperties = {
    ...thStyle,
    cursor: 'pointer',
    userSelect: 'none',
  };

  const tdStyle: React.CSSProperties = {
    padding: '8px 12px',
    fontSize: 13,
    borderBottom: `1px solid ${theme.borderLight}`,
    verticalAlign: 'middle',
  };

  const summaryTdStyle: React.CSSProperties = {
    ...tdStyle,
    background: theme.bgMuted,
    fontWeight: 700,
    borderBottom: `1px solid ${theme.border}`,
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  const krTemplates: KRTemplate[] = selectedTemplate?.krTemplates ?? [];

  const renderKRCell = (krt: KRTemplate, row: GridRow) => {
    const entry = row.krMap.get(krt.id);
    if (!entry) {
      return (
        <td key={krt.id} style={{ ...tdStyle, color: theme.textFaint }}>
          —
        </td>
      );
    }
    const { kr } = entry;
    const hasError = kr.syncStatus === 'error';
    const status = goalStatus(kr.progress);
    const statusColor = progressColor(kr.progress);
    const cellBg = hasError ? COLOR_DANGER + '15' : undefined;

    return (
      <td
        key={krt.id}
        style={{ ...tdStyle, background: cellBg }}
        title={hasError && kr.syncError ? `Sync error: ${kr.syncError}` : undefined}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: FONT_MONO, fontWeight: 600, fontSize: 13, color: theme.text }}>
              {formatValue(kr.current, krt.unit)}
            </span>
            {hasError && (
              <span
                title={kr.syncError ?? 'Sync error'}
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: COLOR_DANGER,
                  display: 'inline-block',
                  flexShrink: 0,
                  cursor: 'help',
                }}
              />
            )}
          </div>
          <PillBadge
            label={STATUS_LABELS[status] ?? status}
            color={statusColor}
          />
        </div>
      </td>
    );
  };

  return (
    <div style={containerStyle}>
      {/* Offline banner */}
      {!bridgeConnected && (
        <div style={offlineBannerStyle}>
          <span>⚠</span>
          Bridge offline — showing last synced data
        </div>
      )}

      {/* Header row */}
      <div style={headerRowStyle}>
        {/* Template selector */}
        <select
          value={selectedTemplateId}
          onChange={(e) => {
            setSelectedTemplateId(e.target.value);
            setSortKrId(null);
            setActiveTags(new Set());
          }}
          style={selectStyle}
        >
          <option value="">— Select a template —</option>
          {goalTemplates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </select>

        {/* Sync All button */}
        {bridgeConnected && selectedTemplate && allRows.length > 0 && (
          <button
            style={syncBtnStyle}
            disabled={syncing}
            onClick={handleSyncAll}
          >
            {syncing ? 'Syncing…' : '↻ Sync All'}
          </button>
        )}
      </div>

      {/* Empty states */}
      {goalTemplates.length === 0 && (
        <div style={emptyStyle}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
          <div style={{ fontWeight: 600, marginBottom: 6, color: theme.text }}>
            No health check templates created yet.
          </div>
          <div style={{ color: theme.textMuted, fontSize: 13 }}>
            Go to the Goals page to create a template, then materialize it for your clients.
          </div>
          <button
            onClick={() => navigate('/goals')}
            style={{
              marginTop: 14,
              padding: '7px 18px',
              borderRadius: 8,
              border: 'none',
              background: PRIMARY_COLOR,
              color: '#fff',
              fontSize: 13,
              fontFamily: FONT_BODY,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Go to Goals → Templates
          </button>
        </div>
      )}

      {goalTemplates.length > 0 && !selectedTemplateId && (
        <div style={emptyStyle}>
          Select a template above to compare client health checks.
        </div>
      )}

      {selectedTemplate && allRows.length === 0 && (
        <div style={emptyStyle}>
          <div style={{ fontWeight: 600, marginBottom: 6, color: theme.text }}>
            No clients evaluated for this template yet.
          </div>
          <button
            onClick={() => navigate('/goals')}
            style={{
              marginTop: 8,
              padding: '0',
              border: 'none',
              background: 'none',
              color: PRIMARY_COLOR,
              fontSize: 13,
              fontFamily: FONT_BODY,
              fontWeight: 600,
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            Go to Goals → Templates to materialize
          </button>
        </div>
      )}

      {/* Tag filter pills */}
      {selectedTemplate && sortedRows.length > 0 && allTags.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
          <span style={{ fontSize: 11, color: theme.textMuted, fontFamily: FONT_MONO, alignSelf: 'center' }}>
            FILTER:
          </span>
          {allTags.map((tag) => (
            <span
              key={tag}
              onClick={() => toggleTag(tag)}
              style={{ cursor: 'pointer' }}
            >
              <PillBadge
                label={tag}
                color={activeTags.has(tag) ? PRIMARY_COLOR : theme.textMuted}
                bg={activeTags.has(tag) ? PRIMARY_COLOR + '25' : theme.bgMuted}
                fg={activeTags.has(tag) ? PRIMARY_COLOR : theme.textMuted}
              />
            </span>
          ))}
        </div>
      )}

      {/* Grid table */}
      {selectedTemplate && sortedRows.length > 0 && (
        <div style={tableWrapStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>
                {/* Client column header */}
                <th style={thStyle}>Client</th>
                {/* KR template column headers */}
                {krTemplates.map((krt) => (
                  <th
                    key={krt.id}
                    style={{
                      ...thSortableStyle,
                      color: sortKrId === krt.id ? PRIMARY_COLOR : theme.textMuted,
                    }}
                    onClick={() => handleColumnHeaderClick(krt.id)}
                    title={`Sort by ${krt.title}`}
                  >
                    {krt.title}
                    {sortKrId === krt.id && (
                      <span style={{ marginLeft: 4 }}>{sortAsc ? '↑' : '↓'}</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Summary / fleet average row */}
              <tr>
                <td style={{ ...summaryTdStyle, color: theme.textSecondary, fontFamily: FONT_MONO, fontSize: 11 }}>
                  FLEET AVG
                </td>
                {krTemplates.map((krt) => {
                  const avg = krAverages.get(krt.id);
                  return (
                    <td key={krt.id} style={summaryTdStyle}>
                      {avg !== undefined ? (
                        <span style={{ fontFamily: FONT_MONO, fontSize: 13, color: progressColor(avg / (krt.target || 1)) }}>
                          {formatValue(avg, krt.unit)}
                        </span>
                      ) : (
                        <span style={{ color: theme.textFaint }}>—</span>
                      )}
                    </td>
                  );
                })}
              </tr>

              {/* Data rows */}
              {sortedRows.map((row) => (
                <tr
                  key={row.goal.id}
                  onMouseEnter={() => setHoveredRow(row.goal.id)}
                  onMouseLeave={() => setHoveredRow(null)}
                  style={{
                    background: hoveredRow === row.goal.id ? theme.bgCardHover : undefined,
                    transition: 'background 0.12s',
                  }}
                >
                  {/* Client name cell */}
                  <td style={tdStyle}>
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
                      onClick={() => navigate('/goals')}
                      title={`Go to goals for ${row.client.name}`}
                    >
                      {/* Color dot */}
                      <span
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: '50%',
                          background: row.client.color,
                          flexShrink: 0,
                          display: 'inline-block',
                        }}
                      />
                      <span style={{ fontWeight: 600, color: theme.text, fontSize: 13 }}>
                        {row.client.name}
                      </span>
                    </div>
                    {/* Tags */}
                    {row.client.tags.length > 0 && (
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                        {row.client.tags.map((tag) => (
                          <PillBadge
                            key={tag}
                            label={tag}
                            color={theme.textMuted}
                            bg={theme.bgMuted}
                            fg={theme.textMuted}
                          />
                        ))}
                      </div>
                    )}
                  </td>

                  {/* KR cells */}
                  {krTemplates.map((krt) => renderKRCell(krt, row))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
