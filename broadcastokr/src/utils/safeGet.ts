import type { User, Channel } from '../types';

const FALLBACK_USER: User = {
  id: -1,
  name: 'Unknown',
  role: 'member',
  av: '?',
  color: '#94a3b8',
  dept: '',
  title: '',
};

const FALLBACK_CHANNEL: Channel = {
  name: 'Unknown',
  color: '#94a3b8',
  type: 'unknown',
  icon: '\u2753',
};

export function safeUser(users: User[], index: number): User {
  return users[index] ?? FALLBACK_USER;
}

export function safeChannel(channels: Channel[], index: number): Channel {
  return channels[index] ?? FALLBACK_CHANNEL;
}
