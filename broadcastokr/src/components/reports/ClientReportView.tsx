import { useState, useMemo } from 'react';
import { KRSparkLine } from './KRSparkLine';
import { TrendBadge } from './TrendBadge';
import { ConfidenceBadge } from './ConfidenceBadge';
import { HistoryDetail } from './HistoryDetail';
import { ProgressBar } from '../ui/ProgressBar';
import { progressColor, statusIcon } from '../../utils/colors';
import {
  PRIMARY_COLOR,
  FONT_HEADING,
  FONT_BODY,
  FONT_MONO,
} from '../../constants/config';
import type { Goal, Client, KRHistoryEntry, Theme } from '../../types';

interface ClientReportViewProps {
  goals: Goal[];
  clients: Client[];
  theme: Theme;
}

/** Format an ISO timestamp into a short "last check-in" preview string */
function formatLastCheckin(timestamp: string): string {
  const d = new Date(timestamp);
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Derive last check-in label from history (most recent entry) */
function lastCheckinLabel(history: KRHistoryEntry[] | undefined): string {
  if (!history || history.length === 0) return '—';
  return formatLastCheckin(history[history.length - 1].timestamp);
}

export function ClientReportView({ goals, clients, theme }: ClientReportViewProps) {
  const [selectedClientId, setSelectedClientId] = useState<string>('all');
  // Track which KR rows are expanded: key = `${goalId}::${krId}`
  const [expandedKRs, setExpandedKRs] = useState<Set<string>>(new Set());

  function toggleKR(key: string) {
    setExpandedKRs(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  /** goals that belong to at least one client (have clientIds populated) */
  const clientGoals = useMemo(
    () => goals.filter(g => g.clientIds && g.clientIds.length > 0),
    [goals],
  );

  /** Groups for the current view: array of { client, goals[] } */
  const groups: { client: Client; clientGoals: Goal[] }[] = useMemo(() => {
    if (selectedClientId === 'all') {
      return clients
        .map(c => ({
          client: c,
          clientGoals: clientGoals.filter(g => g.clientIds!.includes(c.id)),
        }))
        .filter(g => g.clientGoals.length > 0);
    }
    const client = clients.find(c => c.id === selectedClientId);
    if (!client) return [];
    return [
      {
        client,
        clientGoals: clientGoals.filter(g => g.clientIds!.includes(client.id)),
      },
    ];
  }, [selectedClientId, clients, clientGoals]);

  const isEmpty = useMemo(() => {
    if (selectedClientId === 'all') return groups.length === 0;
    return groups.length === 0 || groups[0].clientGoals.length === 0;
  }, [selectedClientId, groups]);

  return (
    <div style={{ fontFamily: FONT_BODY }}>
      {/* Client selector */}
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
        <label
          htmlFor="client-report-select"
          style={{ fontSize: 13, fontWeight: 600, color: theme.textSecondary, fontFamily: FONT_BODY }}
        >
          Client
        </label>
        <select
          id="client-report-select"
          value={selectedClientId}
          onChange={e => setSelectedClientId(e.target.value)}
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
          }}
        >
          <option value="all">All Clients</option>
          {clients.map(c => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {/* Empty state */}
      {isEmpty && (
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
          No goals for this client
        </div>
      )}

      {/* Client groups */}
      {!isEmpty && groups.map(({ client, clientGoals: cGoals }) => (
        <div key={client.id} style={{ marginBottom: 32 }}>
          {/* Client header (only shown in "All Clients" view) */}
          {selectedClientId === 'all' && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                marginBottom: 12,
                paddingBottom: 8,
                borderBottom: `2px solid ${client.color}40`,
              }}
            >
              <span
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  background: client.color,
                  flexShrink: 0,
                  display: 'inline-block',
                }}
              />
              <span
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  fontFamily: FONT_HEADING,
                  color: theme.text,
                }}
              >
                {client.name}
              </span>
              <span
                style={{
                  fontSize: 11,
                  fontFamily: FONT_MONO,
                  color: theme.textMuted,
                  marginLeft: 4,
                }}
              >
                {cGoals.length} goal{cGoals.length !== 1 ? 's' : ''}
              </span>
            </div>
          )}

          {/* Goals */}
          {cGoals.map(goal => (
            <GoalCard
              key={goal.id}
              goal={goal}
              theme={theme}
              expandedKRs={expandedKRs}
              onToggleKR={toggleKR}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

interface GoalCardProps {
  goal: Goal;
  theme: Theme;
  expandedKRs: Set<string>;
  onToggleKR: (key: string) => void;
}

function GoalCard({ goal, theme, expandedKRs, onToggleKR }: GoalCardProps) {
  return (
    <div
      style={{
        background: theme.bgCard,
        border: `1px solid ${theme.border}`,
        borderRadius: 10,
        marginBottom: 16,
        overflow: 'hidden',
      }}
    >
      {/* Goal header */}
      <div
        style={{
          padding: '14px 18px',
          borderBottom: `1px solid ${theme.borderLight}`,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <span style={{ fontSize: 16 }}>{statusIcon(goal.status)}</span>
        <span
          style={{
            flex: 1,
            fontSize: 15,
            fontWeight: 700,
            fontFamily: FONT_HEADING,
            color: theme.text,
          }}
        >
          {goal.title}
        </span>
        <span
          style={{
            fontSize: 11,
            fontFamily: FONT_MONO,
            color: progressColor(goal.progress),
            fontWeight: 600,
          }}
        >
          {Math.round(goal.progress * 100)}%
        </span>
      </div>

      {/* Goal progress bar */}
      <div style={{ padding: '8px 18px', borderBottom: `1px solid ${theme.borderLight}` }}>
        <ProgressBar value={goal.progress} height={6} theme={theme} />
      </div>

      {/* KR rows */}
      {goal.keyResults.length === 0 ? (
        <div
          style={{
            padding: '14px 18px',
            fontSize: 12,
            color: theme.textMuted,
            fontFamily: FONT_BODY,
          }}
        >
          No key results
        </div>
      ) : (
        goal.keyResults.map(kr => {
          const key = `${goal.id}::${kr.id}`;
          const isExpanded = expandedKRs.has(key);
          const history: KRHistoryEntry[] = kr.history ?? [];

          return (
            <div key={kr.id}>
              {/* KR summary row — clickable to expand */}
              <div
                role="button"
                tabIndex={0}
                aria-expanded={isExpanded}
                onClick={() => onToggleKR(key)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggleKR(key); } }}
                style={{
                  padding: '10px 18px',
                  display: 'grid',
                  gridTemplateColumns: '1fr auto auto auto auto auto',
                  alignItems: 'center',
                  gap: 12,
                  cursor: 'pointer',
                  borderBottom: `1px solid ${theme.borderLight}`,
                  background: isExpanded ? theme.bgCardHover : 'transparent',
                  transition: 'background 0.15s',
                }}
              >
                {/* Title */}
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      fontFamily: FONT_BODY,
                      color: theme.text,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {kr.title}
                  </div>
                  <div style={{ marginTop: 4 }}>
                    <ProgressBar value={kr.progress} height={4} theme={theme} />
                  </div>
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
                  <span style={{ color: progressColor(kr.progress), fontWeight: 600 }}>
                    {kr.current}
                  </span>
                  {' / '}
                  <span style={{ color: theme.textMuted }}>{kr.target}</span>
                </span>

                {/* Sparkline */}
                <KRSparkLine history={history} color={progressColor(kr.progress)} w={60} h={24} />

                {/* Trend badge */}
                <TrendBadge history={history} target={kr.target} start={kr.start} />

                {/* Confidence badge */}
                <ConfidenceBadge history={history} />

                {/* Last check-in */}
                <span
                  style={{
                    fontSize: 11,
                    fontFamily: FONT_MONO,
                    color: theme.textMuted,
                    whiteSpace: 'nowrap',
                  }}
                  title="Last check-in"
                >
                  {lastCheckinLabel(kr.history)}
                </span>
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
                  <HistoryDetail
                    history={history}
                    color={progressColor(kr.progress)}
                    theme={theme}
                  />
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
