import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Sidebar } from '../layout/Sidebar';
import { DeploymentProvider } from '../../context/DeploymentContext';
import { useStore } from '../../store/store';
import type { Theme, User, Client } from '../../types';
import type { TenancyMode } from '../../editions/entitlements';

// R6-6: the sidebar brand block names the edition — the MGX Cockpit and a
// client instance must not look alike ten minutes into a demo.

const theme: Theme = {
  bg: '#fff', bgCard: '#fff', bgCardHover: '#f5f5f5', bgSidebar: '#f5f5f5',
  bgSidebarActive: '#eee', bgInput: '#fff', bgMuted: '#f5f5f5', border: '#ddd',
  borderLight: '#eee', borderInput: '#ccc', text: '#000', textSecondary: '#666',
  textMuted: '#999', textFaint: '#bbb', sidebarText: '#333', sidebarTextActive: '#000',
  overlay: 'rgba(0,0,0,0.5)', headerBg: '#fff', compliantBg: '#e6ffed',
  compliantBorder: '#10b981', atRiskBg: '#fff3cd', atRiskBorder: '#f59e0b',
};

const user: User = { id: 1, name: 'Jane Smith', av: 'JS', role: 'owner', dept: 'Ops', title: 'Owner', color: '#F59E0B' };
const tenantZero: Client = { id: 'c1', name: 'Tenant Zero', connectionId: '', color: '#3805E3', channels: [] };

function renderSidebar(mode: TenancyMode) {
  return render(
    <MemoryRouter>
      <DeploymentProvider mode={mode}>
        <Sidebar open onToggle={() => {}} theme={theme} user={user} actLogCount={0} onOpenLog={() => {}} />
      </DeploymentProvider>
    </MemoryRouter>,
  );
}

describe('Sidebar — edition label (R6-6)', () => {
  beforeEach(() => {
    useStore.setState({ clients: [tenantZero] });
  });

  it('names the cockpit', () => {
    renderSidebar('cockpit');
    expect(screen.getByTestId('edition-label').textContent).toBe('MGX Cockpit');
  });

  it('names a client instance after its pinned client', () => {
    renderSidebar('client');
    expect(screen.getByTestId('edition-label').textContent).toBe('Client · Tenant Zero');
  });

  it('falls back to "Client instance" before the pinned client is known', () => {
    useStore.setState({ clients: [] });
    renderSidebar('client');
    expect(screen.getByTestId('edition-label').textContent).toBe('Client instance');
  });

  it('keeps desktop quiet', () => {
    renderSidebar('desktop');
    expect(screen.getByTestId('edition-label').textContent).toBe('Desktop');
  });
});
