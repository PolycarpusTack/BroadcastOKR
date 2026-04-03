import { BRIDGE_URL, BRIDGE_API_KEY } from '../constants/config';
import type { Goal, Task, Client, GoalTemplate, User, Team, KPI } from '../types';

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

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Fetch wrapper with auth header, retry with exponential backoff */
export async function bridgeFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const authHeaders: Record<string, string> = BRIDGE_API_KEY
    ? { Authorization: `Bearer ${BRIDGE_API_KEY}` }
    : {};

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
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
        throw new Error((body as { error?: string }).error || `HTTP ${res.status}`);
      }
      return res.json();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < MAX_RETRIES) {
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

/** POST /api/sync/migrate-from-local — migrate localStorage data to bridge */
export function migrateFromLocal(data: unknown): Promise<unknown> {
  return bridgePost('/api/sync/migrate-from-local', data);
}
