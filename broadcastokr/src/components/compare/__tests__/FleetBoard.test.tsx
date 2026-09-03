import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FleetBoard } from '../FleetBoard';
import { THEMES } from '../../../constants/themes';
import type { FleetTenant } from '../../../utils/fleetBoard';

const theme = THEMES.light;
const recent = new Date(Date.now() - 5 * 60_000).toISOString();
const old = new Date(Date.now() - 3 * 60 * 60_000).toISOString();

const fleet: FleetTenant[] = [
  {
    tenantId: 't0', tenantName: 'Tenant Zero', color: '#000',
    metrics: [
      { krId: 'kr-a', krTemplateId: 'krt-fill', label: 'Fill rate', value: 85, target: 95, direction: 'hi', timestamp: recent, receivedAt: recent,
        history: [{ value: 80, target: 95, timestamp: old }, { value: 85, target: 95, timestamp: recent }] },
    ],
  },
  {
    tenantId: 't1', tenantName: 'Tenant One', color: '#111',
    metrics: [
      { krId: 'kr-b', krTemplateId: 'krt-fill', label: 'Fill rate', value: 96, target: 95, direction: 'hi', timestamp: old, receivedAt: old, history: [] },
      { krId: 'kr-hand', krTemplateId: null, label: null, value: 3, target: 5, direction: 'lo', timestamp: recent, receivedAt: recent, history: [] },
    ],
  },
];

describe('FleetBoard', () => {
  it('renders tenants × columns with values, a stale marker, and the id fallback for unnamed columns', () => {
    render(<FleetBoard fleet={fleet} canEdit={false} onLabel={async () => {}} theme={theme} />);
    expect(screen.getByText('Tenant Zero')).toBeTruthy();
    expect(screen.getByText('Tenant One')).toBeTruthy();
    expect(screen.getByText('Fill rate')).toBeTruthy();
    expect(screen.getByText('kr-hand')).toBeTruthy();
    expect(screen.getByText('85')).toBeTruthy();
    expect(screen.getByText('96')).toBeTruthy();
    expect(screen.getAllByTestId('stale')).toHaveLength(1);
    expect(screen.queryByText('name it')).toBeNull();
  });

  it('lets an owner name an unnamed column and rename a named one', async () => {
    const onLabel = vi.fn(async () => {});
    render(<FleetBoard fleet={fleet} canEdit onLabel={onLabel} theme={theme} />);
    fireEvent.click(screen.getByText('name it'));
    const input = screen.getByLabelText('Label for kr-hand');
    fireEvent.change(input, { target: { value: 'Hand-made on One' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(onLabel).toHaveBeenCalledWith('kr:t1:kr-hand', 'Hand-made on One'));

    fireEvent.click(screen.getByLabelText('Rename Fill rate'));
    const rename = screen.getByLabelText('Label for Fill rate');
    expect((rename as HTMLInputElement).value).toBe('Fill rate');
    fireEvent.keyDown(rename, { key: 'Escape' });
    expect(screen.queryByLabelText('Label for Fill rate')).toBeNull();
  });

  it('shows the empty state when nothing has been shared', () => {
    render(<FleetBoard fleet={[]} canEdit onLabel={async () => {}} theme={theme} />);
    expect(screen.getByText(/No tenant has shared metrics yet/)).toBeTruthy();
  });
});
