import { describe, it, expect } from 'vitest';
import { ROLE_PERMS } from '../../constants/roles';
// @ts-expect-error — CJS bridge module; the test exists to pin the mirror
import bridgePerms from '../../../bridge/permissions.cjs';

describe('permissions mirror', () => {
  it('src ROLE_PERMS equals bridge/permissions.cjs — the server is authoritative, the UI must agree', () => {
    expect(ROLE_PERMS).toEqual(bridgePerms.ROLE_PERMS);
  });
});
