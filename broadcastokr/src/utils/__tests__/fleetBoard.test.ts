import { describe, it, expect } from 'vitest';
import { buildFleetBoard, columnKey, metricOnTarget, isStale, sortRows, type FleetTenant, type FleetMetric } from '../fleetBoard';

const metric = (extra: Partial<FleetMetric> = {}): FleetMetric => ({
  krId: 'kr1', krTemplateId: 'krt-fill', label: null, value: 85, target: 95, direction: 'hi',
  timestamp: '2026-09-04T10:00:00Z', receivedAt: '2026-09-04T10:00:05Z', history: [], ...extra,
});
const tenant = (id: string, metrics: FleetMetric[]): FleetTenant => ({ tenantId: id, tenantName: `Tenant ${id}`, color: '#000', metrics });

describe('fleetBoard', () => {
  it('lines up the same template KR across tenants as one column; hand-made KRs get their own', () => {
    const { columns, rows } = buildFleetBoard([
      tenant('t0', [metric({ krId: 'kr-a', label: 'Fill rate' }), metric({ krId: 'kr-h', krTemplateId: null })]),
      tenant('t1', [metric({ krId: 'kr-b' })]),
    ]);
    expect(columns.map((c) => [c.key, c.label, c.named, c.shared])).toEqual([
      ['tpl:krt-fill', 'Fill rate', true, true],
      ['kr:t0:kr-h', 'kr-h', false, false],
    ]);
    expect(rows[0].cells.get('tpl:krt-fill')?.krId).toBe('kr-a');
    expect(rows[1].cells.get('tpl:krt-fill')?.krId).toBe('kr-b');
    expect(rows[1].cells.has('kr:t0:kr-h')).toBe(false);
  });

  it('falls back to the template id when no cockpit label exists, and takes a label from any tenant', () => {
    const { columns } = buildFleetBoard([
      tenant('t0', [metric({ krId: 'kr-a' })]),
      tenant('t1', [metric({ krId: 'kr-b', label: 'Named on t1' })]),
    ]);
    expect(columns[0]).toMatchObject({ label: 'Named on t1', named: true });
    expect(columnKey('t9', { krId: 'x', krTemplateId: null })).toBe('kr:t9:x');
  });

  it('judges on-target by direction and staleness by the tenant timestamp', () => {
    expect(metricOnTarget(metric({ value: 95, target: 95, direction: 'hi' }))).toBe(true);
    expect(metricOnTarget(metric({ value: 12, target: 5, direction: 'lo' }))).toBe(false);
    const now = new Date('2026-09-04T12:00:00Z').getTime();
    expect(isStale(metric({ timestamp: '2026-09-04T11:30:00Z' }), now)).toBe(false);
    expect(isStale(metric({ timestamp: '2026-09-04T10:30:00Z' }), now)).toBe(true);
  });

  it('sorts rows by a column with missing metrics last', () => {
    const { rows } = buildFleetBoard([
      tenant('t0', [metric({ value: 10 })]),
      tenant('t1', []),
      tenant('t2', [metric({ krId: 'kr-c', value: 90 })]),
    ]);
    expect(sortRows(rows, 'tpl:krt-fill', false).map((r) => r.tenant.tenantId)).toEqual(['t2', 't0', 't1']);
    expect(sortRows(rows, 'tpl:krt-fill', true).map((r) => r.tenant.tenantId)).toEqual(['t0', 't2', 't1']);
    expect(sortRows(rows, null, true).map((r) => r.tenant.tenantId)).toEqual(['t0', 't1', 't2']);
  });
});
