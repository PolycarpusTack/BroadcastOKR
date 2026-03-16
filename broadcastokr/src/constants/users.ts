import type { User } from '../types';

export const USERS: User[] = [
  { id: 0, name: 'Yannick De Smet', role: 'owner', av: 'YD', color: '#5B33F0', dept: 'Operations', title: 'Head of Broadcast Operations' },
  { id: 1, name: 'Lien Verstraete', role: 'manager', av: 'LV', color: '#2DD4BF', dept: 'Scheduling', title: 'Senior Scheduler' },
  { id: 2, name: 'Pieter Claes', role: 'member', av: 'PC', color: '#F59E0B', dept: 'Playout / MCR', title: 'Playout Operator' },
  { id: 3, name: 'Sophie De Ridder', role: 'member', av: 'SR', color: '#F87171', dept: 'Traffic & Compliance', title: 'Traffic Coordinator' },
  { id: 4, name: 'Niels Janssen', role: 'manager', av: 'NJ', color: '#A78BFA', dept: 'Content & Rights', title: 'Rights Manager' },
  { id: 5, name: 'Ava Mertens', role: 'member', av: 'AM', color: '#60A5FA', dept: 'EPG & Metadata', title: 'EPG Coordinator' },
];
