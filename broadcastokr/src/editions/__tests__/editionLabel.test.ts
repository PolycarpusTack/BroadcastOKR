import { describe, it, expect } from 'vitest';
import { editionLabel, editionTitle } from '../editionLabel';
import { PRIMARY_GRADIENT } from '../../constants/config';

// R6-6: one value tells the three surfaces which edition this is.
describe('editionLabel', () => {
  it('names the cockpit and gives it its own accent', () => {
    const l = editionLabel('cockpit');
    expect(l.name).toBe('MGX Cockpit');
    expect(l.cloud).toBe(true);
    expect(l.iconBackground).not.toBe(PRIMARY_GRADIENT);
  });

  it('names a client instance after its pinned client once known', () => {
    expect(editionLabel('client').name).toBe('Client instance');
    expect(editionLabel('client', '  ').name).toBe('Client instance');
    expect(editionLabel('client', 'Tenant Zero').name).toBe('Client · Tenant Zero');
    expect(editionLabel('client', 'Tenant Zero').iconBackground).toBe(PRIMARY_GRADIENT);
  });

  it('keeps desktop quiet', () => {
    const l = editionLabel('desktop', 'ignored');
    expect(l.name).toBe('Desktop');
    expect(l.cloud).toBe(false);
  });

  it('puts the edition first in the document title, and leaves desktop alone', () => {
    expect(editionTitle('cockpit')).toBe('MGX Cockpit — BroadcastOKR');
    expect(editionTitle('client', 'VRT')).toBe('Client · VRT — BroadcastOKR');
    expect(editionTitle('client')).toBe('Client instance — BroadcastOKR');
    expect(editionTitle('desktop')).toBe('BroadcastOKR');
  });
});
