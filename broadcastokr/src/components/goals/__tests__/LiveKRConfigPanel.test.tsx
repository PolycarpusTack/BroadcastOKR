import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LiveKRConfigPanel } from '../LiveKRConfigPanel';
import { THEMES } from '../../../constants/themes';
import type { LiveKRConfig } from '../../../types';
import type { DBConnection, KPITemplate } from '../../../hooks/useBridge';

const theme = THEMES.light;
const connections: DBConnection[] = [
  { id: 'pg', name: 'WHATS’ON', type: 'postgres', host: 'localhost', port: 5433, service: 'brokr_rig', schema: 'psi', user: 'r', password: '***' },
  { id: 'ora', name: 'Tenant Zero DB', type: 'oracle', host: 'localhost', port: 1521, service: 'local', schema: 'PSI', user: 'r', password: '***' },
];
const templates: KPITemplate[] = [
  { name: 'Schedule Fill Rate', description: 'active vs total', sql: 'SELECT 1 AS value FROM psi.psischedule', unit: '%', direction: 'hi', target: 95, dbType: 'postgres' },
  { name: 'Schedule Fill Rate', description: 'active vs total', sql: 'SELECT 1 AS value FROM PSI.PSISCHEDULE', unit: '%', direction: 'hi', target: 95, dbType: 'oracle' },
  { name: 'Transmissions with Live Subtitling', description: 'last 30 days', sql: 'SELECT COUNT(*) AS value FROM psi.psitransmission WHERE tx_txdate >= :start_date', unit: 'tx', direction: 'hi', target: 50, timeframeDays: 30, dbType: 'postgres' },
];

function Harness({ connectionId = 'pg' }: { connectionId?: string }) {
  const [config, setConfig] = useState<LiveKRConfig>({ connectionId, sql: '', unit: 'count', direction: 'lo' });
  const [target, setTarget] = useState(100);
  return (
    <>
      <LiveKRConfigPanel
        config={config}
        target={target}
        start={0}
        onUpdateConfig={(p) => setConfig((c) => ({ ...c, ...p }))}
        onUpdateKR={(p) => { if (p.target !== undefined) setTarget(p.target); }}
        connections={connections}
        getTemplates={vi.fn().mockResolvedValue(templates)}
        getTables={vi.fn().mockResolvedValue([{ TABLE_NAME: 'psimaterialpart', NUM_ROWS: 40 }, { TABLE_NAME: 'psitransmission', NUM_ROWS: 84 }])}
        getColumns={vi.fn().mockResolvedValue([
          { COLUMN_NAME: 'mat_id', DATA_TYPE: 'integer', DATA_LENGTH: 32 },
          { COLUMN_NAME: 'mat_readyforrep', DATA_TYPE: 'integer', DATA_LENGTH: 32 },
          { COLUMN_NAME: 'mat_created', DATA_TYPE: 'timestamp without time zone', DATA_LENGTH: 8 },
        ])}
        theme={theme}
        selectStyle={{}}
        inputStyle={{}}
        labelStyle={{}}
      />
      <output data-testid="timeframe">{String(config.timeframeDays ?? '')}</output>
    </>
  );
}

describe('LiveKRConfigPanel — no-SQL paths', () => {
  it('lists only the presets for the selected connection’s dialect and applies one', async () => {
    render(<Harness />);
    const preset = await screen.findByLabelText('KR preset');
    const names = Array.from((preset as HTMLSelectElement).options).map((o) => o.textContent);
    expect(names.filter((n) => n?.includes('Schedule Fill Rate'))).toHaveLength(1);

    fireEvent.change(preset, { target: { value: 'Transmissions with Live Subtitling' } });
    expect(screen.getByLabelText('KR SQL query')).toHaveValue('SELECT COUNT(*) AS value FROM psi.psitransmission WHERE tx_txdate >= :start_date');
    expect(screen.getByLabelText('KR unit')).toHaveValue('tx');
    expect(screen.getByLabelText('KR direction')).toHaveValue('hi');
    expect(screen.getByLabelText('KR target')).toHaveValue(50);
    expect(screen.getByTestId('timeframe')).toHaveTextContent('30');
  });

  it('builds percent-where SQL from dropdowns into the editable textarea', async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Build it' }));
    const table = await screen.findByLabelText('Builder table');
    await waitFor(() => expect((table as HTMLSelectElement).options.length).toBeGreaterThan(1));
    fireEvent.change(table, { target: { value: 'psimaterialpart' } });
    fireEvent.change(screen.getByLabelText('Builder measure'), { target: { value: 'percent' } });
    const condColumn = screen.getByLabelText('Builder condition column');
    await waitFor(() => expect((condColumn as HTMLSelectElement).options.length).toBeGreaterThan(1));
    fireEvent.change(condColumn, { target: { value: 'mat_readyforrep' } });
    fireEvent.change(screen.getByLabelText('Builder value'), { target: { value: '1' } });

    await waitFor(() => expect(screen.getByLabelText('KR SQL query')).toHaveValue(
      'SELECT ROUND(100.0 * SUM(CASE WHEN mat_readyforrep = 1 THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1) AS value FROM psi.psimaterialpart',
    ));

    // A date window sets a default timeframe so the binds have a value
    fireEvent.change(screen.getByLabelText('Builder date column'), { target: { value: 'mat_created' } });
    await waitFor(() => expect((screen.getByLabelText('KR SQL query') as HTMLTextAreaElement).value).toContain('mat_created >= :start_date AND mat_created <= :end_date'));
    expect(screen.getByTestId('timeframe')).toHaveTextContent('30');

    // The textarea stays hand-editable after building
    fireEvent.change(screen.getByLabelText('KR SQL query'), { target: { value: 'SELECT 42 AS value' } });
    expect(screen.getByLabelText('KR SQL query')).toHaveValue('SELECT 42 AS value');
  });

  it('keeps Build it disabled until a connection is chosen', () => {
    render(<Harness connectionId="" />);
    expect(screen.getByRole('button', { name: 'Build it' })).toBeDisabled();
  });
});
