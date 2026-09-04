import { bridgeFetch } from '../store/bridgeSync';
import type { Client, DBConnection } from '../types';

/**
 * The operator channel, as the cockpit UI sees it (R6-1). Every call here is
 * a cockpit route that forwards to the tenant instance with its operator
 * token; the tenant's own status and body come back, so a refused delete is
 * still `connection_in_use` and an unreachable instance is a 502 whose
 * `detail` names the tenant. `bridgeFetch` turns `detail` into the thrown
 * message, which is what the modal shows.
 */

export interface TenantSummary {
  clientId: string;
  name: string;
  instanceUrl: string;
  operatorTokenSet: boolean;
  shareTokenMintedAt: string | null;
}

export interface TenantStatus {
  reachable: boolean;
  version: string | null;
  mode: string | null;
  /** The tenant's licence tier (R3), from its public health. */
  tier: 'starter' | 'pro' | 'enterprise' | null;
  operatorAccepted: boolean;
  client: Client | null;
  detail: string | null;
}

/** GET /api/usage on an instance (R3). */
export interface TenantUsage {
  tier: 'starter' | 'pro' | 'enterprise';
  caps: { channels: number | null; seats: number | null; agents: number | null };
  seats: { total: number; editors: number; viewers: number };
  channels: number;
  agents: { active: number; revoked: number };
  liveKRs: number;
  sharedKRs: number;
  goals: { active: number; archived: number };
  computedAt: string;
}

export interface AgentInfo {
  id: string;
  name: string;
  createdAt: string;
  revoked: boolean;
  lastSeenAt?: string;
}

/** What the agents panel needs — the same shape whether it talks to its own
 *  instance or through the cockpit to a tenant. */
export interface AgentsApi {
  list(): Promise<AgentInfo[]>;
  mintEnrolToken(): Promise<{ token: string; expiresInMinutes: number }>;
  revoke(id: string): Promise<unknown>;
}

const call = <T,>(path: string, init?: RequestInit) => bridgeFetch<T>(path, init, { retries: 0 });
const json = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
});

export const cockpitApi = {
  listTenants: () => call<TenantSummary[]>('/api/cockpit/tenants'),

  registerTenant: (clientId: string, input: { instanceUrl: string; operatorToken?: string }) =>
    call<{ ok: boolean; tenant: TenantSummary }>(`/api/cockpit/tenants/${clientId}`, json('PUT', input)),

  tenantStatus: (clientId: string) => call<TenantStatus>(`/api/cockpit/tenants/${clientId}/status`),

  tenantUsage: (clientId: string) => call<TenantUsage>(`/api/cockpit/tenants/${clientId}/usage`),

  mintShareToken: (clientId: string) =>
    call<{ ok: boolean; clientId: string; token: string }>('/api/cockpit/tenants', json('POST', { clientId })),

  tenantConnections: (clientId: string) => call<DBConnection[]>(`/api/cockpit/tenants/${clientId}/connections`),

  saveTenantConnection: (clientId: string, conn: DBConnection) =>
    call<{ ok: boolean; connection: DBConnection }>(`/api/cockpit/tenants/${clientId}/connections`, json('POST', conn)),

  deleteTenantConnection: (clientId: string, connectionId: string) =>
    call<{ ok: boolean }>(`/api/cockpit/tenants/${clientId}/connections/${connectionId}`, { method: 'DELETE' }),

  testTenantConnection: (clientId: string, conn: Omit<DBConnection, 'id'>) =>
    call<{ ok: boolean; message: string }>(`/api/cockpit/tenants/${clientId}/test-connection`, json('POST', conn)),

  bindTenantConnection: (clientId: string, connectionId: string) =>
    call<{ ok: boolean; client: Client }>(`/api/cockpit/tenants/${clientId}/binding`, json('PUT', { connectionId })),

  refreshTenantChannels: (clientId: string) =>
    call<{ ok: boolean; channels: Client['channels'] }>(`/api/cockpit/tenants/${clientId}/channels`, json('POST', {})),

  tenantAgents: (clientId: string): AgentsApi => ({
    list: () => call<AgentInfo[]>(`/api/cockpit/tenants/${clientId}/agents`),
    mintEnrolToken: () =>
      call<{ token: string; expiresInMinutes: number }>(`/api/cockpit/tenants/${clientId}/agents/enrol-token`, json('POST', {})),
    revoke: (id: string) => call(`/api/cockpit/tenants/${clientId}/agents/${id}`, { method: 'DELETE' }),
  }),
};

export type CockpitApi = typeof cockpitApi;

/** The instance's own agents — the client edition's Settings page. */
export const ownAgentsApi: AgentsApi = {
  list: () => call<AgentInfo[]>('/api/agents'),
  mintEnrolToken: () => call<{ token: string; expiresInMinutes: number }>('/api/agents/enrol-token', json('POST', {})),
  revoke: (id: string) => call(`/api/agents/${id}`, { method: 'DELETE' }),
};
