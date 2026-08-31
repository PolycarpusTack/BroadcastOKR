import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { FleetMetricsPanel } from '../FleetMetricsPanel';
import { DeploymentProvider } from '../../../context/DeploymentContext';
import { ThemeProvider } from '../../../context/ThemeContext';

const mockFetch = vi.fn();
vi.mock('../../../store/bridgeSync', () => ({
  bridgeFetch: (...args: unknown[]) => mockFetch(...args),
  bridgeWriteFailed: vi.fn(),
}));

afterEach(() => vi.clearAllMocks());

describe('FleetMetricsPanel', () => {
  it('renders nothing outside cockpit mode', () => {
    const { container } = render(
      <ThemeProvider><DeploymentProvider mode="desktop"><FleetMetricsPanel connected /></DeploymentProvider></ThemeProvider>,
    );
    expect(container.firstChild).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('shows tenants and their metrics in cockpit mode', async () => {
    mockFetch.mockResolvedValue([{
      tenantId: 'aetn', tenantName: 'A+E Networks', color: '#F59E0B',
      metrics: [{ krId: 'kr1', value: 12, target: 5, direction: 'lo', timestamp: new Date().toISOString(), receivedAt: 'now' }],
    }]);
    render(<ThemeProvider><DeploymentProvider mode="cockpit"><FleetMetricsPanel connected /></DeploymentProvider></ThemeProvider>);

    await waitFor(() => expect(screen.getByText('A+E Networks')).toBeTruthy());
    expect(screen.getByText('12')).toBeTruthy();
    expect(mockFetch).toHaveBeenCalledWith('/api/cockpit/metrics', undefined, { retries: 0 });
  });
});
