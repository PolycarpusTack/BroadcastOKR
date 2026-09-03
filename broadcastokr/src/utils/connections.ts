import type { DBConnection } from '../types';

/**
 * A stored connection as /api/test-connection wants it. The id stays: the
 * client only holds the masked password (`***`) for a saved connection, and
 * the bridge uses the id to test with the stored secret instead of the mask
 * (R1 rig, finding 27 — every saved connection used to test red).
 */
export function toConnectionInput(connection: DBConnection): Omit<DBConnection, 'id'> & { id: string } {
  return { ...connection };
}
