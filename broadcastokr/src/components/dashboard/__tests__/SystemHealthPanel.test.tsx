import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SystemHealthPanel } from '../SystemHealthPanel';
import { THEMES } from '../../../constants/themes';
import type { BridgeHealth } from '../../../hooks/useBridge';

const darkTheme = THEMES.dark;

const HEALTH: BridgeHealth = {
  status: 'ok',
  timestamp: '2026-06-01T00:00:00Z',
  uptime: 3725,
  drivers: { oracle: true, postgres: false },
  database: { size: '0.42 MB', tables: 12 },
};

describe('SystemHealthPanel', () => {
  it('shows ONLINE and renders health stats when connected', () => {
    render(<SystemHealthPanel theme={darkTheme} connected health={HEALTH} />);
    expect(screen.getByText('ONLINE')).toBeTruthy();
    expect(screen.getByText('1h 2m')).toBeTruthy(); // uptime 3725s
    expect(screen.getByText('0.42 MB')).toBeTruthy();
    expect(screen.getByText('12')).toBeTruthy();
  });

  it('shows OFFLINE and a placeholder when not connected', () => {
    render(<SystemHealthPanel theme={darkTheme} connected={false} health={null} />);
    expect(screen.getByText('OFFLINE')).toBeTruthy();
    expect(screen.getByText(/health stats unavailable/i)).toBeTruthy();
  });
});
