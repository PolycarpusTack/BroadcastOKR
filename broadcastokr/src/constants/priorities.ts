import type { Priority, PriorityInfo } from '../types';

export const PRIORITIES: Record<Priority, PriorityInfo> = {
  critical: { label: 'Critical', color: '#F87171', icon: '\u{1F534}' },
  high: { label: 'High', color: '#F59E0B', icon: '\u{1F7E0}' },
  medium: { label: 'Medium', color: '#60A5FA', icon: '\u{1F535}' },
  low: { label: 'Low', color: '#2DD4BF', icon: '\u{1F7E2}' },
};
