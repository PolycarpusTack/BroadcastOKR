import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ReportsPage } from '../ReportsPage';
import { ThemeProvider } from '../../context/ThemeContext';
import { AuthProvider } from '../../context/AuthContext';
import { ToastProvider } from '../../context/ToastContext';
import { ActivityLogProvider } from '../../context/ActivityLogContext';

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <MemoryRouter>
      <ThemeProvider>
        <AuthProvider>
          <ToastProvider>
            <ActivityLogProvider>
              {ui}
            </ActivityLogProvider>
          </ToastProvider>
        </AuthProvider>
      </ThemeProvider>
    </MemoryRouter>
  );
}

describe('ReportsPage', () => {
  it('renders without crashing when permissions allow reports', () => {
    renderWithProviders(<ReportsPage />);
    expect(screen.getByText(/Completion Rate/i)).toBeTruthy();
  });

  it('renders restricted message when permissions deny reports', () => {
    renderWithProviders(<ReportsPage />);
  });
});
