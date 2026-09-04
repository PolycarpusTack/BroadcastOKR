import { describe, it, expect, afterEach } from 'vitest';
import { TIER_FEATURES, setRuntimeLicence, getRuntimeTier, hasEntitlement } from '../entitlements';
// @ts-expect-error — CJS bridge module; the test exists to pin the mirror
import bridgeEditions from '../../../bridge/editions.cjs';

afterEach(() => setRuntimeLicence('enterprise'));

describe('tier mirror (R3)', () => {
  it('src TIER_FEATURES equals bridge/editions.cjs TIER_FEATURES — the server refuses, the UI hides', () => {
    expect(TIER_FEATURES).toEqual(bridgeEditions.TIER_FEATURES);
    expect(Object.keys(TIER_FEATURES)).toEqual(bridgeEditions.TIERS);
  });

  it('runtime licence follows the health payload and ignores garbage', () => {
    expect(getRuntimeTier()).toBe('enterprise');
    setRuntimeLicence('starter');
    expect(getRuntimeTier()).toBe('starter');
    expect(hasEntitlement('liveKRs')).toBe(false);
    expect(hasEntitlement('templates')).toBe(false);
    setRuntimeLicence('pro', { liveKRs: true, agents: true, templates: true, sharing: false });
    expect(hasEntitlement('liveKRs')).toBe(true);
    expect(hasEntitlement('sharing')).toBe(false);
    // A bridge-side override wins over the tier default
    setRuntimeLicence('pro', { sharing: true });
    expect(hasEntitlement('sharing')).toBe(true);
    setRuntimeLicence('gold');
    expect(getRuntimeTier()).toBe('pro');
    expect(hasEntitlement('agents', 'starter')).toBe(false);
  });
});
