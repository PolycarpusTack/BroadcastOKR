import { useState } from 'react';
import { SparkLine } from '../ui/SparkLine';
import { ConfidenceBadge } from './ConfidenceBadge';
import { computePeriodDelta } from '../../utils/reportHelpers';
import { FONT_BODY, FONT_MONO } from '../../constants/config';
import type { Theme, KRHistoryEntry } from '../../types';

interface HistoryDetailProps {
  history: KRHistoryEntry[];
  color: string;
  theme: Theme;
}

function formatDate(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + '\u2026' : s;
}

export function HistoryDetail({ history, color, theme }: HistoryDetailProps) {
  const [expanded, setExpanded] = useState(false);

  if (history.length === 0) {
    return <span style={{ color: theme.textMuted, fontSize: 12 }}>No history</span>;
  }

  const delta = computePeriodDelta(history);
  const deltaStr = delta !== null
    ? (delta >= 0 ? `+${delta.toFixed(1)}` : delta.toFixed(1))
    : '\u2014';

  const thStyle: React.CSSProperties = {
    textAlign: 'left',
    padding: '4px 8px',
    fontSize: 11,
    fontWeight: 600,
    fontFamily: FONT_BODY,
    color: theme.textSecondary,
    borderBottom: `1px solid ${theme.border}`,
  };

  const tdStyle: React.CSSProperties = {
    padding: '4px 8px',
    fontSize: 11,
    fontFamily: FONT_MONO,
    color: theme.text,
    borderBottom: `1px solid ${theme.borderLight}`,
  };

  return (
    <div>
      <button
        onClick={() => setExpanded(v => !v)}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: theme.textSecondary,
          fontSize: 12,
          fontFamily: FONT_BODY,
          padding: '4px 0',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
        }}
      >
        <span style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s', display: 'inline-block' }}>
          &#9654;
        </span>
        History ({history.length} entries)
        <span style={{ marginLeft: 8, fontFamily: FONT_MONO, color: delta !== null && delta >= 0 ? '#2DD4BF' : delta !== null ? '#F87171' : theme.textMuted }}>
          7d: {deltaStr}
        </span>
      </button>

      {expanded && (
        <div style={{ marginTop: 8 }}>
          {/* Larger chart */}
          <div style={{ marginBottom: 12, position: 'relative' }}>
            <SparkLine data={history.map(e => e.value)} color={color} w={400} h={120} />
            {history.length > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontFamily: FONT_MONO, color: theme.textMuted, marginTop: 2 }}>
                <span>{Math.min(...history.map(e => e.value)).toFixed(1)}</span>
                <span>{Math.max(...history.map(e => e.value)).toFixed(1)}</span>
              </div>
            )}
          </div>

          {/* History table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thStyle}>Date</th>
                  <th style={thStyle}>Value</th>
                  <th style={thStyle}>Confidence</th>
                  <th style={thStyle}>Note</th>
                  <th style={thStyle}>Actor</th>
                  <th style={thStyle}>Source</th>
                </tr>
              </thead>
              <tbody>
                {[...history].reverse().map((entry, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : theme.bgMuted }}>
                    <td style={tdStyle}>{formatDate(entry.timestamp)}</td>
                    <td style={tdStyle}>{entry.value}</td>
                    <td style={tdStyle}>
                      {entry.confidence
                        ? <ConfidenceBadge history={[entry]} />
                        : <span style={{ color: theme.textMuted }}>\u2014</span>
                      }
                    </td>
                    <td style={{ ...tdStyle, fontFamily: FONT_BODY, maxWidth: 200 }}>
                      {entry.note ? truncate(entry.note, 60) : <span style={{ color: theme.textMuted }}>\u2014</span>}
                    </td>
                    <td style={tdStyle}>{entry.actor}</td>
                    <td style={tdStyle}>{entry.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
