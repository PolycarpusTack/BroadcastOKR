import { describe, it, expect } from 'vitest';
import { PROTOCOL_VERSION } from '../../constants/config';
// @ts-expect-error — CJS bridge module, no types; the whole point is pinning the mirror
import bridgeProtocol from '../../../bridge/protocol.cjs';

describe('protocol mirror', () => {
  it('src PROTOCOL_VERSION equals bridge/protocol.cjs (the CJS/ESM mirror must not drift)', () => {
    expect(PROTOCOL_VERSION).toBe(bridgeProtocol.PROTOCOL_VERSION);
  });
});
