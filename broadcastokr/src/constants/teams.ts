import type { Team } from '../types';

export const TEAMS: Team[] = [
  { id: 'team-scheduling', name: 'Scheduling', members: [1], color: '#059669', icon: '\u{1F4C5}' },
  { id: 'team-playout', name: 'Playout / MCR', members: [2], color: '#d97706', icon: '\u{1F3AC}' },
  { id: 'team-traffic', name: 'Traffic & Compliance', members: [3], color: '#db2777', icon: '\u2696\uFE0F' },
  { id: 'team-content', name: 'Content & Rights', members: [4], color: '#7c3aed', icon: '\u{1F4DC}' },
  { id: 'team-epg', name: 'EPG & Metadata', members: [5], color: '#0891b2', icon: '\u{1F4E1}' },
];

export function createInitialTeams(): Team[] {
  return TEAMS.map(t => ({ ...t }));
}
