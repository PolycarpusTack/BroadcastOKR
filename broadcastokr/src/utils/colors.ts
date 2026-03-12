import type { GoalStatus, KPI, KPIStatus } from '../types';

export function progressColor(progress: number): string {
  if (progress >= 0.7) return '#10b981';
  if (progress >= 0.4) return '#f59e0b';
  return '#ef4444';
}

export function statusIcon(status: GoalStatus | string): string {
  const icons: Record<string, string> = {
    on_track: '\u{1F7E2}',
    at_risk: '\u{1F7E1}',
    behind: '\u{1F534}',
    done: '\u2705',
  };
  return icons[status] || '\u26AA';
}

export function kpiStatus(kpi: KPI): KPIStatus {
  const ratio = kpi.direction === 'hi' ? kpi.current / kpi.target : kpi.target / kpi.current;
  if (ratio >= 0.98) return { label: 'On Target', color: '#10b981' };
  if (ratio >= 0.9) return { label: 'Near', color: '#f59e0b' };
  return { label: 'Off', color: '#ef4444' };
}
