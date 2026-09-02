import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SetupWizard } from '../SetupWizard';
import type { WizardBridge } from '../wizardTypes';
import { THEMES } from '../../../constants/themes';
import { AuthProvider } from '../../../context/AuthContext';

function makeBridge(over: Partial<WizardBridge> = {}): WizardBridge {
  return {
    connected: true,
    bridgeRunning: true,
    startBridge: vi.fn(),
    testConnection: vi.fn().mockResolvedValue({ ok: true, message: 'ok' }),
    saveConnection: vi.fn().mockResolvedValue({ ok: true, connection: { id: 'conn_1' } }),
    getConnections: vi.fn().mockResolvedValue([]),
    getChannels: vi.fn().mockResolvedValue([]),
    getTables: vi.fn().mockResolvedValue([]),
    getColumns: vi.fn().mockResolvedValue([]),
    previewQuery: vi.fn().mockResolvedValue([]),
    saveKPI: vi.fn().mockResolvedValue({ ok: true, kpi: { id: 'kpi_1' } }),
    executeBatch: vi.fn().mockResolvedValue({ results: [] }),
    ...over,
  } as WizardBridge;
}

const OWNER = { fleet: true, isOwner: true, canCreate: true, canEdit: true };
const MEMBER = { fleet: true, isOwner: false, canCreate: false, canEdit: false };

function renderWizard(over: Partial<WizardBridge> = {}, ctx = OWNER) {
  const onComplete = vi.fn();
  const onDismiss = vi.fn();
  const bridge = makeBridge(over);
  render(
    <AuthProvider>
      <SetupWizard
        open
        onDismiss={onDismiss}
        onComplete={onComplete}
        theme={THEMES.light}
        bridge={bridge}
        context={ctx}
      />
    </AuthProvider>,
  );
  return { onComplete, onDismiss, bridge };
}

// Each step change re-renders a Modal, and Modal-based tests in this repo run
// at roughly 1-2s apiece under jsdom (HelpModal's are comparable). A walk
// through several steps therefore crosses the 5s default once the full suite
// is running in parallel — the tests are slow, not flaky.
vi.setConfig({ testTimeout: 20000 });

describe('SetupWizard', () => {
  it('starts on Welcome and shows the whole road in the progress rail', () => {
    renderWizard();
    expect(screen.getByRole('heading', { name: /Welcome/ })).toBeTruthy();
    // The rail names every step so the length of the process is visible up front.
    for (const label of ['Bridge', 'Database', 'Client', 'First goal', 'Done']) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });

  it('reports a healthy bridge on the bridge step', () => {
    renderWizard();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Bridge connected')).toBeTruthy();
  });

  it('offers to start the bridge when it is not reachable', () => {
    renderWizard({ connected: false });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Bridge not reachable')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Start bridge service/ })).toBeTruthy();
  });

  it('offers Skip instead of a dead Next on an unfinished optional step', () => {
    renderWizard();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));   // bridge
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));   // database

    expect(screen.getByRole('heading', { name: /Database/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Skip for now/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
  });

  it('explains a missing encryption key rather than showing a raw failure', async () => {
    const saveConnection = vi.fn().mockRejectedValue(
      new Error('Credential encryption is not configured on this instance. Set BRIDGE_ENCRYPTION_KEY before storing database credentials.'),
    );
    renderWizard({ saveConnection });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    fireEvent.change(screen.getByLabelText('Host'), { target: { value: 'db.example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /Save connection/ }));

    await waitFor(() => expect(screen.getByText(/whoever runs the server/i)).toBeTruthy());
  });

  it('skips owner-only steps for a member', () => {
    renderWizard({}, MEMBER);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));   // bridge
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));   // -> path, not database

    expect(screen.getByRole('heading', { name: /What to measure/ })).toBeTruthy();
  });

  it('drops the goal step when the user picks the KPI path', () => {
    renderWizard();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));          // welcome
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));          // bridge
    fireEvent.click(screen.getByRole('button', { name: /Skip for now/ })); // database
    fireEvent.click(screen.getByRole('button', { name: /Skip for now/ })); // client

    expect(screen.getByRole('heading', { name: /What to measure/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /A dashboard KPI/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(screen.getByRole('heading', { name: /Dashboard KPI/ })).toBeTruthy();
    expect(screen.queryByText('First goal')).toBeNull();
  });

  it('records the goal before syncing it, so a failed sync cannot create it twice', async () => {
    // Review 2026-09-02 F6: the goal was added to the store first and the
    // wizard only remembered it after a successful sync. A sync that threw
    // left the form up; a retry made a second goal.
    // The store's own bridge write (POST /api/goals) goes through global
    // fetch with retry backoff; answer it instantly so the test measures the
    // wizard, not the retry schedule.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } })));
    const { bridge } = renderWizard({
      getConnections: vi.fn().mockResolvedValue([{ id: 'conn_1', name: 'PSI', type: 'postgres', host: 'h', port: 1, service: 's', user: 'u', password: '***' }]),
      executeBatch: vi.fn().mockRejectedValue(new Error('Insufficient permissions')),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));          // welcome
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));          // bridge
    fireEvent.click(screen.getByRole('button', { name: /Skip for now/ })); // database
    fireEvent.click(screen.getByRole('button', { name: /Skip for now/ })); // client
    fireEvent.click(screen.getByRole('button', { name: /A goal with a live Key Result/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    fireEvent.change(screen.getByLabelText('Goal title'), { target: { value: 'Subtitle readiness' } });
    fireEvent.change(screen.getByLabelText('Key Result'), { target: { value: 'Approved subtitles' } });
    await waitFor(() => expect(screen.getByLabelText('KR connection').querySelectorAll('option').length).toBeGreaterThan(1));
    fireEvent.change(screen.getByLabelText('KR connection'), { target: { value: 'conn_1' } });
    fireEvent.change(screen.getByLabelText('KR SQL query'), { target: { value: 'SELECT 1 AS value' } });
    fireEvent.click(screen.getByRole('button', { name: /Create goal and fetch the number/ }));

    await waitFor(() => expect(screen.getByText(/created, but syncing it failed/i)).toBeTruthy());
    expect(bridge.executeBatch).toHaveBeenCalledTimes(1);
    // The step now shows the created state — no second "Create" button to press.
    expect(screen.queryByRole('button', { name: /Create goal and fetch the number/ })).toBeNull();
    expect(screen.getByText(/“Subtitle readiness” created/)).toBeTruthy();
    vi.unstubAllGlobals();
  });

  it('completes from the final step', () => {
    // A client-edition manager: no credential steps, but goal and KPI apply.
    const { onComplete } = renderWizard({}, { fleet: false, isOwner: false, canCreate: true, canEdit: true });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));  // welcome
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));  // bridge
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));  // path
    fireEvent.click(screen.getByRole('button', { name: /^Skip for now$/ })); // goal
    fireEvent.click(screen.getByRole('button', { name: /^Skip for now$/ })); // kpi

    expect(screen.getByRole('heading', { name: /Done/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onComplete).toHaveBeenCalled();
  });

  it('leaves what was already created alone when dismissed', () => {
    const { onDismiss } = renderWizard();
    // "Finish later" is deliberately not "Cancel" — nothing is rolled back.
    fireEvent.click(screen.getByRole('button', { name: /Finish later/ }));
    expect(onDismiss).toHaveBeenCalled();
  });
});
