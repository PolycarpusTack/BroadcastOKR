import type { Priority, PriorityInfo } from '../types';

export const PRIORITIES: Record<Priority, PriorityInfo> = {
  critical: { label: 'Critical', color: '#dc2626', icon: '\u{1F534}' },
  high: { label: 'High', color: '#f97316', icon: '\u{1F7E0}' },
  medium: { label: 'Medium', color: '#eab308', icon: '\u{1F7E1}' },
  low: { label: 'Low', color: '#22c55e', icon: '\u{1F7E2}' },
};
