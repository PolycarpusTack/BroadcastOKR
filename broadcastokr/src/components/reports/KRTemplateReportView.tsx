import { useState, useMemo } from 'react';
import { KRSparkLine } from './KRSparkLine';
import { TrendBadge } from './TrendBadge';
import { ConfidenceBadge } from './ConfidenceBadge';
import { HistoryDetail } from './HistoryDetail';
import { ProgressBar } from '../ui/ProgressBar';
import { progressColor } from '../../utils/colors';
import {
  FONT_HEADING,
  FONT_BODY,
  FONT_MONO,
} from '../../constants/config';
import type {
  Goal,
  Client,
  GoalTemplate,
  KRTemplate,
  KRHistoryEntry,
  Theme,
} from '../../types';

export interface KRTemplateReportViewProps {
  goals: Goal[];
  clients: Client[];
  goalTemplates: GoalTemplate[];
  theme: Theme;
}

/** Flatten all KR templates across all goal templates into labeled entries */
interface FlatKRTemplate {
  krTemplateId: string;
  label: string;
  krTemplate: KRTemplate;
  goalTemplate: GoalTemplate;
}

function flattenKRTemplates(goalTemplates: GoalTemplate[]): FlatKRTemplate[] {
  const result: FlatKRTemplate[] = [];
  for (const gt of goalTemplates) {
    for (const krt of gt.krTemplates) {
      result.push({
        krTemplateId: krt.id,
        label: `${gt.title} — ${krt.title}`,
        krTemplate: krt,
        goalTemplate: gt,
      });
    }
  }
  return result;
}

/** One row per client: the KR from that client's goal matching the selected krTemplateId */
interface ClientKRRow {
  client: Client;
  krCurrent: number;
  krTarget: number;
  krProgress: number;
  krStart: number;
  history: KRHistoryEntry[];
}

