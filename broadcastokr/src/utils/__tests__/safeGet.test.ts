import { describe, it, expect } from 'vitest';
import { safeUser, safeChannel } from '../safeGet';
import { USERS, CHANNELS } from '../../constants';

describe('safeUser', () => {
  it('returns the correct user for valid id', () => {
    expect(safeUser(USERS, 0)).toBe(USERS[0]);
    expect(safeUser(USERS, 1)).toBe(USERS[1]);
  });

  it('returns fallback for unknown id', () => {
    const result = safeUser(USERS, 999);
    expect(result.name).toBe('Unknown');
    expect(result.id).toBe(-1);
  });

  it('returns fallback for negative id', () => {
    const result = safeUser(USERS, -1);
    expect(result.name).toBe('Unknown');
  });
});

describe('safeChannel', () => {
  it('returns the correct channel for valid index', () => {
    expect(safeChannel(CHANNELS, 0)).toBe(CHANNELS[0]);
  });

  it('returns fallback for out-of-bounds index', () => {
    const result = safeChannel(CHANNELS, 999);
    expect(result.name).toBe('Unknown');
  });
});
