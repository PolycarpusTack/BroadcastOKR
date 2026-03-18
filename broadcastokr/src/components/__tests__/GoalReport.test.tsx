import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GoalReportView } from '../reports/GoalReportView';
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
  keyResults: [],
  clientIds: ['c1'],
};

const goalForClientB: Goal = {
  id: 'g2', title: 'Beta Goal', status: 'at_risk', progress: 0.5,
  owner: 1, channel: 0, period: 'Q1 2026',
  keyResults: [],
  clientIds: ['c2'],
};

const standaloneGoal: Goal = {
  id: 'g3', title: 'Standalone Goal', status: 'on_track', progress: 0.6,
  owner: 1, channel: 0, period: 'Q1 2026',
  keyResults: [],
  // no clientIds — should be in "Unassigned" group
};

const standaloneGoal2: Goal = {
  id: 'g4', title: 'Another Unassigned Goal', status: 'behind', progress: 0.2,
  owner: 1, channel: 0, period: 'Q1 2026',
  keyResults: [],
  clientIds: [],
};

describe('GoalReportView', () => {
  it('renders goal selector dropdown', () => {
    render(
      <GoalReportView
        goals={[goalForClientA, goalForClientB]}
        clients={[clientA, clientB]}
        theme={theme}
      />
    );
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('renders optgroup labels for clients', () => {
    const { container } = render(
      <GoalReportView
        goals={[goalForClientA, goalForClientB]}
        clients={[clientA, clientB]}
        theme={theme}
      />
    );
    const groups = container.querySelectorAll('optgroup');
    const labels = Array.from(groups).map(g => g.getAttribute('label'));
    expect(labels).toContain('Client Alpha');
    expect(labels).toContain('Client Beta');
  });

  it('shows "Unassigned" group for standalone goals', () => {
    const { container } = render(
      <GoalReportView
        goals={[goalForClientA, standaloneGoal, standaloneGoal2]}
        clients={[clientA]}
        theme={theme}
      />
    );
    const groups = container.querySelectorAll('optgroup');
    const labels = Array.from(groups).map(g => g.getAttribute('label'));
    expect(labels).toContain('Unassigned');
  });

  it('shows empty state message when no goal is selected', () => {
    render(
      <GoalReportView
        goals={[goalForClientA]}
        clients={[clientA]}
        theme={theme}
      />
    );
    expect(screen.getByText(/Select a goal to view detailed KR analysis/i)).toBeInTheDocument();
  });

  it('does not show "Unassigned" group when all goals have clients', () => {
    const { container } = render(
      <GoalReportView
        goals={[goalForClientA, goalForClientB]}
        clients={[clientA, clientB]}
        theme={theme}
      />
    );
    const groups = container.querySelectorAll('optgroup');
    const labels = Array.from(groups).map(g => g.getAttribute('label'));
    expect(labels).not.toContain('Unassigned');
  });
});
