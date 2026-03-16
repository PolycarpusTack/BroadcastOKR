import type { Channel } from '../types';

/** Static channels for legacy/non-client goals — configurable */
export const CHANNELS: Channel[] = [
  { name: 'General', color: '#60A5FA', type: 'General', icon: '\u{1F4CB}' },
  { name: 'Operations', color: '#2DD4BF', type: 'Operations', icon: '\u2699\uFE0F' },
  { name: 'Technical', color: '#F59E0B', type: 'Technical', icon: '\u{1F527}' },
  { name: 'Content', color: '#A78BFA', type: 'Content', icon: '\u{1F3AC}' },
];

/** Goal categories for non-client goals */
export const GOAL_CATEGORIES = ['General', 'Operations', 'Technical', 'Content', 'Strategic'] as const;
export type GoalCategory = typeof GOAL_CATEGORIES[number];
