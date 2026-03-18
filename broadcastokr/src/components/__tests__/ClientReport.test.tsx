import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ClientReportView } from '../reports/ClientReportView';
import type { Client, Goal, Theme } from '../../types';

const theme: Theme = {
  bg: '#0D1B2E', bgCard: '#132035', bgCardHover: '#1A2D47', bgSidebar: '#0A1628',
  bgSidebarActive: '#132035', bgInput: '#1A2D47', bgMuted: '#1A2D47', border: '#1F3A5A',
  borderLight: '#1A3050', borderInput: '#2A4A70', text: '#E8F4FD', textSecondary: '#8BA5C4',
  textMuted: '#5E7A9A', textFaint: '#3D5A7A', sidebarText: '#8BA5C4', sidebarTextActive: '#E8F4FD',
  overlay: 'rgba(0,0,0,0.7)', headerBg: '#0A1628', compliantBg: '#0D2918',
  compliantBorder: '#10b981', atRiskBg: '#2D1B00', atRiskBorder: '#f59e0b',
};

const clientA: Client = {
  id: 'c1', name: 'Client Alpha', connectionId: 'conn1', color: '#3805E3',
  channels: [],
};

const clientB: Client = {
  id: 'c2', name: 'Client Beta', connectionId: 'conn2', color: '#2DD4BF',
  channels: [],
};

const goalForClientA: Goal = {
  id: 'g1', title: 'Alpha Goal', status: 'on_track', progress: 0.8,
  owner: 1, channel: 0, period: 'Q1 2026',
  keyResults: [
    {
      id: 'kr1', title: 'KR One', start: 0, target: 100, current: 80,
      progress: 0.8, status: 'on_track',
    },
  ],
  clientIds: ['c1'],
};

const standaloneGoal: Goal = {
  id: 'g2', title: 'Standalone Goal', status: 'on_track', progress: 0.5,
  owner: 1, channel: 0, period: 'Q1 2026',
  keyResults: [],
  // no clientIds — should be excluded
};

describe('ClientReportView', () => {
  it('renders the client selector dropdown', () => {
    render(
      <ClientReportView
        goals={[goalForClientA, standaloneGoal]}
        clients={[clientA, clientB]}
        theme={theme}
      />
    );
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.getByText('All Clients')).toBeInTheDocument();
  });

  it('lists client options in the dropdown', () => {
    render(
      <ClientReportView
        goals={[goalForClientA]}
        clients={[clientA, clientB]}
        theme={theme}
      />
    );
    // Both clients should appear at least once (as dropdown options)
    expect(screen.getAllByText('Client Alpha').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Client Beta').length).toBeGreaterThanOrEqual(1);
  });

  it('shows "No goals for this client" when selected client has no goals', () => {
    render(
      <ClientReportView
        goals={[goalForClientA]}
        clients={[clientA, clientB]}
        theme={theme}
      />
    );
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'c2' } });
    expect(screen.getByText(/No goals for this client/i)).toBeInTheDocument();
  });

  it('shows client goal when that client is selected', () => {
    render(
      <ClientReportView
        goals={[goalForClientA, standaloneGoal]}
        clients={[clientA, clientB]}
        theme={theme}
      />
    );
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'c1' } });
    expect(screen.getByText('Alpha Goal')).toBeInTheDocument();
    // Standalone goal (no clientIds) should not appear
    expect(screen.queryByText('Standalone Goal')).not.toBeInTheDocument();
  });

  it('excludes standalone goals in "All Clients" view', () => {
    render(
      <ClientReportView
        goals={[goalForClientA, standaloneGoal]}
        clients={[clientA, clientB]}
        theme={theme}
      />
    );
    // Default is "All Clients" — standaloneGoal has no clientIds, must be excluded
    expect(screen.queryByText('Standalone Goal')).not.toBeInTheDocument();
  });
});
