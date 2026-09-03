import { describe, it, expect } from 'vitest';
import { toConnectionInput } from '../connections';
import type { DBConnection } from '../../types';

describe('toConnectionInput', () => {
  it('keeps the id so the bridge can test a saved connection with its stored secret', () => {
    const stored: DBConnection = { id: 'c1', name: 'Prod', type: 'postgres', host: 'db', port: 5432, service: 'won', user: 'psi', password: '***', schema: 'psi' };
    const input = toConnectionInput(stored);
    expect(input.id).toBe('c1');
    expect(input.password).toBe('***');
    expect(input).not.toBe(stored);
  });
});
