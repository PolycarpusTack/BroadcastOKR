import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { GoalsPage } from '../GoalsPage';
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

describe('GoalsPage', () => {
  it('renders without crashing', () => {
    const { container } = renderWithProviders(<GoalsPage />);
    expect(container).toBeTruthy();
  });
});
