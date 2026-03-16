import type { GoalStatus, KPI, KPIStatus, Role } from '../types';

/** Thresholds shared with store.ts goalStatus */
export const PROGRESS_ON_TRACK = 0.7;
export const PROGRESS_AT_RISK = 0.4;

export function goalStatus(progress: number): GoalStatus {
  if (progress >= PROGRESS_ON_TRACK) return 'on_track';
  if (progress >= PROGRESS_AT_RISK) return 'at_risk';
  return 'behind';
}

export function progressColor(progress: number): string {
  if (progress >= PROGRESS_ON_TRACK) return '#2DD4BF';
  if (progress >= PROGRESS_AT_RISK) return '#F59E0B';
  return '#F87171';
}

export function statusIcon(status: GoalStatus): string {
  const icons: Record<GoalStatus, string> = {
    on_track: '\u{1F7E2}',
    at_risk: '\u{1F7E1}',
    behind: '\u{1F534}',
    done: '\u2705',
  };
  return icons[status] || '\u26AA';
}

const ROLE_COLORS: Record<Role, string> = {
  owner: '#5B33F0',
  manager: '#2DD4BF',
  member: '#F59E0B',
};

export function roleColor(role: Role): string {
  return ROLE_COLORS[role] || '#5E6F8A';
}

export function kpiStatus(kpi: KPI): KPIStatus {
  const divisor = kpi.direction === 'hi' ? kpi.target : kpi.current;
  if (divisor === 0) return { label: 'Off', color: '#F87171' };
  const ratio = kpi.direction === 'hi' ? kpi.current / kpi.target : kpi.target / kpi.current;
  if (ratio >= 0.98) return { label: 'On Target', color: '#2DD4BF' };
  if (ratio >= 0.9) return { label: 'Near', color: '#F59E0B' };
  return { label: 'Off', color: '#F87171' };
}
