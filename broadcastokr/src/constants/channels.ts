import type { Channel } from '../types';

/** Colours handed to channels pulled from a client's database, in order. */
export const CHANNEL_PALETTE = [
  '#3805E3',
  '#2DD4BF',
  '#F59E0B',
  '#F87171',
  '#60A5FA',
  '#A78BFA',
  '#FB923C',
  '#34D399',
  '#F472B6',
  '#818CF8',
];

/** Static channels for legacy/non-client goals — configurable */
export const CHANNELS: Channel[] = [
  { name: 'General', color: '#60A5FA', type: 'General', icon: '\u{1F4CB}' },
  { name: 'Operations', color: '#2DD4BF', type: 'Operations', icon: '\u2699\uFE0F' },
  { name: 'Technical', color: '#F59E0B', type: 'Technical', icon: '\u{1F527}' },
  { name: 'Content', color: '#A78BFA', type: 'Content', icon: '\u{1F3AC}' },
];
