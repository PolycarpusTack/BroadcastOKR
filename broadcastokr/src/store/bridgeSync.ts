import { BRIDGE_URL, BRIDGE_API_KEY } from '../constants/config';
import { logger } from '../utils/logger';
import type { Goal, Task, Client, GoalTemplate, User, Team, KPI } from '../types';

/**
 * Rejection handler for fire-and-forget store writes. Local state stays
 * authoritative (optimistic update already applied); this makes the divergence
 * visible instead of silently swallowing it — App.tsx listens for the event
 * and shows a debounced toast.
 */
export function bridgeWriteFailed(err: unknown): void {
  logger.error('Bridge write failed', err);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('bridge-write-failed'));
  }
}

export interface BridgeState {
  goals: Goal[];
  tasks: Task[];
  clients: Client[];
  goalTemplates: GoalTemplate[];
  users: User[];
  teams: Team[];
  kpis: KPI[];
  timestamp?: string;
}

export interface BridgeChanges {
  goals?: Goal[];
  tasks?: Task[];
  clients?: Client[];
  goalTemplates?: GoalTemplate[];
  users?: User[];
  teams?: Team[];
  kpis?: KPI[];
  timestamp?: string;
}

const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 2000, 4000];

/** A version-checked write lost the race; `current` is the server's row. */
export class ConflictError extends Error {
  current: unknown;
  constructor(current: unknown) {
    super('version_conflict');
    this.name = 'ConflictError';
    this.current = current;
  }
}

/** 4xx responses are deterministic — retrying them only repeats the answer. */
class NoRetryError extends Error {}

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * The single HTTP client for all bridge calls (auth header, 15s timeout,
 * retry with exponential backoff). Interactive callers that need fast
 * failure (health checks, UI-triggered fetches) pass `retries: 0`.
 */
export async function bridgeFetch<T>(
  path: string,
  options?: RequestInit,
  { retries = MAX_RETRIES }: { retries?: number } = {},
): Promise<T> {
  const authHeaders: Record<string, string> = BRIDGE_API_KEY
    ? { Authorization: `Bearer ${BRIDGE_API_KEY}` }
    : {};

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const res = await fetch(`${BRIDGE_URL}${path}`, {
        ...options,
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', ...authHeaders, ...options?.headers },
      });
      clearTimeout(timeout);

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (res.status === 409) {
          throw new ConflictError((body as { current?: unknown }).current);
        }
        const message = (body as { error?: string }).error || `HTTP ${res.status}`;
        throw res.status < 500 ? new NoRetryError(message) : new Error(message);
      }
      return res.json();
    } catch (err) {
      if (err instanceof ConflictError || err instanceof NoRetryError) throw err;
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < retries) {
        await delay(RETRY_DELAYS[attempt]);
      }
    }
  }

  throw lastError!;
}

/** GET /api/sync/state — full state snapshot */
export function fetchState(): Promise<BridgeState> {
  return bridgeFetch<BridgeState>('/api/sync/state');
}

/** GET /api/sync/changes?since= — incremental changes */
export function fetchChanges(since: string): Promise<BridgeChanges> {
  return bridgeFetch<BridgeChanges>(`/api/sync/changes?since=${encodeURIComponent(since)}`);
}

/** POST to bridge */
export function bridgePost(path: string, body: unknown): Promise<unknown> {
  return bridgeFetch(path, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/** PUT to bridge */
export function bridgePut(path: string, body: unknown): Promise<unknown> {
  return bridgeFetch(path, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

/** DELETE to bridge */
export function bridgeDelete(path: string): Promise<unknown> {
  return bridgeFetch(path, { method: 'DELETE' });
}

const entityWriteQueues = new Map<string, Promise<void>>();

/**
 * Version-checked PUT for goals/tasks. Writes to the same entity are
 * serialized client-side so a second rapid edit can't race the first PUT's
 * version echo (which would 409 against ourselves). The version is read via
 * `getVersion` at send time — after the previous write applied its echo.
 * A real conflict (someone else won) lands in `onConflict` with the server row.
 */
export function bridgePutEntity(
  kind: 'goals' | 'tasks',
  body: Record<string, unknown> & { id: string },
  hooks: {
    getVersion: () => number | undefined;
    onVersion: (version: number) => void;
    onConflict: (current: unknown) => void;
  },
): Promise<void> {
  const key = `${kind}:${body.id}`;
  const base = kind === 'goals' ? '/api/goals' : '/api/tasks';
  const task = async () => {
    try {
      const res = await bridgeFetch<{ ok: boolean; version?: number }>(`${base}/${body.id}`, {
        method: 'PUT',
        body: JSON.stringify({ ...body, version: hooks.getVersion() }),
      });
      if (typeof res.version === 'number') hooks.onVersion(res.version);
    } catch (err) {
      if (err instanceof ConflictError) {
        hooks.onConflict(err.current);
        return;
      }
      bridgeWriteFailed(err);
    }
  };
  const next = (entityWriteQueues.get(key) ?? Promise.resolve()).then(task);
  entityWriteQueues.set(key, next);
  return next;
}

/** POST /api/sync/migrate-from-local — migrate localStorage data to bridge */
export function migrateFromLocal(data: unknown): Promise<unknown> {
  return bridgePost('/api/sync/migrate-from-local', data);
}

export interface LocalSlices {
  goals: Goal[];
  tasks: Task[];
  clients: Client[];
  goalTemplates: GoalTemplate[];
  users: User[];
  teams: Team[];
}

export function isBridgeEmpty(state: BridgeState): boolean {
  return state.users.length === 0 && state.goals.length === 0 && state.tasks.length === 0;
}

export function hasLocalData(local: LocalSlices): boolean {
  return local.goals.length > 0 || local.tasks.length > 0;
}

/**
 * First-connect sync: adopt bridge state as truth, EXCEPT when the bridge DB is
 * empty and local state is not — then migrate local data up first, so connecting
 * to a fresh bridge never wipes existing local data. Migration inserts users
 * before goals/tasks, which also satisfies the owner/assignee FK constraints.
 */
export async function performInitialSync(
  local: LocalSlices,
  deps: {
    fetchState: () => Promise<BridgeState>;
    migrateFromLocal: (data: unknown) => Promise<unknown>;
  } = { fetchState, migrateFromLocal },
): Promise<BridgeState> {
  const state = await deps.fetchState();
  if (isBridgeEmpty(state) && hasLocalData(local)) {
    await deps.migrateFromLocal({
      users: local.users,
      teams: local.teams,
      clients: local.clients,
      goalTemplates: local.goalTemplates,
      goals: local.goals,
      tasks: local.tasks,
    });
    return deps.fetchState();
  }
  return state;
}
