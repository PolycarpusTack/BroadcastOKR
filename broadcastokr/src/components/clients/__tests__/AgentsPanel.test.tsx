import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AgentsPanel } from '../AgentsPanel';
import { THEMES } from '../../../constants/themes';
import type { AgentsApi, AgentInfo } from '../../../utils/cockpitApi';

const theme = THEMES.light;

function fakeApi(initial: AgentInfo[]) {
  let agents = initial;
  const api: AgentsApi = {
    list: vi.fn(async () => agents),
    mintEnrolToken: vi.fn(async () => ({ token: 'tok-once', expiresInMinutes: 15 })),
    revoke: vi.fn(async (id: string) => { agents = agents.map((a) => (a.id === id ? { ...a, revoked: true } : a)); }),
  };
  return api;
}

describe('AgentsPanel', () => {
  it('lists agents with last-seen and never-seen', async () => {
    const api = fakeApi([
      { id: 'agent_a', name: 'site-a', createdAt: '2026-09-01T00:00:00Z', revoked: false, lastSeenAt: new Date(Date.now() - 60_000).toISOString() },
      { id: 'agent_b', name: 'site-b', createdAt: '2026-09-01T00:00:00Z', revoked: false },
    ]);
    render(<AgentsPanel api={api} canManage theme={theme} />);
    await screen.findByText('site-a');
    expect(screen.getByText(/seen .*ago|seen just now|seen 1m/i)).toBeTruthy();
    expect(screen.getByText('never seen')).toBeTruthy();
  });

  it('mints an enrolment token and shows the exact command once', async () => {
    const api = fakeApi([]);
    render(<AgentsPanel api={api} canManage instanceUrl="https://tenant.example" theme={theme} />);
    await screen.findByText('No agents enrolled yet.');
    fireEvent.click(screen.getByText('New enrolment token'));
    const command = await screen.findByTestId('enrol-command');
    expect(command.textContent).toContain('--instance https://tenant.example');
    expect(command.textContent).toContain('--token tok-once');
    fireEvent.click(screen.getByText('Done, hide it'));
    expect(screen.queryByTestId('enrol-command')).toBeNull();
  });

  it('revokes only on the second click, then reloads the list', async () => {
    const api = fakeApi([{ id: 'agent_a', name: 'site-a', createdAt: '2026-09-01T00:00:00Z', revoked: false }]);
    render(<AgentsPanel api={api} canManage theme={theme} />);
    await screen.findByText('site-a');
    fireEvent.click(screen.getByText('Revoke'));
    expect(api.revoke).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Confirm revoke'));
    await waitFor(() => expect(api.revoke).toHaveBeenCalledWith('agent_a'));
    await screen.findByText('revoked');
  });

  it('hides the controls for readers', async () => {
    const api = fakeApi([{ id: 'agent_a', name: 'site-a', createdAt: '2026-09-01T00:00:00Z', revoked: false }]);
    render(<AgentsPanel api={api} canManage={false} theme={theme} />);
    await screen.findByText('site-a');
    expect(screen.queryByText('New enrolment token')).toBeNull();
    expect(screen.queryByText('Revoke')).toBeNull();
  });
});
