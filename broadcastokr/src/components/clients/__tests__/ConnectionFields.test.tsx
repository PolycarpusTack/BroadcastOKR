import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ConnectionFields } from '../ConnectionFields';
import { emptyConnectionDraft, draftToConnection, type ConnectionDraft } from '../connectionDraft';
import { THEMES } from '../../../constants/themes';

const lightTheme = THEMES.light;

function Harness({ testConnection }: { testConnection?: (c: never) => Promise<{ ok: boolean; message: string }> }) {
  const [draft, setDraft] = useState<ConnectionDraft>(emptyConnectionDraft);
  return (
    <ConnectionFields
      draft={draft}
      onChange={setDraft}
      theme={lightTheme}
      connectionName="VRT"
      testConnection={testConnection as never}
    />
  );
}

describe('ConnectionFields', () => {
  it('shows Oracle fields by default and swaps them for PostgreSQL', () => {
    render(<Harness />);
    expect(screen.getByLabelText('Service Name')).toBeTruthy();
    expect(screen.getByLabelText(/Oracle Client Directory/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'postgres' } });

    expect(screen.getByLabelText('Database')).toBeTruthy();
    expect(screen.queryByLabelText(/Oracle Client Directory/)).toBeNull();
  });

  it('follows the dialect default port, but never overwrites a custom one', () => {
    render(<Harness />);
    const port = screen.getByLabelText('Port') as HTMLInputElement;
    expect(port.value).toBe('1521');

    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'postgres' } });
    expect((screen.getByLabelText('Port') as HTMLInputElement).value).toBe('5432');

    fireEvent.change(screen.getByLabelText('Port'), { target: { value: '15432' } });
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'oracle' } });
    expect((screen.getByLabelText('Port') as HTMLInputElement).value).toBe('15432');
  });

  it('reports the test verdict and clears it once the form is edited again', async () => {
    const testConnection = vi.fn().mockResolvedValue({ ok: true, message: 'Oracle connection successful' });
    render(<Harness testConnection={testConnection} />);

    // The test button only appears once there is a host to test.
    expect(screen.queryByRole('button', { name: /Test Connection/ })).toBeNull();
    fireEvent.change(screen.getByLabelText('Host'), { target: { value: 'db.example.com' } });

    fireEvent.click(screen.getByRole('button', { name: /Test Connection/ }));
    await waitFor(() => expect(screen.getByText(/Connected/)).toBeTruthy());

    // A stale "Connected" next to edited credentials would be a lie.
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'psi' } });
    expect(screen.queryByText(/Connected/)).toBeNull();
  });

  it('surfaces a failed test rather than swallowing it', async () => {
    const testConnection = vi.fn().mockResolvedValue({ ok: false, message: 'Connection test failed' });
    render(<Harness testConnection={testConnection} />);
    fireEvent.change(screen.getByLabelText('Host'), { target: { value: 'db.example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /Test Connection/ }));
    await waitFor(() => expect(screen.getByText(/Connection test failed/)).toBeTruthy());
  });
});

describe('draftToConnection', () => {
  it('drops clientDir for PostgreSQL and defaults the schema', () => {
    const draft: ConnectionDraft = {
      ...emptyConnectionDraft(),
      type: 'postgres',
      host: '  db  ',
      port: '',
      service: ' whatson ',
      schema: '',
      user: ' psi ',
      clientDir: 'C:\\Oracle',
    };
    const conn = draftToConnection(draft, 'VRT DB', 'conn_1');

    expect(conn).toMatchObject({
      id: 'conn_1', name: 'VRT DB', type: 'postgres',
      host: 'db', service: 'whatson', schema: 'PSI', user: 'psi',
    });
    expect(conn.port).toBe(5432); // empty port falls back to the dialect default
    expect(conn.clientDir).toBeUndefined();
  });
});