export function KRTemplateReportView({
  goals,
  clients,
  goalTemplates,
  theme,
}: KRTemplateReportViewProps) {
  const [selectedKRTemplateId, setSelectedKRTemplateId] = useState<string>('');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  function toggleRow(clientId: string) {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(clientId)) next.delete(clientId);
      else next.add(clientId);
      return next;
    });
  }

  const flatTemplates = useMemo(() => flattenKRTemplates(goalTemplates), [goalTemplates]);

  /** Rows sorted by progress ascending (worst first) */
  const clientRows = useMemo((): ClientKRRow[] => {
    if (!selectedKRTemplateId) return [];

    const rows: ClientKRRow[] = [];

    for (const client of clients) {
      // Find goal belonging to this client that has a KR with matching krTemplateId
      const goal = goals.find(
        g =>
          g.clientIds &&
          g.clientIds.includes(client.id) &&
          g.keyResults.some(kr => kr.krTemplateId === selectedKRTemplateId),
      );
      if (!goal) continue;

      const kr = goal.keyResults.find(k => k.krTemplateId === selectedKRTemplateId);
      if (!kr) continue;

      rows.push({
        client,
        krCurrent: kr.current,
        krTarget: kr.target,
        krProgress: kr.progress,
        krStart: kr.start,
        history: kr.history ?? [],
      });
    }

    // Sort worst performing first (lowest progress)
    rows.sort((a, b) => a.krProgress - b.krProgress);
    return rows;
  }, [selectedKRTemplateId, goals, clients]);

  const hasTemplateSelected = Boolean(selectedKRTemplateId);
  const hasRows = clientRows.length > 0;

  return (
    <div style={{ fontFamily: FONT_BODY }}>
      {/* KR Template selector */}
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
        <label
          htmlFor="kr-template-report-select"
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: theme.textSecondary,
            fontFamily: FONT_BODY,
            whiteSpace: 'nowrap',
          }}
        >
          KR Template
        </label>
        <select
          id="kr-template-report-select"
          value={selectedKRTemplateId}
          onChange={e => {
            setSelectedKRTemplateId(e.target.value);
            setExpandedRows(new Set());
          }}
          style={{
            background: theme.bgInput,
            color: theme.text,
            border: `1px solid ${theme.borderInput}`,
            borderRadius: 8,
            padding: '6px 12px',
            fontSize: 13,
            fontFamily: FONT_BODY,
            cursor: 'pointer',
            outline: 'none',
            minWidth: 260,
          }}
        >
          <option value="">— Select a KR template —</option>
          {flatTemplates.map(ft => (
            <option key={ft.krTemplateId} value={ft.krTemplateId}>
              {ft.label}
            </option>
          ))}
        </select>
      </div>

      {/* Empty state: no template selected */}
      {!hasTemplateSelected && (
        <div
          style={{
            padding: '32px 24px',
            borderRadius: 10,
            background: theme.bgCard,
            border: `1px solid ${theme.border}`,
            textAlign: 'center',
            color: theme.textMuted,
            fontSize: 14,
            fontFamily: FONT_BODY,
          }}
        >
          Select a KR template to compare across clients
        </div>
      )}

      {/* Empty state: template selected but no materializations */}
      {hasTemplateSelected && !hasRows && (
        <div
          style={{
            padding: '32px 24px',
            borderRadius: 10,
            background: theme.bgCard,
            border: `1px solid ${theme.border}`,
            textAlign: 'center',
            color: theme.textMuted,
            fontSize: 14,
            fontFamily: FONT_BODY,
          }}
        >
          No clients have materialized this template
        </div>
      )}

      {/* Client rows */}
      {hasTemplateSelected && hasRows && (
        <div
          style={{
            background: theme.bgCard,
            border: `1px solid ${theme.border}`,
            borderRadius: 10,
            overflow: 'hidden',
          }}
        >
          {clientRows.map(row => {
            const { client, krCurrent, krTarget, krProgress, krStart, history } = row;
            const color = progressColor(krProgress);
            const isExpanded = expandedRows.has(client.id);

            return (
              <div key={client.id}>
                {/* Client KR row — clickable to expand */}
                <div
                  role="button"
                  tabIndex={0}
                  aria-expanded={isExpanded}
                  onClick={() => toggleRow(client.id)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      toggleRow(client.id);
                    }
                  }}
                  style={{
                    padding: '12px 18px',
                    display: 'grid',
                    gridTemplateColumns: '180px 1fr auto auto auto auto',
                    alignItems: 'center',
                    gap: 12,
                    cursor: 'pointer',
                    borderBottom: `1px solid ${theme.borderLight}`,
                    background: isExpanded ? theme.bgCardHover : 'transparent',
                    transition: 'background 0.15s',
                  }}
                >
                  {/* Client name + color dot */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      minWidth: 0,
                    }}
                  >
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        background: client.color,
                        flexShrink: 0,
                        display: 'inline-block',
                      }}
                    />
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        fontFamily: FONT_HEADING,
                        color: theme.text,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {client.name}
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div style={{ minWidth: 80 }}>
                    <ProgressBar value={krProgress} height={5} theme={theme} />
                  </div>

                  {/* Current / Target */}
                  <span
                    style={{
                      fontSize: 12,
                      fontFamily: FONT_MONO,
                      color: theme.textSecondary,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <span style={{ color, fontWeight: 600 }}>{krCurrent}</span>
                    {' / '}
                    <span style={{ color: theme.textMuted }}>{krTarget}</span>
                  </span>

                  {/* Sparkline */}
                  <KRSparkLine history={history} color={color} w={60} h={24} />

                  {/* Trend badge */}
                  <TrendBadge history={history} target={krTarget} start={krStart} />

                  {/* Confidence badge */}
                  <ConfidenceBadge history={history} />
                </div>

                {/* Expanded HistoryDetail */}
                {isExpanded && (
                  <div
                    style={{
                      padding: '12px 24px 16px',
                      background: theme.bgMuted,
                      borderBottom: `1px solid ${theme.borderLight}`,
                    }}
                  >
                    <HistoryDetail history={history} color={color} theme={theme} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
