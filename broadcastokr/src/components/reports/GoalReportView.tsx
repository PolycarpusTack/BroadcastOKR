import { useState, useMemo } from 'react';
import { KRSparkLine } from './KRSparkLine';
import { TrendBadge } from './TrendBadge';
import { ConfidenceBadge } from './ConfidenceBadge';
import { HistoryDetail } from './HistoryDetail';
import { ProgressBar } from '../ui/ProgressBar';
import { SparkLine } from '../ui/SparkLine';
import { progressColor, statusIcon } from '../../utils/colors';
import { computeGoalProgressTimeline } from '../../utils/reportHelpers';
import {
  FONT_HEADING,
  FONT_BODY,
  FONT_MONO,
} from '../../constants/config';
import type { Goal, Client, KeyResult, KRHistoryEntry, Theme } from '../../types';

interface GoalReportViewProps {
  goals: Goal[];
  clients: Client[];
  theme: Theme;
}

/** Sort KRs by progress ascending so lowest-progress KRs appear first */
function sortKRsByProgressAsc(keyResults: KeyResult[]): KeyResult[] {
  return [...keyResults].sort((a, b) => a.progress - b.progress);
}

export function GoalReportView({ goals, clients, theme }: GoalReportViewProps) {
  const [selectedGoalId, setSelectedGoalId] = useState<string>('');
  const [expandedKRs, setExpandedKRs] = useState<Set<string>>(new Set());

  function toggleKR(krId: string) {
    setExpandedKRs(prev => {
      const next = new Set(prev);
      if (next.has(krId)) next.delete(krId);
      else next.add(krId);
      return next;
    });
  }

  /** Goals grouped by client, plus an "Unassigned" group for goals with no clientIds */
  const grouped = useMemo(() => {
    const clientGroups: { label: string; goals: Goal[] }[] = [];

    for (const client of clients) {
      const clientGoals = goals.filter(
        g => g.clientIds && g.clientIds.includes(client.id),
      );
      if (clientGoals.length > 0) {
        clientGroups.push({ label: client.name, goals: clientGoals });
      }
    }

    const unassigned = goals.filter(
      g => !g.clientIds || g.clientIds.length === 0,
    );
    if (unassigned.length > 0) {
      clientGroups.push({ label: 'Unassigned', goals: unassigned });
    }

    return clientGroups;
  }, [goals, clients]);

  const selectedGoal = useMemo(
    () => (selectedGoalId ? goals.find(g => g.id === selectedGoalId) ?? null : null),
    [selectedGoalId, goals],
  );

  const goalTimeline = useMemo(() => {
    if (!selectedGoal) return [];
    return computeGoalProgressTimeline(selectedGoal.keyResults);
  }, [selectedGoal]);

  const sparklineData = useMemo(
    () => goalTimeline.map(pt => pt.progress * 100),
    [goalTimeline],
  );

  const sortedKRs = useMemo(
    () => (selectedGoal ? sortKRsByProgressAsc(selectedGoal.keyResults) : []),
    [selectedGoal],
  );

  return (
    <div style={{ fontFamily: FONT_BODY }}>
      {/* Goal selector */}
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
        <label
          htmlFor="goal-report-select"
          style={{ fontSize: 13, fontWeight: 600, color: theme.textSecondary, fontFamily: FONT_BODY }}
        >
          Goal
        </label>
        <select
          id="goal-report-select"
          value={selectedGoalId}
          onChange={e => {
            setSelectedGoalId(e.target.value);
            setExpandedKRs(new Set());
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
            minWidth: 220,
          }}
        >
          <option value="">— Select a goal —</option>
          {grouped.map(group => (
            <optgroup key={group.label} label={group.label}>
              {group.goals.map(goal => (
                <option key={goal.id} value={goal.id}>
                  {goal.title}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      {/* Empty state */}
      {!selectedGoal && (
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
          Select a goal to view detailed KR analysis
        </div>
      )}

      {/* Goal detail */}
      {selectedGoal && (
        <div
          style={{
            background: theme.bgCard,
            border: `1px solid ${theme.border}`,
            borderRadius: 10,
            overflow: 'hidden',
          }}
        >
          {/* Goal header */}
          <div
            style={{
              padding: '16px 20px',
              borderBottom: `1px solid ${theme.borderLight}`,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <span style={{ fontSize: 18 }}>{statusIcon(selectedGoal.status)}</span>
            <span
              style={{
                flex: 1,
                fontSize: 17,
                fontWeight: 700,
                fontFamily: FONT_HEADING,
                color: theme.text,
              }}
            >
              {selectedGoal.title}
            </span>
            <span
              style={{
                fontSize: 13,
                fontFamily: FONT_MONO,
                color: progressColor(selectedGoal.progress),
                fontWeight: 700,
              }}
            >
              {Math.round(selectedGoal.progress * 100)}%
            </span>
          </div>

          {/* Goal progress bar */}
          <div
            style={{
              padding: '10px 20px',
              borderBottom: `1px solid ${theme.borderLight}`,
            }}
          >
            <ProgressBar value={selectedGoal.progress} height={8} theme={theme} />
          </div>

          {/* Goal-level progress sparkline */}
          {sparklineData.length > 0 && (
            <div
              style={{
                padding: '10px 20px 12px',
                borderBottom: `1px solid ${theme.borderLight}`,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  fontFamily: FONT_MONO,
                  color: theme.textMuted,
                  whiteSpace: 'nowrap',
                }}
              >
                Progress trend
              </span>
              <SparkLine
                data={sparklineData}
                color={progressColor(selectedGoal.progress)}
                w={120}
                h={28}
              />
            </div>
          )}

          {/* KR list */}
          {sortedKRs.length === 0 ? (
            <div
              style={{
                padding: '16px 20px',
                fontSize: 13,
                color: theme.textMuted,
                fontFamily: FONT_BODY,
              }}
            >
              No key results
            </div>
          ) : (
            sortedKRs.map(kr => {
              const isExpanded = expandedKRs.has(kr.id);
              const history: KRHistoryEntry[] = kr.history ?? [];

              return (
                <div key={kr.id}>
                  {/* KR summary row — clickable to expand */}
                  <div
                    role="button"
                    tabIndex={0}
                    aria-expanded={isExpanded}
                    onClick={() => toggleKR(kr.id)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggleKR(kr.id);
                      }
                    }}
                    style={{
                      padding: '10px 20px',
                      display: 'grid',
                      gridTemplateColumns: '1fr auto auto auto auto',
                      alignItems: 'center',
                      gap: 12,
                      cursor: 'pointer',
                      borderBottom: `1px solid ${theme.borderLight}`,
                      background: isExpanded ? theme.bgCardHover : 'transparent',
                      transition: 'background 0.15s',
                    }}
                  >
                    {/* Title + progress bar */}
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
      )}
    </div>
  );
}
