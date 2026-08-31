import type { DBConnection } from '../types';

/** Strip the id so a stored connection can be passed to /api/test-connection. */
export function toConnectionInput({ id, ...connection }: DBConnection): Omit<DBConnection, 'id'> {
  void id;
  return connection;
}
