import type { User } from '../types';

export const USERS: User[] = [
  { id: 0, name: 'Yannick De Smet', role: 'owner', av: 'YD', color: '#4f46e5', dept: 'Operations', title: 'Head of Broadcast Operations' },
  { id: 1, name: 'Lien Verstraete', role: 'manager', av: 'LV', color: '#059669', dept: 'Scheduling', title: 'Senior Scheduler' },
  { id: 2, name: 'Pieter Claes', role: 'member', av: 'PC', color: '#d97706', dept: 'Playout / MCR', title: 'Playout Operator' },
  { id: 3, name: 'Sophie De Ridder', role: 'member', av: 'SR', color: '#db2777', dept: 'Traffic & Compliance', title: 'Traffic Coordinator' },
  { id: 4, name: 'Niels Janssen', role: 'manager', av: 'NJ', color: '#7c3aed', dept: 'Content & Rights', title: 'Rights Manager' },
  { id: 5, name: 'Ava Mertens', role: 'member', av: 'AM', color: '#0891b2', dept: 'EPG & Metadata', title: 'EPG Coordinator' },
];
