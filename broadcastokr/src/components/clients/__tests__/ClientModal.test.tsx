import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ClientModal } from '../ClientModal';
import { THEMES } from '../../../constants/themes';
import type { Client, DBConnection } from '../../../types';

// TD-2 (R6-3): the modal takes its initial state from props once per mount and
// the parent remounts it by key. Two things follow, and both are asserted here:
// a different key shows the other client, and a prop refresh mid-edit (the
// connection list reloading after "Test") no longer wipes what was typed.

const theme = THEMES.light;
const conn: DBConnection = { id: 'c1', name: 'PSI', type: 'oracle', host: 'db', port: 1521, service: 'local', schema: 'PSI', user: 'u', password: '***' };
const alpha: Client = { id: 'a', name: 'Alpha', connectionId: 'c1', color: '#111', channels: [], tags: ['tv'] };
const beta: Client = { id: 'b', name: 'Beta', connectionId: '', color: '#222', channels: [] };

function modal(client: Client | undefined, connections: DBConnection[], key: string) {
  return (
    <ClientModal
      key={key}
      open
      onClose={() => {}}
      theme={theme}
      client={client}
      connections={connections}
      templates={[]}
      onSave={() => {}}
    />
  );
}

describe('ClientModal (remount by key)', () => {
  it('starts from the client it is opened for, and a new key shows the next one', () => {
    const { rerender } = render(modal(alpha, [conn], 'a'));
    const name = screen.getByPlaceholderText('e.g. VRT, Mediagenix') as HTMLInputElement;
    expect(name.value).toBe('Alpha');
    expect((screen.getByPlaceholderText('e.g. broadcast, belgium, live') as HTMLInputElement).value).toBe('tv');

    rerender(modal(beta, [conn], 'b'));
    expect((screen.getByPlaceholderText('e.g. VRT, Mediagenix') as HTMLInputElement).value).toBe('Beta');

    rerender(modal(undefined, [conn], 'new'));
    expect((screen.getByPlaceholderText('e.g. VRT, Mediagenix') as HTMLInputElement).value).toBe('');
  });

  it('keeps what was typed when the connection list refreshes under the same key', () => {
    const { rerender } = render(modal(alpha, [conn], 'a'));
    const name = screen.getByPlaceholderText('e.g. VRT, Mediagenix') as HTMLInputElement;
    fireEvent.change(name, { target: { value: 'Alpha renamed' } });
    rerender(modal(alpha, [conn, { ...conn, id: 'c2', name: 'Second' }], 'a'));
    expect((screen.getByPlaceholderText('e.g. VRT, Mediagenix') as HTMLInputElement).value).toBe('Alpha renamed');
  });
});
