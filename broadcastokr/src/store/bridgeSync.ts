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

/** Fetch wrapper with auth header, mirroring useBridge's apiFetch */
export async function bridgeFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const authHeaders: Record<string, string> = BRIDGE_API_KEY
    ? { Authorization: `Bearer ${BRIDGE_API_KEY}` }
    : {};
  const res = await fetch(`${BRIDGE_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...authHeaders, ...options?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || `HTTP ${res.status}`);
  }
  return res.json();
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
