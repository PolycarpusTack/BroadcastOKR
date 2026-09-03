import { useMemo, useState } from 'react';
import { KRSparkLine } from '../reports/KRSparkLine';
import { TrendBadge } from '../reports/TrendBadge';
import { formatTimeAgo } from '../../utils/dates';
import {
  buildFleetBoard, metricOnTarget, isStale, toHistoryEntries, sortRows,
  type FleetTenant, type FleetMetric,
} from '../../utils/fleetBoard';
import { COLOR_SUCCESS, COLOR_DANGER, COLOR_WARNING, FONT_BODY, FONT_MONO, PRIMARY_COLOR } from '../../constants/config';
import type { Theme } from '../../types';

export interface FleetBoardProps {
  fleet: FleetTenant[];
  /** Owners name columns; everyone else reads. */
  canEdit: boolean;
  onLabel: (key: string, label: string) => Promise<void>;
  theme: Theme;
}

/**
 * Tenants × shared KRs, with the report vocabulary (value against target,
 * sparkline over the pushed history, trend) and the channel's staleness.
 * Column labels are the cockpit's own; an unnamed column shows the id and,
 * for owners, invites a name (R6-2).
 */
export function FleetBoard({ fleet, canEdit, onLabel, theme }: FleetBoardProps) {
  const { columns, rows } = useMemo(() => buildFleetBoard(fleet), [fleet]);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(false);
  const [editing, setEditing] = useState<{ key: string; value: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const sorted = useMemo(() => sortRows(rows, sortKey, sortAsc), [rows, sortKey, sortAsc]);

  const th: React.CSSProperties = {
    fontFamily: FONT_MONO, fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase',
    color: theme.textMuted, padding: '10px 12px', textAlign: 'left', position: 'sticky', top: 0,
    background: theme.bgCard, borderBottom: `1px solid ${theme.border}`, whiteSpace: 'nowrap',
  };
  const td: React.CSSProperties = { padding: '8px 12px', fontSize: 13, borderBottom: `1px solid ${theme.borderLight}`, verticalAlign: 'middle' };

  const sortBy = (key: string) => {
    if (sortKey === key) setSortAsc((v) => !v);
    else { setSortKey(key); setSortAsc(false); }
  };

  const commitLabel = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await onLabel(editing.key, editing.value.trim());
      setEditing(null);
    } finally {
      setSaving(false);
    }
  };

  const renderCell = (key: string, m: FleetMetric | undefined) => {
    if (!m) return <td key={key} style={{ ...td, color: theme.textFaint }}>—</td>;
    const good = metricOnTarget(m);
    const stale = isStale(m);
    const history = toHistoryEntries(m.history);
    const start = history[0]?.value ?? m.value;
    return (
      <td key={key} style={td} title={`${m.krId} · updated ${formatTimeAgo(m.timestamp)}`}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: FONT_MONO, fontWeight: 700, fontSize: 13, color: good ? COLOR_SUCCESS : COLOR_DANGER }}>{m.value}</span>
          <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: theme.textMuted }}>/ {m.target} {m.direction === 'lo' ? '↓' : '↑'}</span>
          <KRSparkLine history={history} color={good ? COLOR_SUCCESS : COLOR_DANGER} w={60} h={18} />
          <TrendBadge history={history} target={m.target} start={start} />
          {stale && <span data-testid="stale" style={{ fontFamily: FONT_MONO, fontSize: 10.5, color: COLOR_WARNING }}>stale</span>}
        </div>
      </td>
    );
  };

  if (fleet.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 0', color: theme.textMuted, fontSize: 14, fontFamily: FONT_BODY }}>
        No tenant has shared metrics yet — mint a share token in the tenant modal on the Clients page and set it on the instance.
      </div>
    );
  }

  return (
    <div style={{ background: theme.bgCard, borderRadius: 12, border: `1px solid ${theme.border}`, overflow: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={th}>Tenant</th>
            {columns.map((c) => (
              <th key={c.key} style={th}>
                {editing?.key === c.key ? (
                  <input
                    aria-label={`Label for ${c.label}`}
                    autoFocus
                    value={editing.value}
                    disabled={saving}
                    onChange={(e) => setEditing({ key: c.key, value: e.target.value })}
                    onKeyDown={(e) => { if (e.key === 'Enter') commitLabel(); if (e.key === 'Escape') setEditing(null); }}
                    onBlur={commitLabel}
                    style={{ fontFamily: FONT_BODY, fontSize: 12, padding: '2px 6px', borderRadius: 4, border: `1px solid ${PRIMARY_COLOR}`, background: theme.bgInput, color: theme.text, minWidth: 140 }}
                  />
                ) : (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span
                      onClick={() => sortBy(c.key)}
                      style={{ cursor: 'pointer', userSelect: 'none', color: c.named ? theme.textMuted : theme.textFaint, fontStyle: c.named ? 'normal' : 'italic', textTransform: c.named ? 'uppercase' : 'none' }}
                      title={c.shared ? 'Template KR — one column across tenants' : 'Hand-made KR on one tenant'}
                    >
                      {c.label}{sortKey === c.key ? (sortAsc ? ' ▲' : ' ▼') : ''}
                    </span>
                    {canEdit && (
                      <button
                        aria-label={`Rename ${c.label}`}
                        onClick={() => setEditing({ key: c.key, value: c.named ? c.label : '' })}
                        style={{ border: 'none', background: 'none', cursor: 'pointer', color: c.named ? theme.textFaint : PRIMARY_COLOR, fontSize: 11, padding: 0 }}
                      >
                        {c.named ? '✎' : 'name it'}
                      </button>
                    )}
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={row.tenant.tenantId}>
              <td style={{ ...td, whiteSpace: 'nowrap' }}>
                <span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: '50%', background: row.tenant.color, marginRight: 8 }} />
                <span style={{ fontWeight: 700, color: theme.text }}>{row.tenant.tenantName}</span>
              </td>
              {columns.map((c) => renderCell(c.key, row.cells.get(c.key)))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
