import type { UrgencyBadge } from '../types';
import { COLOR_DANGER, COLOR_WARNING } from '../constants/config';

export function daysUntil(dateStr: string): number {
  const time = new Date(dateStr).getTime();
  if (Number.isNaN(time)) return Infinity;
  return Math.ceil((time - Date.now()) / 864e5);
}

export function getUrgencyBadge(days: number): UrgencyBadge {
  if (!Number.isFinite(days)) return { text: '--', bg: '#1C2333', fg: '#5E6F8A', pulse: false };
  if (days < 0) return { text: `${Math.abs(days)}d overdue`, bg: COLOR_DANGER, fg: '#fff', pulse: true };
  if (days === 0) return { text: 'TODAY', bg: COLOR_DANGER, fg: '#fff', pulse: true };
  if (days === 1) return { text: 'Tomorrow', bg: COLOR_WARNING, fg: '#000', pulse: false };
  if (days <= 3) return { text: `${days}d`, bg: COLOR_WARNING, fg: '#000', pulse: false };
  if (days <= 7) return { text: `${days}d`, bg: '#78490A', fg: COLOR_WARNING, pulse: false };
  return { text: `${days}d`, bg: '#1C2333', fg: '#5E6F8A', pulse: false };
}

export function formatTime(date: Date = new Date()): string {
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/** Human-readable elapsed time from an ISO timestamp, e.g. "12m ago", "3h ago". */
export function formatTimeAgo(iso: string): string {
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return '--';
  const elapsed = Date.now() - time;
  if (elapsed < 60_000) return 'just now';
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** Calendar date as YYYY-MM-DD (UTC) — the shape goal and task dates are stored in. */
export function toISODate(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/** "Sep 7" — short calendar label for pills and captions. */
export function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** "Sep 7, 09:15" — history rows and last check-in labels. */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** Human-readable uptime from a seconds count, e.g. 3725 -> "1h 2m". */
export function formatUptime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '--';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
