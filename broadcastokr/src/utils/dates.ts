import type { UrgencyBadge } from '../types';

export function daysUntil(dateStr: string): number {
  const time = new Date(dateStr).getTime();
  if (Number.isNaN(time)) return 0;
  return Math.ceil((time - Date.now()) / 864e5);
}

export function getUrgencyBadge(days: number, dark: boolean): UrgencyBadge {
  if (days < 0) return { text: `${Math.abs(days)}d overdue`, bg: '#dc2626', fg: '#fff', pulse: true };
  if (days === 0) return { text: 'TODAY', bg: '#ef4444', fg: '#fff', pulse: true };
  if (days === 1) return { text: 'Tomorrow', bg: '#f97316', fg: '#fff', pulse: false };
  if (days <= 3) return { text: `${days}d`, bg: '#f59e0b', fg: '#fff', pulse: false };
  if (days <= 7) return { text: `${days}d`, bg: dark ? '#854d0e' : '#fbbf24', fg: dark ? '#fbbf24' : '#1c1917', pulse: false };
  return { text: `${days}d`, bg: dark ? '#334155' : '#e2e8f0', fg: dark ? '#94a3b8' : '#64748b', pulse: false };
}

export function formatTime(): string {
  return new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
