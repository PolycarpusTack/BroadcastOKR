import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TenantModal } from '../TenantModal';
import { THEMES } from '../../../constants/themes';
import type { CockpitApi, TenantStatus, TenantSummary } from '../../../utils/cockpitApi';
import type { Client } from '../../../types';

const theme = THEMES.light;
const client: Client = { id: 't0', name: 'Tenant Zero', connectionId: '', color: '#000', channels: [] };

function fakeApi(overrides: Partial<CockpitApi> = {}, state: { summary: TenantSummary; status: TenantStatus }) {
  const api: CockpitApi = {
    listTenants: vi.fn(async () => [state.summary]),
    registerTenant: vi.fn(async (_id, input) => {
      state.summary = { ...state.summary, instanceUrl: input.instanceUrl, operatorTokenSet: state.summary.operatorTokenSet || !!input.operatorToken };
      return { ok: true, tenant: state.summary };
    }),
    tenantStatus: vi.fn(async () => state.status),
    tenantUsage: vi.fn(async () => ({
      tier: 'pro' as const, caps: { channels: 10, seats: 5, agents: 2 }, seats: { total: 3, editors: 2, viewers: 1 },
      channels: 4, agents: { active: 1, revoked: 0 }, liveKRs: 3, sharedKRs: 1, goals: { active: 2, archived: 1 }, computedAt: '2026-09-04T00:00:00Z',
    })),
    mintShareToken: vi.fn(async () => ({ ok: true, clientId: 't0', token: 'share-once' })),
    tenantConnections: vi.fn(async () => [
      { id: 'conn_psi', name: 'PSI', type: 'postgres' as const, host: 'db', port: 5432, service: 'w', schema: 'psi', user: 'u', password: '***' },
    ]),
    saveTenantConnection: vi.fn(async (_id, conn) => ({ ok: true, connection: conn })),
    deleteTenantConnection: vi.fn(async () => ({ ok: true })),
    testTenantConnection: vi.fn(async () => ({ ok: true, message: 'ok' })),
    bindTenantConnection: vi.fn(async (_id, connectionId) => {
      state.status = { ...state.status, client: { ...client, id: 'client_t0', connectionId } };
      return { ok: true, client: state.status.client! };
    }),
    refreshTenantChannels: vi.fn(async () => ({ ok: true, channels: [] })),
    tenantAgents: vi.fn(() => ({
      list: async () => [],
      mintEnrolToken: async () => ({ token: 't', expiresInMinutes: 15 }),
      revoke: async () => ({}),
    })),
    ...overrides,
  };
  return api;
}

const unregistered = (): { summary: TenantSummary; status: TenantStatus } => ({
  summary: { clientId: 't0', name: 'Tenant Zero', instanceUrl: '', operatorTokenSet: false, shareTokenMintedAt: null },
  status: { reachable: false, version: null, mode: null, tier: null, operatorAccepted: false, client: null, detail: null },
});

const registered = (): { summary: TenantSummary; status: TenantStatus } => ({
  summary: { clientId: 't0', name: 'Tenant Zero', instanceUrl: 'http://tenant', operatorTokenSet: true, shareTokenMintedAt: null },
  status: { reachable: true, version: '0.9.1', mode: 'client', tier: 'pro', operatorAccepted: true, client: { ...client, id: 'client_t0' }, detail: null },
});

describe('TenantModal', () => {
  it('registers an unregistered tenant with URL and operator token', async () => {
    const state = unregistered();
    const api = fakeApi({}, state);
    render(<TenantModal open onClose={() => {}} client={client} theme={theme} api={api} />);
    await screen.findByText('Not registered yet.');
    fireEvent.change(screen.getByPlaceholderText('https://tenant.example'), { target: { value: 'http://tenant/' } });
    fireEvent.change(screen.getByPlaceholderText(/BRIDGE_OPERATOR_TOKEN/), { target: { value: 'op-secret' } });
    fireEvent.click(screen.getByText('Register'));
    await waitFor(() => expect(api.registerTenant).toHaveBeenCalledWith('t0', { instanceUrl: 'http://tenant/', operatorToken: 'op-secret' }));
    await screen.findByText('✓ Instance registered.');
  });

  it('shows reachability, lists tenant connections, and binds the chosen one', async () => {
    const state = registered();
    const api = fakeApi({}, state);
    render(<TenantModal open onClose={() => {}} client={client} theme={theme} api={api} />);
    await screen.findByText(/Reachable · v0.9.1 · pro licence · operator token accepted/);
    expect((await screen.findByTestId('tenant-usage')).textContent).toContain('seats 2 / 5');
    expect(screen.getByText(/no connection bound/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Tenant connection'), { target: { value: 'conn_psi' } });
    fireEvent.click(screen.getByText('Bind'));
    await waitFor(() => expect(api.bindTenantConnection).toHaveBeenCalledWith('t0', 'conn_psi'));
    await screen.findByText(/bound: PSI/);
  });

  it('mints a share token and shows the env lines once', async () => {
    const state = registered();
    const api = fakeApi({}, state);
    render(<TenantModal open onClose={() => {}} client={client} theme={theme} api={api} />);
    await screen.findByText(/operator token accepted/);
    fireEvent.click(screen.getByText('Mint share token'));
    const env = await screen.findByTestId('share-env');
    expect(env.textContent).toContain('BRIDGE_SHARE_TOKEN=share-once');
  });

  it('surfaces an unreachable tenant as a readable line', async () => {
    const state = registered();
    state.status = { ...state.status, reachable: false, operatorAccepted: false, client: null, detail: 'Tenant Zero at http://tenant: no answer within 5 s' };
    const api = fakeApi({}, state);
    render(<TenantModal open onClose={() => {}} client={client} theme={theme} api={api} />);
    await screen.findByText(/Unreachable — Tenant Zero at http:\/\/tenant: no answer within 5 s/);
    expect(screen.queryByLabelText('Tenant connection')).toBeNull();
  });
});
