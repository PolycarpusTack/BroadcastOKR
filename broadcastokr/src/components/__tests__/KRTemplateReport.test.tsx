import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { KRTemplateReportView } from '../reports/KRTemplateReportView';
import type { Client, Goal, GoalTemplate, Theme } from '../../types';

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

const goalTemplate: GoalTemplate = {
  id: 'gt1',
  title: 'Broadcast Performance',
  category: 'Operations',
  period: 'Q1 2026',
  krTemplates: [
    {
      id: 'krt1',
      title: 'Uptime KR',
      sql: 'SELECT uptime FROM metrics',
      unit: '%',
      direction: 'hi',
      start: 0,
      target: 100,
    },
  ],
};

const goalWithKRTemplate: Goal = {
  id: 'g1', title: 'Alpha Broadcast Goal', status: 'on_track', progress: 0.8,
  owner: 1, channel: 0, period: 'Q1 2026',
  templateId: 'gt1',
  clientIds: ['c1'],
  keyResults: [
    {
      id: 'kr1', title: 'Uptime', start: 0, target: 100, current: 80,
      progress: 0.8, status: 'on_track',
      krTemplateId: 'krt1',
    },
  ],
};

describe('KRTemplateReportView', () => {
  it('renders the KR template selector dropdown', () => {
    render(
      <KRTemplateReportView
        goals={[goalWithKRTemplate]}
        clients={[clientA, clientB]}
        goalTemplates={[goalTemplate]}
        theme={theme}
      />
    );
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('shows empty state when no template is selected', () => {
    render(
      <KRTemplateReportView
        goals={[goalWithKRTemplate]}
        clients={[clientA, clientB]}
        goalTemplates={[goalTemplate]}
        theme={theme}
      />
    );
    expect(
      screen.getByText(/Select a KR template to compare across clients/i)
    ).toBeInTheDocument();
  });

  it('shows "No clients have materialized this template" when template has no matching goals', () => {
    render(
      <KRTemplateReportView
        goals={[]}
        clients={[clientA, clientB]}
        goalTemplates={[goalTemplate]}
        theme={theme}
      />
    );
    const select = screen.getByRole('combobox');
    // Select the krt1 option — value is the krTemplate id
    fireEvent.change(select, { target: { value: 'krt1' } });
    expect(
      screen.getByText(/No clients have materialized this template/i)
    ).toBeInTheDocument();
  });
});
