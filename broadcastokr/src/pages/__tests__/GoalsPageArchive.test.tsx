import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { GoalsPage } from '../GoalsPage';
import { ThemeProvider } from '../../context/ThemeContext';
import { AuthProvider } from '../../context/AuthContext';
import { ToastProvider } from '../../context/ToastContext';
import { ActivityLogProvider } from '../../context/ActivityLogContext';
import { useStore } from '../../store/store';
import type { Goal } from '../../types';

// R6-5: archived goals are out of the list by default, one filter away,
// marked, and read-only (no edit button).

const goal = (id: string, title: string, period: string, archived?: boolean): Goal => ({
  id, title, status: 'behind', progress: 0, owner: 1, channel: 0, period, keyResults: [], archived,
});

function renderPage() {
  return render(
    <MemoryRouter>
      <ThemeProvider>
        <AuthProvider>
          <ToastProvider>
            <ActivityLogProvider>
              <GoalsPage />
            </ActivityLogProvider>
          </ToastProvider>
        </AuthProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
}

describe('GoalsPage — period archive', () => {
  beforeEach(() => {
    useStore.setState({ goals: [goal('g-live', 'Playout Q3', 'Q3 2026'), goal('g-old', 'Playout Q2', 'Q2 2026', true)], clients: [], goalTemplates: [] });
  });

  it('hides archived goals by default and shows them, read-only, under the archived filter', () => {
    renderPage();
    expect(screen.getByText('Playout Q3')).toBeTruthy();
    expect(screen.queryByText('Playout Q2')).toBeNull();

    fireEvent.change(screen.getByLabelText('Show active or archived goals'), { target: { value: 'archived' } });
    expect(screen.getByText('Playout Q2')).toBeTruthy();
    expect(screen.queryByText('Playout Q3')).toBeNull();
    expect(screen.getByText('\u{1F5C4} Archived')).toBeTruthy();
    expect(screen.queryByLabelText('Edit goal')).toBeNull();
  });

  it('archives a period from the header control and restores it from the archived view', async () => {
    renderPage();
    const archive = screen.getByLabelText('Archive period') as HTMLSelectElement;
    expect([...archive.options].map((o) => o.textContent)).toContain('Q3 2026 (1)');
    fireEvent.change(archive, { target: { value: 'Q3 2026' } });
    expect(await screen.findByText('No goals match your filters')).toBeTruthy();
    expect(useStore.getState().goals.find((g) => g.id === 'g-live')?.archived).toBe(true);

    fireEvent.change(screen.getByLabelText('Show active or archived goals'), { target: { value: 'archived' } });
    const restore = screen.getByLabelText('Restore period') as HTMLSelectElement;
    expect([...restore.options].map((o) => o.textContent)).toContain('Q3 2026 (1)');
    fireEvent.change(restore, { target: { value: 'Q2 2026' } });
    await waitFor(() => expect(screen.queryByText('Playout Q2')).toBeNull());
    expect(screen.getByText('Playout Q3')).toBeTruthy();
    expect(useStore.getState().goals.find((g) => g.id === 'g-old')?.archived).toBe(false);
  });
});
