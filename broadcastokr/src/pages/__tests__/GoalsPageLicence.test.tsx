import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { GoalsPage } from '../GoalsPage';
import { GoalFormKRList } from '../../components/goals/GoalFormKRList';
import { ThemeProvider } from '../../context/ThemeContext';
import { AuthProvider } from '../../context/AuthContext';
import { ToastProvider } from '../../context/ToastContext';
import { ActivityLogProvider } from '../../context/ActivityLogContext';
import { DeploymentProvider } from '../../context/DeploymentContext';
import { setRuntimeLicence, type Tier } from '../../editions/entitlements';
import { useStore } from '../../store/store';
import { THEMES } from '../../constants/themes';

// R3-2: the UI hides what the licence does not include — the server refuses it anyway (FF-8).

function page(tier: Tier) {
  setRuntimeLicence(tier);
  return render(
    <MemoryRouter>
      <ThemeProvider>
        <AuthProvider>
          <ToastProvider>
            <ActivityLogProvider>
              <DeploymentProvider mode="client" tier={tier}>
                <GoalsPage bridgeConnected />
              </DeploymentProvider>
            </ActivityLogProvider>
          </ToastProvider>
        </AuthProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
}

const conn = { id: 'c1', name: 'PSI', type: 'oracle' as const, host: 'db', port: 1521, service: 'l', schema: 'PSI', user: 'u', password: '***' };
const kr = { title: 'KR', start: 0, target: 10 };

describe('licence gates in the UI', () => {
  beforeEach(() => { useStore.setState({ goals: [], goalTemplates: [{ id: 't1', title: 'T', category: 'Custom', period: 'Q3 2026', krTemplates: [] }], clients: [] }); });
  afterEach(() => setRuntimeLicence('enterprise'));

  it('starter: no Templates view; pro: Templates view present', () => {
    const starter = page('starter');
    expect(screen.queryByText(/^Templates \(/)).toBeNull();
    starter.unmount();
    page('pro');
    expect(screen.getByText(/^Templates \(/)).toBeTruthy();
  });

  it('starter: the live toggle is not offered even with a connection; enterprise: it is', () => {
    setRuntimeLicence('starter');
    const a = render(
      <DeploymentProvider mode="client" tier="starter">
        <GoalFormKRList theme={THEMES.light} krs={[kr]} setKRs={() => {}} selectStyle={{}} showSharing={false} connections={[conn]} />
      </DeploymentProvider>,
    );
    expect(screen.queryByText(/Manual/)).toBeNull();
    a.unmount();
    setRuntimeLicence('enterprise');
    render(
      <DeploymentProvider mode="client" tier="enterprise">
        <GoalFormKRList theme={THEMES.light} krs={[kr]} setKRs={() => {}} selectStyle={{}} showSharing={false} connections={[conn]} />
      </DeploymentProvider>,
    );
    expect(screen.getByText(/Manual/)).toBeTruthy();
  });
});
