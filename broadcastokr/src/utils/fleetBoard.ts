import type { KRHistoryEntry } from '../types';

/**
 * The fleet board (R6-2): what the cockpit's /api/cockpit/metrics returns,
 * arranged as tenants × columns. A column is a template KR shared by several
 * tenants (key `tpl:<krTemplateId>`) or one tenant's hand-made KR
 * (`kr:<tenantId>:<krId>`). Labels are Mediagenix's own, stored on the
 * cockpit; the channel never carries a title, so the fallback is the id.
 */

export interface FleetPoint {
  value: number;
  target: number;
  timestamp: string;
}

export interface FleetMetric {
  krId: string;
  krTemplateId: string | null;
  label: string | null;
  value: number;
  target: number;
  direction: 'hi' | 'lo';
  timestamp: string;
  receivedAt: string;
  history: FleetPoint[];
}

export interface FleetTenant {
  tenantId: string;
  tenantName: string;
  color: string;
  metrics: FleetMetric[];
}

export interface FleetColumn {
  /** `tpl:<krTemplateId>` or `kr:<tenantId>:<krId>` — also the label key. */
  key: string;
  label: string;
  /** False when the label is the id fallback, so the UI can invite naming it. */
  named: boolean;
  shared: boolean;
}

export interface FleetRow {
  tenant: FleetTenant;
  cells: Map<string, FleetMetric>;
}

export const STALE_MS = 60 * 60 * 1000;

export function columnKey(tenantId: string, m: Pick<FleetMetric, 'krId' | 'krTemplateId'>): string {
  return m.krTemplateId ? `tpl:${m.krTemplateId}` : `kr:${tenantId}:${m.krId}`;
}

export function buildFleetBoard(fleet: FleetTenant[]): { columns: FleetColumn[]; rows: FleetRow[] } {
  const columns = new Map<string, FleetColumn>();
  const rows: FleetRow[] = fleet.map((tenant) => {
    const cells = new Map<string, FleetMetric>();
    for (const m of tenant.metrics) {
      const key = columnKey(tenant.tenantId, m);
      cells.set(key, m);
      const existing = columns.get(key);
      const named = !!m.label;
      if (!existing || (!existing.named && named)) {
        columns.set(key, {
          key,
          label: m.label ?? (m.krTemplateId ?? m.krId),
          named,
          shared: !!m.krTemplateId,
        });
      }
    }
    return { tenant, cells };
  });
  const ordered = [...columns.values()].sort((a, b) => {
    if (a.shared !== b.shared) return a.shared ? -1 : 1;
    if (a.named !== b.named) return a.named ? -1 : 1;
    return a.label.localeCompare(b.label);
  });
  return { columns: ordered, rows };
}

export function metricOnTarget(m: Pick<FleetMetric, 'value' | 'target' | 'direction'>): boolean {
  return m.direction === 'hi' ? m.value >= m.target : m.value <= m.target;
}

export function isStale(m: Pick<FleetMetric, 'timestamp'>, now = Date.now()): boolean {
  return now - new Date(m.timestamp).getTime() > STALE_MS;
}

/** The board reuses the report vocabulary (sparkline, trend), which speaks KRHistoryEntry. */
export function toHistoryEntries(history: FleetPoint[]): KRHistoryEntry[] {
  return history.map((p) => ({ timestamp: p.timestamp, value: p.value, actor: 'tenant', source: 'sync' }));
}

/** Sort rows by one column's value; tenants without that metric sink to the bottom. */
export function sortRows(rows: FleetRow[], key: string | null, asc: boolean): FleetRow[] {
  if (!key) return rows;
  return [...rows].sort((a, b) => {
    const av = a.cells.get(key)?.value;
    const bv = b.cells.get(key)?.value;
    if (av === undefined && bv === undefined) return 0;
    if (av === undefined) return 1;
    if (bv === undefined) return -1;
    return asc ? av - bv : bv - av;
  });
}
