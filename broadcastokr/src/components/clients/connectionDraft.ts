import type { DBConnection } from '../../hooks/useBridge';

export interface ConnectionDraft {
  type: 'oracle' | 'postgres';
  host: string;
  port: string;
  service: string;
  schema: string;
  user: string;
  password: string;
  clientDir: string;
}

export const DEFAULT_PORT: Record<ConnectionDraft['type'], string> = {
  oracle: '1521',
  postgres: '5432',
};

/**
 * WHATS'ON's schema is PSI on both dialects, but Postgres folds unquoted
 * identifiers to lower case while Oracle folds up — so the default must follow
 * the type, or a Postgres connection saved with "PSI" browses an empty schema
 * (R1 rig, finding 33).
 */
export const DEFAULT_SCHEMA: Record<ConnectionDraft['type'], string> = {
  oracle: 'PSI',
  postgres: 'psi',
};

export function emptyConnectionDraft(): ConnectionDraft {
  return {
    type: 'oracle',
    host: '',
    port: DEFAULT_PORT.oracle,
    service: '',
    schema: DEFAULT_SCHEMA.oracle,
    user: '',
    password: '',
    clientDir: '',
  };
}

/** Draft → the shape the bridge stores. `clientDir` is Oracle-only. */
export function draftToConnection(draft: ConnectionDraft, name: string, id: string): DBConnection {
  return {
    id,
    name,
    type: draft.type,
    host: draft.host.trim(),
    port: Number(draft.port) || Number(DEFAULT_PORT[draft.type]),
    service: draft.service.trim(),
    schema: draft.schema.trim() || DEFAULT_SCHEMA[draft.type],
    user: draft.user.trim(),
    password: draft.password,
    clientDir: draft.type === 'oracle' && draft.clientDir.trim() ? draft.clientDir.trim() : undefined,
  };
}

/** Everything the bridge needs before an id exists — i.e. to test it. */
export function draftToConnectionInput(draft: ConnectionDraft, name: string): Omit<DBConnection, 'id'> {
  const { id, ...rest } = draftToConnection(draft, name, 'unsaved');
  void id;
  return rest;
}

